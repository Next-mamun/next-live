import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { LandmarkPoint } from './types';

class FaceLandmarkerService {
  private static instance: FaceLandmarkerService | null = null;
  private landmarker: FaceLandmarker | null = null;
  private isInitializing: boolean = false;
  private initPromise: Promise<FaceLandmarker | null> | null = null;
  private lastVideoTime: number = -1;

  public static getInstance(): FaceLandmarkerService {
    if (!FaceLandmarkerService.instance) {
      FaceLandmarkerService.instance = new FaceLandmarkerService();
    }
    return FaceLandmarkerService.instance;
  }

  public async getLandmarker(): Promise<FaceLandmarker | null> {
    if (this.landmarker) return this.landmarker;
    if (this.isInitializing && this.initPromise) return this.initPromise;

    this.isInitializing = true;
    this.initPromise = (async () => {
      try {
        // Load MediaPipe vision WASM files
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        // Try initializing with GPU delegate first
        try {
          this.landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          });
        } catch (gpuError) {
          console.warn('MediaPipe GPU initialization failed, falling back to CPU:', gpuError);
          // Fallback to CPU delegate for mobile WebViews or restricted browser environments
          this.landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          });
        }

        return this.landmarker;
      } catch (err) {
        console.error('Failed to load FaceLandmarker:', err);
        return null;
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  public detectFace(video: HTMLVideoElement): LandmarkPoint[] | null {
    if (!this.landmarker) return null;
    if (video.readyState < 2 || video.paused || video.ended) return null;

    try {
      const currentTime = video.currentTime;
      if (currentTime !== this.lastVideoTime) {
        this.lastVideoTime = currentTime;
        const result = this.landmarker.detectForVideo(video, performance.now());
        if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
          return result.faceLandmarks[0] as LandmarkPoint[];
        }
      }
    } catch (e) {
      // In case of frame drop or timestamp drift, fail silently without crashing render loop
    }
    return null;
  }

  public isReady(): boolean {
    return this.landmarker !== null;
  }
}

export default FaceLandmarkerService.getInstance();
