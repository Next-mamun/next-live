import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  RotateCcw,
  Camera,
  Video,
  Download,
  Check,
  Sparkles,
  Sliders,
  FlipHorizontal,
  Zap,
  ZapOff,
  Eye,
  RefreshCw,
} from 'lucide-react';
import FaceLandmarkerService from './FaceLandmarkerService';
import { AnyFilterId, FilterCategory, FilterItemDef, FilterSettings, LandmarkPoint } from './types';
import {
  LipstickIcon,
  BlushIcon,
  EyelinerIcon,
  EyeshadowIcon,
  BeautySmoothIcon,
  CatEarsIcon,
  SunglassesIcon,
  CyberMaskIcon,
  AngelHaloIcon,
  DevilHornsIcon,
  CompareIcon,
} from './icons';
import {
  renderLipstick,
  renderBlush,
  renderEyeliner,
  renderEyeshadow,
  renderBeautySmooth,
} from './filters/makeupRenderer';
import {
  renderCatEarsAndFace,
  renderSunglasses,
  renderCyberMask,
  renderAngelHalo,
  renderDevilHorns,
} from './filters/effectsRenderer';
import { AdjustmentDrawer } from './AdjustmentDrawer';

interface CameraStudioModalProps {
  onCapture: (mediaUrl: string, type: 'image' | 'video') => void;
  onCancel: () => void;
}

// Complete Filter Definitions
export const FILTER_ITEMS: FilterItemDef[] = [
  // CATEGORY 1: MAKEUP
  {
    id: 'lipstick',
    name: 'Lipstick',
    category: 'makeup',
    description: 'Cosmetic lip tint with gloss finish',
    defaultSettings: { intensity: 75, opacity: 80, blur: 2, color: '#d93859' },
    colorPalette: ['#d93859', '#b8143d', '#ff4d6d', '#8b1e3f', '#c97a7e', '#df7373', '#943855', '#4a1525'],
  },
  {
    id: 'blush',
    name: 'Blush',
    category: 'makeup',
    description: 'Cheek color with soft radial diffusion',
    defaultSettings: { intensity: 70, opacity: 75, blur: 10, color: '#ff708a' },
    colorPalette: ['#ff708a', '#ff9aa2', '#e26d5c', '#f4a261', '#ff5d8f', '#c77dff', '#e07a5f', '#d90429'],
  },
  {
    id: 'eyeliner',
    name: 'Eyeliner',
    category: 'makeup',
    description: 'Winged precision liquid lash liner',
    defaultSettings: { intensity: 85, opacity: 90, blur: 0, color: '#111111' },
    colorPalette: ['#111111', '#22223b', '#3d0c02', '#14213d', '#03045e', '#2b2d42', '#38040e', '#3a5a40'],
  },
  {
    id: 'eyeshadow',
    name: 'Eyeshadow',
    category: 'makeup',
    description: 'Smoky contoured eyelid gradient',
    defaultSettings: { intensity: 65, opacity: 70, blur: 8, color: '#a37081' },
    colorPalette: ['#a37081', '#6d597a', '#b56576', '#e56b6f', '#eaac8b', '#7b2cbf', '#2a6f97', '#b08968'],
  },
  {
    id: 'beauty_smooth',
    name: 'Skin Glow',
    category: 'makeup',
    description: 'Soft-focus studio skin smoothing',
    defaultSettings: { intensity: 60, opacity: 65, blur: 8, color: '#ffdfba' },
    colorPalette: ['#ffdfba', '#ffd1dc', '#f8edeb', '#faedcd', '#f3c68f', '#d4a373', '#e0afa0', '#ffe5d9'],
  },

  // CATEGORY 2: EFFECTS
  {
    id: 'cat_ears',
    name: 'Cat Ears',
    category: 'effects',
    description: '3D feline ears, nose & whiskers',
    defaultSettings: { intensity: 90, opacity: 95, blur: 0, color: '#ff7597' },
    colorPalette: ['#ff7597', '#3a3a3a', '#ffffff', '#e07a5f', '#9d4edd', '#00f5d4', '#ffd166', '#ff006e'],
  },
  {
    id: 'sunglasses',
    name: 'Shades',
    category: 'effects',
    description: '3D specular reflective shades',
    defaultSettings: { intensity: 85, opacity: 90, blur: 0, color: '#00f0ff' },
    colorPalette: ['#00f0ff', '#ff007f', '#ffd700', '#101010', '#7b2cbf', '#00ff88', '#ff3333', '#ffffff'],
  },
  {
    id: 'cyber_mask',
    name: 'Cyber Mask',
    category: 'effects',
    description: 'Futuristic geometric neon visor',
    defaultSettings: { intensity: 85, opacity: 90, blur: 0, color: '#ff0055' },
    colorPalette: ['#ff0055', '#00f5d4', '#9d4edd', '#f72585', '#ffd166', '#4cc9f0', '#ffffff', '#111111'],
  },
  {
    id: 'angel_halo',
    name: 'Angel Halo',
    category: 'effects',
    description: 'Celestial radiant floating halo',
    defaultSettings: { intensity: 90, opacity: 95, blur: 0, color: '#ffd700' },
    colorPalette: ['#ffd700', '#00f5ff', '#ff00aa', '#ffffff', '#c77dff', '#70e000', '#ffb703', '#fb5607'],
  },
  {
    id: 'devil_horns',
    name: 'Horns',
    category: 'effects',
    description: 'Curved volcanic ember horns',
    defaultSettings: { intensity: 85, opacity: 90, blur: 0, color: '#ff1e27' },
    colorPalette: ['#ff1e27', '#9d4edd', '#00f5d4', '#ff007f', '#ff9e00', '#ffffff', '#000000', '#3a86ff'],
  },
];

