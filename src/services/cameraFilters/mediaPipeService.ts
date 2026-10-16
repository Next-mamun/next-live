import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

let landmarkerInstance: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker> | null = null;

export async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerInstance) return landmarkerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const fileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      // Attempt GPU acceleration first for 60 FPS performance
      try {
        landmarkerInstance = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        return landmarkerInstance;
      } catch (gpuError) {
        console.warn('[FaceLandmarker] GPU delegate unavailable, falling back to CPU:', gpuError);
        landmarkerInstance = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        return landmarkerInstance;
      }
    } catch (err) {
      initPromise = null;
      console.error('[FaceLandmarker] Initialization failed:', err);
      throw err;
    }
  })();

  return initPromise;
}

export function detectFaceLandmarks(
  landmarker: FaceLandmarker,
  videoElement: HTMLVideoElement,
  timestampMs: number
): FaceLandmarkerResult | null {
  if (!landmarker || !videoElement || videoElement.readyState < 2) {
    return null;
  }
  try {
    return landmarker.detectForVideo(videoElement, timestampMs);
  } catch (err) {
    // If consecutive frames are processed with same or backwards timestamp, ignore error gracefully
    return null;
  }
}
