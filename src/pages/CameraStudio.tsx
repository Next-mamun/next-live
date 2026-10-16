import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Camera,
  SwitchCamera,
  Sparkles,
  Download,
  Share2,
  X,
  RotateCcw,
  Check,
  Video,
  CircleDot,
  StopCircle,
  Tv,
  ArrowLeft,
  Sliders,
  Maximize2,
  Minimize2,
  Info,
  Loader2,
  AlertCircle,
  PlusSquare,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { FilterCategory, FilterId, FilterSettings, PresetFilter } from '@/types/camera';
import {
  FILTER_DEFINITIONS,
  PRESET_FILTERS,
  INITIAL_FILTER_STATE,
} from '@/services/cameraFilters/filterDefinitions';
import { initFaceLandmarker, detectFaceLandmarks } from '@/services/cameraFilters/mediaPipeService';
import { renderAllFilters } from '@/services/cameraFilters/filterEngine';
import { FilterAdjustmentPanel } from '@/components/camera/FilterAdjustmentPanel';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';

export const CameraStudio: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Video & Canvas references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  // States
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [fps, setFps] = useState(0);
  const [showPerf, setShowPerf] = useState(false);

  // Filters State
  const [filters, setFilters] = useState<Record<FilterId, FilterSettings>>(INITIAL_FILTER_STATE);
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory | 'presets'>('makeup');
  const [activeFilterId, setActiveFilterId] = useState<FilterId | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Snapshot / Media Recording
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);

  // Fullscreen state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Keep a ref of filters to prevent closure staleness in 60fps render loop
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  /**
   * 1. Initialize MediaPipe Face Landmarker
   */
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setIsInitializing(true);
        setInitError(null);
        const landmarker = await initFaceLandmarker();
        if (isMounted) {
          landmarkerRef.current = landmarker;
          setIsInitializing(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to init MediaPipe landmarker:', err);
          setInitError(
            err?.message || 'Face Landmark model loading failed. Please check internet connection.'
          );
          setIsInitializing(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * 2. Initialize Camera Stream
   */
  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      toast.error('Camera permission was denied or device is not available.');
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode, startCamera]);

  /**
   * 3. Real-time 60 FPS Render Loop
   */
  useEffect(() => {
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (video && canvas && video.readyState >= 2 && !video.paused && !video.ended) {
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        if (videoWidth && videoHeight) {
          // Adjust canvas internal dimensions to match video aspect
          if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
            canvas.width = videoWidth;
            canvas.height = videoHeight;
          }

          const ctx = canvas.getContext('2d', { willReadFrequently: false });
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Run Face Landmark Detection when a new video frame arrives
            if (landmarker && video.currentTime !== lastVideoTimeRef.current) {
              lastVideoTimeRef.current = video.currentTime;
              const results = detectFaceLandmarks(landmarker, video, performance.now());

              if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
                setIsFaceDetected(true);
                const landmarks = results.faceLandmarks[0];

                // Render active makeup and effect overlays
                renderAllFilters(ctx, landmarks, canvas.width, canvas.height, filtersRef.current);
              } else {
                setIsFaceDetected(false);
              }
            }
          }
        }

        // FPS calculation
        frameCount++;
        const now = performance.now();
        if (now - lastFpsUpdate >= 1000) {
          setFps(Math.round((frameCount * 1000) / (now - lastFpsUpdate)));
          frameCount = 0;
          lastFpsUpdate = now;
        }
      }

      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, []);

  /**
   * 4. Filter Control Handlers
   */
  const handleSelectFilter = (id: FilterId) => {
    if (activeFilterId === id) {
      setActiveFilterId(null);
    } else {
      setActiveFilterId(id);
      // Auto enable item when selected
      setFilters((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          enabled: true,
        },
      }));
    }
  };

  const handleUpdateFilter = (id: FilterId, updates: Partial<FilterSettings>) => {
    setFilters((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...updates,
      },
    }));
  };

  const handleResetFilter = (id: FilterId) => {
    const def = FILTER_DEFINITIONS.find((d) => d.id === id);
    if (def) {
      setFilters((prev) => ({
        ...prev,
        [id]: { ...def.defaultSettings, enabled: true },
      }));
      toast.success(`${def.nameBn} সেটিংস রিসেট করা হয়েছে`);
    }
  };

  const handleApplyPreset = (preset: PresetFilter) => {
    setActivePresetId(preset.id);
    if (preset.id === 'none') {
      handleClearAll();
      return;
    }

    setFilters((prev) => {
      // First disable all
      const nextState: Record<FilterId, FilterSettings> = { ...prev };
      (Object.keys(nextState) as FilterId[]).forEach((key) => {
        nextState[key] = { ...nextState[key], enabled: false };
      });

      // Apply preset items
      Object.entries(preset.filters).forEach(([fId, settings]) => {
        const id = fId as FilterId;
        if (nextState[id]) {
          nextState[id] = {
            ...nextState[id],
            ...settings,
            enabled: true,
          };
        }
      });
      return nextState;
    });

    toast.success(`লুক "${preset.nameBn}" প্রয়োগ করা হয়েছে!`);
  };

  const handleClearAll = () => {
    setFilters((prev) => {
      const reset: Record<FilterId, FilterSettings> = { ...prev };
      (Object.keys(reset) as FilterId[]).forEach((key) => {
        reset[key] = { ...reset[key], enabled: false };
      });
      return reset;
    });
    setActiveFilterId(null);
    setActivePresetId(null);
    toast.info('সব ফিল্টার বন্ধ করা হয়েছে');
  };

  /**
   * 5. Capture Photo Snapshot
   */
  const handleCaptureSnapshot = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) return;

      // Draw mirrored video if selfie camera
      if (facingMode === 'user') {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -exportCanvas.width, 0, exportCanvas.width, exportCanvas.height);
        ctx.drawImage(canvas, -exportCanvas.width, 0, exportCanvas.width, exportCanvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, exportCanvas.width, exportCanvas.height);
        ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
      }

      const dataUrl = exportCanvas.toDataURL('image/png', 0.95);
      setCapturedImage(dataUrl);

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 },
      });
      toast.success('ছবি তোলা হয়েছে!');
    } catch (err) {
      console.error('Snapshot capture error:', err);
      toast.error('Failed to capture snapshot');
    }
  };

  const handleDownloadSnapshot = () => {
    if (!capturedImage) return;
    const link = document.createElement('a');
    link.href = capturedImage;
    link.download = `next-filter-${Date.now()}.png`;
    link.click();
    toast.success('ছবি ডাউনলোড সম্পন্ন হয়েছে!');
  };

  const handleShareSnapshot = async () => {
    if (!capturedImage) return;
    try {
      const blob = await (await fetch(capturedImage)).blob();
      const file = new File([blob], `filter-photo-${Date.now()}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Next Camera Filter Photo',
          text: 'Check out my AR filter photo taken on Next!',
        });
      } else {
        handleDownloadSnapshot();
      }
    } catch (e) {
      handleDownloadSnapshot();
    }
  };

  const handleCreatePostWithPhoto = () => {
    if (!capturedImage) return;
    sessionStorage.setItem('pending_post_photo', capturedImage);
    navigate('/create-post');
  };

  /**
   * 6. Video Recording Mode (MediaRecorder)
   */
  const handleToggleRecord = () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      clearInterval(recordTimerRef.current);
      setIsRecording(false);
      setRecordSeconds(0);
    } else {
      // Start recording
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      try {
        const stream = canvas.captureStream(30);
        recordedChunksRef.current = [];

        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm',
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `next-filter-video-${Date.now()}.webm`;
          link.click();
          toast.success('ভিডিও সেভ করা হয়েছে!');
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordSeconds(0);

        recordTimerRef.current = setInterval(() => {
          setRecordSeconds((s) => s + 1);
        }, 1000);
      } catch (err) {
        console.error('Recording error:', err);
        toast.error('Video recording is not supported on this browser.');
      }
    }
  };

  /**
   * 7. Fullscreen Toggle
   */
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const isMirrored = facingMode === 'user';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[120] bg-black text-white flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Top Header Floating Controls */}
      <div className="absolute top-0 left-0 right-0 z-30 p-4 pt-safe flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        {/* Left: Back / Theatre link */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2.5 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md text-white border border-white/10 transition-colors flex items-center gap-1.5"
            title="Go Back"
          >
            <ArrowLeft size={20} />
          </button>

          <button
            type="button"
            onClick={() => navigate('/cinema')}
            className="px-3 py-2 rounded-full bg-purple-600/80 hover:bg-purple-600 backdrop-blur-md text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-purple-900/30"
            title="Go to Theatre / Watch Party"
          >
            <Tv size={16} />
            <span>Theatre</span>
          </button>
        </div>

        {/* Center: Face Detection & FPS Indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md border transition-all flex items-center gap-1.5 ${
              isFaceDetected
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isFaceDetected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{isFaceDetected ? 'মুখ চিহ্নিত (Face Ready)' : 'মুখ খুঁজছে...'}</span>
          </div>

          {showPerf && (
            <div className="px-2 py-1 rounded-full text-[10px] font-mono bg-black/60 border border-white/10 text-gray-300">
              {fps} FPS
            </div>
          )}
        </div>

        {/* Right: Camera Flip, Fullscreen, Info */}
        <div className="flex items-center gap-2">
          {/* Flip Camera */}
          <button
            type="button"
            onClick={() => setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
            className="p-2.5 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md text-white border border-white/10 transition-colors"
            title="Switch Camera (Front/Rear)"
          >
            <SwitchCamera size={20} />
          </button>

          {/* Toggle Perf display */}
          <button
            type="button"
            onClick={() => setShowPerf((v) => !v)}
            className={`p-2.5 rounded-full backdrop-blur-md border transition-colors ${
              showPerf ? 'bg-pink-500 text-white border-pink-400' : 'bg-black/50 text-white border-white/10'
            }`}
            title="Toggle Performance Stats"
          >
            <Sliders size={20} />
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md text-white border border-white/10 transition-colors hidden sm:flex"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-zinc-950">
        {/* Hidden / Background video element */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-200 ${
            isMirrored ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* AR Canvas Overlay */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-200 ${
            isMirrored ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* Loading Spinner during MediaPipe Model Initialization */}
        {isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md z-20 space-y-3">
            <Loader2 size={44} className="animate-spin text-pink-500" />
            <p className="font-bold text-sm text-gray-200">
              MediaPipe এআই ফিল্টার প্রস্তুত হচ্ছে...
            </p>
            <p className="text-xs text-gray-400">Loading Google Face Landmarker Model</p>
          </div>
        )}

        {/* Init Error Card */}
        {initError && (
          <div className="absolute inset-x-4 top-24 max-w-md mx-auto p-4 rounded-2xl bg-red-950/90 border border-red-500/40 backdrop-blur-md z-30 text-center space-y-2">
            <AlertCircle size={28} className="mx-auto text-red-400" />
            <h4 className="font-bold text-sm text-white">মডেল লোড হতে সমস্যা হয়েছে</h4>
            <p className="text-xs text-red-200">{initError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-500 rounded-xl text-xs font-bold text-white transition-colors"
            >
              পুনরায় চেষ্টা করুন (Retry)
            </button>
          </div>
        )}

        {/* Floating Capture Shutter & Recording Controls */}
        <div className="absolute bottom-60 sm:bottom-56 left-0 right-0 z-20 flex items-center justify-center gap-6 pointer-events-auto">
          {/* Video Record Toggle */}
          <button
            type="button"
            onClick={handleToggleRecord}
            className={`p-3 rounded-full backdrop-blur-md transition-all ${
              isRecording
                ? 'bg-red-600 text-white animate-pulse scale-110 shadow-lg shadow-red-500/50'
                : 'bg-black/60 hover:bg-black/80 text-white border border-white/20 hover:scale-105'
            }`}
            title={isRecording ? 'Stop Recording' : 'Record Video'}
          >
            {isRecording ? <StopCircle size={26} /> : <Video size={24} />}
          </button>

          {/* Main Shutter Snapshot Button */}
          <button
            type="button"
            onClick={handleCaptureSnapshot}
            className="w-20 h-20 rounded-full p-1 bg-white/20 backdrop-blur-sm border-4 border-white hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center justify-center group"
            title="Take Photo"
          >
            <div className="w-full h-full rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 group-hover:from-pink-400 group-hover:to-rose-300 transition-all flex items-center justify-center">
              <Camera size={30} className="text-white drop-shadow-md" />
            </div>
          </button>

          {/* Preset Quick Shuffler */}
          <button
            type="button"
            onClick={() => {
              const presets = PRESET_FILTERS;
              const currentIndex = presets.findIndex((p) => p.id === activePresetId);
              const nextPreset = presets[(currentIndex + 1) % presets.length];
              handleApplyPreset(nextPreset);
            }}
            className="p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md transition-all hover:scale-105"
            title="Cycle Next Preset"
          >
            <Sparkles size={24} className="text-amber-400" />
          </button>
        </div>

        {/* Recording Timer Badge */}
        {isRecording && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-red-600/90 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>REC {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}</span>
          </div>
        )}
      </div>

      {/* Bottom Interactive Adjustment Panel (Snapchat / TikTok style) */}
      <div className="relative z-30 w-full">
        <FilterAdjustmentPanel
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          activeFilterId={activeFilterId}
          onSelectFilter={handleSelectFilter}
          filters={filters}
          onUpdateFilter={handleUpdateFilter}
          onResetFilter={handleResetFilter}
          onApplyPreset={handleApplyPreset}
          activePresetId={activePresetId}
          onClearAll={handleClearAll}
        />
      </div>

      {/* Snapshot Preview & Share Modal */}
      {capturedImage && (
        <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative max-w-sm w-full bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <Sparkles size={16} className="text-pink-400" />
                ক্যামেরা ফিল্টার ছবি (Snapshot)
              </h3>
              <button
                type="button"
                onClick={() => setCapturedImage(null)}
                className="p-1.5 rounded-full bg-white/10 text-gray-300 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Photo preview */}
            <div className="relative bg-black flex items-center justify-center p-2">
              <img
                src={capturedImage}
                alt="Captured AR Filter"
                className="max-h-[60vh] w-auto rounded-2xl object-contain shadow-lg"
              />
            </div>

            {/* Action Buttons */}
            <div className="p-4 space-y-2 bg-zinc-900">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSnapshot}
                  className="py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Download size={16} />
                  <span>ডাউনলোড (Save)</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareSnapshot}
                  className="py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Share2 size={16} />
                  <span>শেয়ার (Share)</span>
                </button>
              </div>

              {/* Create Post directly with this picture */}
              <button
                type="button"
                onClick={handleCreatePostWithPhoto}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-pink-500/25 transition-all"
              >
                <PlusSquare size={18} />
                <span>নতুন পোস্ট হিসেবে শেয়ার করুন</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraStudio;