export const CameraStudioModal: React.FC<CameraStudioModalProps> = ({ onCapture, onCancel }) => {
  // Streams & DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Camera Settings
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState(true);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // AI Face Landmarks engine status
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [isAiReady, setIsAiReady] = useState(false);

  // Active Category & Filter State
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('makeup');
  const [selectedFilterId, setSelectedFilterId] = useState<AnyFilterId>('lipstick');
  const [filterSettingsMap, setFilterSettingsMap] = useState<Record<string, FilterSettings>>(() => {
    const map: Record<string, FilterSettings> = {};
    FILTER_ITEMS.forEach((item) => {
      map[item.id] = { ...item.defaultSettings };
    });
    return map;
  });

  // UI state
  const [showDrawer, setShowDrawer] = useState(true);
  const [isComparing, setIsComparing] = useState(false);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimerRef = useRef<any>(null);

  // Keep ref of latest settings so requestAnimationFrame loop reads at 60fps without lag
  const settingsRef = useRef(filterSettingsMap);
  settingsRef.current = filterSettingsMap;
  const activeFilterIdRef = useRef(selectedFilterId);
  activeFilterIdRef.current = selectedFilterId;
  const isComparingRef = useRef(isComparing);
  isComparingRef.current = isComparing;

  // Active filter definition
  const activeFilterDef = FILTER_ITEMS.find((f) => f.id === selectedFilterId);

  // Initialize MediaPipe AI Face Landmarker
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const landmarker = await FaceLandmarkerService.getLandmarker();
        if (isMounted && landmarker) {
          setIsAiReady(true);
        }
      } catch (err) {
        console.error('AI Landmarker load error:', err);
      } finally {
        if (isMounted) setIsAiLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize Camera Stream
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        setCameraError(null);
        setIsCameraReady(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => {
              setIsCameraReady(true);
            }).catch(() => {});
          };
        }
      } catch (err: any) {
        console.error('Camera stream error:', err);
        setCameraError('Unable to access camera. Please allow camera permissions.');
      }
    };

    startCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode]);

  // Main 60 FPS Render Loop
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let isRunning = true;

    const renderLoop = () => {
      if (!isRunning) return;

      if (video.readyState >= 2 && !video.paused && !video.ended) {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;

        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, vw, vh);

          const currentFilter = activeFilterIdRef.current;
          const comparing = isComparingRef.current;

          // If comparing or no filter selected, skip rendering overlays
          if (currentFilter !== 'none' && !comparing) {
            const landmarks = FaceLandmarkerService.detectFace(video);
            if (landmarks && landmarks.length >= 468) {
              const settings = settingsRef.current[currentFilter] || {
                intensity: 80,
                opacity: 80,
                blur: 2,
                color: '#ff0055',
              };

              // Route to appropriate filter renderer
              switch (currentFilter) {
                // Makeup category
                case 'lipstick':
                  renderLipstick(ctx, landmarks, vw, vh, settings);
                  break;
                case 'blush':
                  renderBlush(ctx, landmarks, vw, vh, settings);
                  break;
                case 'eyeliner':
                  renderEyeliner(ctx, landmarks, vw, vh, settings);
                  break;
                case 'eyeshadow':
                  renderEyeshadow(ctx, landmarks, vw, vh, settings);
                  break;
                case 'beauty_smooth':
                  renderBeautySmooth(ctx, landmarks, vw, vh, settings);
                  break;

                // Effects category
                case 'cat_ears':
                  renderCatEarsAndFace(ctx, landmarks, vw, vh, settings);
                  break;
                case 'sunglasses':
                  renderSunglasses(ctx, landmarks, vw, vh, settings);
                  break;
                case 'cyber_mask':
                  renderCyberMask(ctx, landmarks, vw, vh, settings);
                  break;
                case 'angel_halo':
                  renderAngelHalo(ctx, landmarks, vw, vh, settings);
                  break;
                case 'devil_horns':
                  renderDevilHorns(ctx, landmarks, vw, vh, settings);
                  break;
              }
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isCameraReady]);

  // Flip Camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Toggle Torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const capabilities: any = videoTrack.getCapabilities?.() || {};
        if (capabilities.torch) {
          const nextState = !isTorchOn;
          await (videoTrack as any).applyConstraints({
            advanced: [{ torch: nextState }],
          });
          setIsTorchOn(nextState);
        }
      } catch (e) {
        console.warn('Torch constraint not supported', e);
      }
    }
  };

  // Take Photo: Composite Video Frame + Canvas Overlays
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video) return;

    const exportCanvas = document.createElement('canvas');
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    exportCanvas.width = vw;
    exportCanvas.height = vh;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    // Mirror export if front camera is in selfie mirror mode
    if (facingMode === 'user' && isMirrored) {
      ctx.translate(vw, 0);
      ctx.scale(-1, 1);
    }

    // 1. Draw raw video feed
    ctx.drawImage(video, 0, 0, vw, vh);

    // 2. Draw canvas filter overlays
    if (canvas && selectedFilterId !== 'none' && !isComparing) {
      ctx.drawImage(canvas, 0, 0, vw, vh);
    }
    ctx.restore();

    const dataUrl = exportCanvas.toDataURL('image/jpeg', 0.95);
    setCapturedPreview(dataUrl);
  }, [facingMode, isMirrored, selectedFilterId, isComparing]);

  // Video Recording handlers
  const startRecording = () => {
    if (!streamRef.current) return;
    try {
      const recorder = new MediaRecorder(streamRef.current);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            onCapture(reader.result, 'video');
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordDuration(0);

      recordTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Video recording failed:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
    }
  };

  // Filter change & parameter update
  const handleSelectFilter = (id: AnyFilterId) => {
    setSelectedFilterId(id);
    if (id !== 'none') {
      setShowDrawer(true);
    }
  };

  const handleUpdateSettings = (updated: FilterSettings) => {
    if (!activeFilterDef) return;
    setFilterSettingsMap((prev) => ({
      ...prev,
      [activeFilterDef.id]: updated,
    }));
  };

  const handleResetSettings = () => {
    if (!activeFilterDef) return;
    setFilterSettingsMap((prev) => ({
      ...prev,
      [activeFilterDef.id]: { ...activeFilterDef.defaultSettings },
    }));
  };

  const handleAcceptPhoto = () => {
    if (capturedPreview) {
      onCapture(capturedPreview, 'image');
    }
  };

  const handleDownloadPhoto = () => {
    if (!capturedPreview) return;
    const a = document.createElement('a');
    a.href = capturedPreview;
    a.download = `studio-capture-${Date.now()}.jpg`;
    a.click();
  };

  const currentCategoryFilters = FILTER_ITEMS.filter((f) => f.category === activeCategory);

  const getFilterIcon = (id: AnyFilterId, color: string) => {
    switch (id) {
      case 'lipstick':
        return <LipstickIcon size={22} color={color} />;
      case 'blush':
        return <BlushIcon size={22} color={color} />;
      case 'eyeliner':
        return <EyelinerIcon size={22} color={color} />;
      case 'eyeshadow':
        return <EyeshadowIcon size={22} color={color} />;
      case 'beauty_smooth':
        return <BeautySmoothIcon size={22} color={color} />;
      case 'cat_ears':
        return <CatEarsIcon size={22} color={color} />;
      case 'sunglasses':
        return <SunglassesIcon size={22} color={color} />;
      case 'cyber_mask':
        return <CyberMaskIcon size={22} color={color} />;
      case 'angel_halo':
        return <AngelHaloIcon size={22} color={color} />;
      case 'devil_horns':
        return <DevilHornsIcon size={22} color={color} />;
      default:
        return <Sparkles size={22} className="text-gray-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-between select-none overflow-hidden font-sans">
      {/* Viewfinder Container */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {/* HTML5 Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-transform duration-200 ${
            facingMode === 'user' && isMirrored ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* 60 FPS Filter Overlay Canvas */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-200 ${
            facingMode === 'user' && isMirrored ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* Loading AI Engine Banner */}
        {isAiLoading && (
          <div className="absolute top-20 bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 flex items-center gap-2 text-xs text-white">
            <RefreshCw size={13} className="animate-spin text-blue-400" />
            <span>Loading AI Face Engine...</span>
          </div>
        )}

        {/* Camera Error State */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/90 text-center">
            <p className="text-red-400 font-semibold mb-3">{cameraError}</p>
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 rounded-full bg-white/20 text-white font-medium hover:bg-white/30"
            >
              Close Camera
            </button>
          </div>
        )}

        {/* Top Controls Toolbar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 pointer-events-auto">
          {/* Close button */}
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/70 active:scale-95 transition-all shadow-lg"
            title="Close"
          >
            <X size={20} />
          </button>

          {/* Quick status / recording timer */}
          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-600/90 rounded-full text-white text-xs font-bold animate-pulse shadow-md">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>
                {Math.floor(recordDuration / 60)}:{(recordDuration % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}

          {/* Action icons group */}
          <div className="flex items-center gap-2">
            {/* Mirror toggle for selfie */}
            {facingMode === 'user' && (
              <button
                type="button"
                onClick={() => setIsMirrored(!isMirrored)}
                className={`w-10 h-10 rounded-full backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/70 active:scale-95 transition-all shadow-lg ${
                  isMirrored ? 'bg-blue-600/70 text-white' : 'bg-black/45'
                }`}
                title="Mirror Camera"
              >
                <FlipHorizontal size={18} />
              </button>
            )}

            {/* Torch toggle */}
            <button
              type="button"
              onClick={toggleTorch}
              className={`w-10 h-10 rounded-full backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/70 active:scale-95 transition-all shadow-lg ${
                isTorchOn ? 'bg-amber-500/80 text-white' : 'bg-black/45'
              }`}
              title="Torch / Light"
            >
              {isTorchOn ? <Zap size={18} /> : <ZapOff size={18} />}
            </button>

            {/* Switch Camera */}
            <button
              type="button"
              onClick={toggleFacingMode}
              className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/70 active:scale-95 transition-all shadow-lg"
              title="Switch Camera"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </div>

        {/* Floating Side Tools: Hold to Compare */}
        {selectedFilterId !== 'none' && (
          <div className="absolute right-4 top-20 flex flex-col items-center gap-3 z-20 pointer-events-auto">
            <button
              type="button"
              onMouseDown={() => setIsComparing(true)}
              onMouseUp={() => setIsComparing(false)}
              onTouchStart={() => setIsComparing(true)}
              onTouchEnd={() => setIsComparing(false)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl backdrop-blur-md border text-xs font-semibold shadow-xl transition-all ${
                isComparing
                  ? 'bg-amber-500 text-black border-amber-300 scale-105'
                  : 'bg-black/50 text-white border-white/15 hover:bg-black/70'
              }`}
              title="Hold to view original without filters"
            >
              <CompareIcon size={20} />
              <span className="text-[10px] tracking-tight whitespace-nowrap">Compare</span>
            </button>

            {/* Toggle adjustment drawer if hidden */}
            {!showDrawer && (
              <button
                type="button"
                onClick={() => setShowDrawer(true)}
                className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/70 active:scale-95 transition-all shadow-lg"
                title="Open Adjustments"
              >
                <Sliders size={18} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls Area (Drawer + Filter Carousels + Shutter) */}
      <div className="absolute bottom-0 inset-x-0 z-30 flex flex-col items-center pointer-events-auto max-w-lg mx-auto w-full">
        {/* Interactive Adjustment Drawer (Snapchat / TikTok Style Sliders) */}
        {showDrawer && activeFilterDef && selectedFilterId !== 'none' && (
          <AdjustmentDrawer
            filter={activeFilterDef}
            settings={filterSettingsMap[activeFilterDef.id] || activeFilterDef.defaultSettings}
            onChange={handleUpdateSettings}
            onReset={handleResetSettings}
            onClose={() => setShowDrawer(false)}
          />
        )}

        {/* Carousel & Shutter Section */}
        <div className="w-full bg-gradient-to-t from-black via-black/80 to-transparent pt-3 pb-6 px-4 flex flex-col items-center">
          {/* Category Tabs: Makeup & Effects */}
          <div className="flex items-center gap-2 mb-3 bg-black/60 backdrop-blur-xl p-1 rounded-full border border-white/15 shadow-md">
            <button
              type="button"
              onClick={() => setActiveCategory('makeup')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeCategory === 'makeup'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Makeup
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('effects')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeCategory === 'effects'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Effects
            </button>
          </div>

          {/* Filter Items Carousel */}
          <div className="flex items-center gap-3 overflow-x-auto w-full py-2 px-2 scrollbar-hide justify-center mb-4">
            {/* None / Original Filter Option */}
            <button
              type="button"
              onClick={() => handleSelectFilter('none')}
              className={`flex flex-col items-center gap-1.5 shrink-0 transition-transform ${
                selectedFilterId === 'none' ? 'scale-110' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center border-2 backdrop-blur-md transition-all ${
                  selectedFilterId === 'none'
                    ? 'border-white bg-white/20 ring-2 ring-white/50'
                    : 'border-white/20 bg-black/40'
                }`}
              >
                <span className="text-xs font-bold text-white">None</span>
              </div>
              <span className="text-[11px] font-medium text-gray-300">Natural</span>
            </button>

            {/* Category Filter Items */}
            {currentCategoryFilters.map((filter) => {
              const isSelected = selectedFilterId === filter.id;
              const currentSettings = filterSettingsMap[filter.id] || filter.defaultSettings;

              return (
                <button
                  type="button"
                  key={filter.id}
                  onClick={() => handleSelectFilter(filter.id)}
                  className={`flex flex-col items-center gap-1.5 shrink-0 transition-transform ${
                    isSelected ? 'scale-110' : 'opacity-75 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  <div
                    className={`relative w-14 h-14 rounded-full flex items-center justify-center border-2 backdrop-blur-md transition-all ${
                      isSelected
                        ? 'border-white bg-white/20 ring-2 ring-[#1877F2] shadow-[0_0_15px_rgba(24,119,242,0.4)]'
                        : 'border-white/20 bg-black/50'
                    }`}
                  >
                    {getFilterIcon(filter.id, isSelected ? '#ffffff' : currentSettings.color)}

                    {/* Active color dot badge */}
                    <div
                      className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border border-black/80 shadow-sm"
                      style={{ backgroundColor: currentSettings.color }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-semibold tracking-wide ${
                      isSelected ? 'text-white' : 'text-gray-300'
                    }`}
                  >
                    {filter.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Shutter Capture Button Bar */}
          <div className="flex items-center justify-center gap-10 w-full mt-1">
            {/* Video Record Shutter */}
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-14 h-14 rounded-full border-2 border-white/60 flex items-center justify-center transition-all ${
                isRecording ? 'bg-red-600 scale-110 border-red-400' : 'bg-black/40 hover:bg-black/60'
              }`}
              title={isRecording ? 'Stop Recording' : 'Record Video Clip'}
            >
              <Video size={22} className="text-white" />
            </button>

            {/* Photo Snap Shutter */}
            <button
              type="button"
              onClick={capturePhoto}
              className="relative w-20 h-20 rounded-full border-4 border-white/90 p-1 flex items-center justify-center transition-all active:scale-90 hover:scale-105 shadow-2xl"
              title="Take Photo"
            >
              <div className="w-full h-full rounded-full bg-white transition-all active:bg-gray-200" />
            </button>

            {/* Empty balance spacer for centered composition */}
            <div className="w-14 h-14 flex items-center justify-center opacity-0 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Captured Photo Review Modal */}
      {capturedPreview && (
        <div className="fixed inset-0 z-[1100] bg-black flex flex-col justify-between p-4 animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between z-10">
            <button
              type="button"
              onClick={() => setCapturedPreview(null)}
              className="p-3 bg-black/60 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-black/80"
              title="Retake"
            >
              <X size={20} />
            </button>
            <span className="text-sm font-bold text-white tracking-wide">Photo Preview</span>
            <button
              type="button"
              onClick={handleDownloadPhoto}
              className="p-3 bg-black/60 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-black/80"
              title="Download Image"
            >
              <Download size={20} />
            </button>
          </div>

          {/* Captured Image Display */}
          <div className="flex-1 my-3 relative rounded-2xl overflow-hidden flex items-center justify-center bg-zinc-950 border border-white/10 shadow-2xl">
            <img
              src={capturedPreview}
              alt="Studio Capture"
              className="w-full h-full object-contain"
            />
          </div>

          {/* Bottom Review Action Buttons */}
          <div className="flex items-center gap-3 z-10">
            <button
              type="button"
              onClick={() => setCapturedPreview(null)}
              className="flex-1 py-3.5 rounded-full bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all border border-white/15"
            >
              Retake Photo
            </button>
            <button
              type="button"
              onClick={handleAcceptPhoto}
              className="flex-1 py-3.5 rounded-full bg-[#1877F2] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#166fe5] shadow-lg transition-all"
            >
              <Check size={18} />
              <span>Use Photo</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
