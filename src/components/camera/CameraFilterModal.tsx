import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, Camera, RotateCcw, Video, Download, Check, Sparkles, Sliders, 
  Trash2, RefreshCw, AlertCircle, Play, Square, Share2
} from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { FilterCategory, FilterId, FilterItem, FilterSettings, FaceLandmarkPoint } from './types';
import { MAKEUP_FILTERS, EFFECT_FILTERS, ALL_FILTERS } from './filtersData';
import { renderActiveFilters } from './filterRenderers';
import { FilterAdjustmentPanel } from './FilterAdjustmentPanel';
import { toast } from 'sonner';

interface CameraFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureMedia?: (url: string, type: 'image' | 'video') => void;
  initialFilterId?: FilterId;
}

export const CameraFilterModal: React.FC<CameraFilterModalProps> = ({
  isOpen,
  onClose,
  onCaptureMedia,
  initialFilterId
}) => {
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('makeup');
  const [activeFilterIds, setActiveFilterIds] = useState<Set<FilterId>>(
    new Set(initialFilterId ? [initialFilterId] : ['lipstick'])
  );
  const [selectedFilterForEdit, setSelectedFilterForEdit] = useState<FilterItem | null>(
    ALL_FILTERS.find(f => f.id === (initialFilterId || 'lipstick')) || ALL_FILTERS[0]
  );
  const [filterSettingsMap, setFilterSettingsMap] = useState<Record<FilterId, FilterSettings>>(() => {
    const map = {} as Record<FilterId, FilterSettings>;
    ALL_FILTERS.forEach(f => {
      map[f.id] = { ...f.defaultSettings };
    });
    return map;
  });

  // Camera & Stream State
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);

  // Recording & Capture State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [capturedMedia, setCapturedMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestAnimRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize MediaPipe Face Landmarker
  useEffect(() => {
    let isCancelled = false;

    async function initMediaPipe() {
      try {
        setIsModelLoading(true);
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        if (isCancelled) return;

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1
        });

        if (isCancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsModelLoading(false);
      } catch (err: any) {
        console.warn('MediaPipe GPU load error, falling back to CPU:', err);
        try {
          const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
          );
          if (isCancelled) return;
          const landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'CPU'
            },
            outputFaceBlendshapes: true,
            runningMode: 'VIDEO',
            numFaces: 1
          });
          if (isCancelled) {
            landmarker.close();
            return;
          }
          landmarkerRef.current = landmarker;
          setIsModelLoading(false);
        } catch (cpuErr: any) {
          console.error('Failed to initialize MediaPipe FaceLandmarker:', cpuErr);
          setIsModelLoading(false);
          setCameraError('AI Face Landmarker failed to load. Please check network connection.');
        }
      }
    }

    if (isOpen) {
      initMediaPipe();
    }

    return () => {
      isCancelled = true;
      if (landmarkerRef.current) {
        try {
          landmarkerRef.current.close();
        } catch (e) {}
        landmarkerRef.current = null;
      }
    };
  }, [isOpen]);

  // Start Camera Stream
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, min: 30 }
        },
        audio: true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsCameraReady(true);
          }).catch(e => console.warn('Video play error:', e));
        };
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setIsCameraReady(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('ক্যামেরা পারমিশন দেওয়া হয়নি। অনুগ্রহ করে ব্রাউজার সেটিংসে ক্যামেরা এলাও করুন।');
      } else {
        setCameraError('ক্যামেরা চালু করা যাচ্ছে না। অনুগ্রহ করে অন্য কোনো অ্যাপ ক্যামেরা ব্যবহার করছে কি না দেখুন।');
      }
    }
  }, [facingMode]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setIsCameraReady(false);
      if (requestAnimRef.current) {
        cancelAnimationFrame(requestAnimRef.current);
        requestAnimRef.current = null;
      }
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (requestAnimRef.current) {
        cancelAnimationFrame(requestAnimRef.current);
        requestAnimRef.current = null;
      }
    };
  }, [isOpen, startCamera]);

  // Real-time 60 FPS Render Loop
  useEffect(() => {
    if (!isOpen || !isCameraReady || isModelLoading) return;

    let isRunning = true;
    let lastVideoTime = -1;

    const renderLoop = (timestamp: number) => {
      if (!isRunning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (ctx) {
          // Flip horizontally for front camera (mirror effect)
          ctx.save();
          if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }

          // 1. Draw raw video frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // 2. Run Face Landmarker on video frame
          const landmarker = landmarkerRef.current;
          if (landmarker && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            try {
              const startTimeMs = performance.now();
              const results = landmarker.detectForVideo(video, startTimeMs);

              if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
                const landmarks = results.faceLandmarks[0] as FaceLandmarkPoint[];
                
                // 3. Render all active Makeup & Effect filters
                renderActiveFilters(
                  ctx,
                  landmarks,
                  filterSettingsMap,
                  activeFilterIds,
                  canvas.width,
                  canvas.height,
                  timestamp,
                  video
                );
              }
            } catch (detectErr) {
              console.warn('Face detection cycle error:', detectErr);
            }
          }

          ctx.restore();
        }
      }

      requestAnimRef.current = requestAnimationFrame(renderLoop);
    };

    requestAnimRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isRunning = false;
      if (requestAnimRef.current) {
        cancelAnimationFrame(requestAnimRef.current);
        requestAnimRef.current = null;
      }
    };
  }, [isOpen, isCameraReady, isModelLoading, facingMode, activeFilterIds, filterSettingsMap]);

  // Toggle or select filter
  const handleSelectFilter = (filter: FilterItem) => {
    setActiveFilterIds(prev => {
      const next = new Set(prev);
      if (next.has(filter.id)) {
        // If clicking already selected, toggle off or focus on editing
        if (selectedFilterForEdit?.id === filter.id) {
          next.delete(filter.id);
          setSelectedFilterForEdit(null);
        } else {
          setSelectedFilterForEdit(filter);
        }
      } else {
        next.add(filter.id);
        setSelectedFilterForEdit(filter);
      }
      return next;
    });
  };

  const handleUpdateSettings = (newSettings: FilterSettings) => {
    if (!selectedFilterForEdit) return;
    setFilterSettingsMap(prev => ({
      ...prev,
      [selectedFilterForEdit.id]: newSettings
    }));
  };

  const handleResetFilter = () => {
    if (!selectedFilterForEdit) return;
    setFilterSettingsMap(prev => ({
      ...prev,
      [selectedFilterForEdit.id]: { ...selectedFilterForEdit.defaultSettings }
    }));
    toast.success(`${selectedFilterForEdit.banglaName} রিসেট করা হয়েছে`);
  };

  const handleClearAllFilters = () => {
    setActiveFilterIds(new Set());
    setSelectedFilterForEdit(null);
    toast.info('সব ফিল্টার বন্ধ করা হয়েছে');
  };

  // Switch Camera Front / Back
  const handleToggleFacingMode = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  // Capture High-Res Photo
  const handleTakePhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setCapturedMedia({ url: dataUrl, type: 'image' });
      toast.success('ছবি তোলা হয়েছে!');
    } catch (e) {
      console.error('Failed to capture photo:', e);
      toast.error('ছবি তুলতে সমস্যা হয়েছে');
    }
  };

  // Start Video Recording
  const handleStartRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const canvasStream = canvas.captureStream(30);
      
      // Combine canvas video stream with audio from microphone
      if (streamRef.current) {
        const audioTracks = streamRef.current.getAudioTracks();
        if (audioTracks.length > 0) {
          canvasStream.addTrack(audioTracks[0]);
        }
      }

      recordedChunksRef.current = [];
      const options = { mimeType: 'video/webm;codecs=vp8,opus' };
      const recorder = new MediaRecorder(canvasStream, options);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setCapturedMedia({ url: videoUrl, type: 'video' });
        setIsRecording(false);
        setRecordingSeconds(0);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start video recording:', err);
      toast.error('ভিডিও রেকর্ডিং শুরু করতে সমস্যা হয়েছে');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleDownload = () => {
    if (!capturedMedia) return;
    const a = document.createElement('a');
    a.href = capturedMedia.url;
    a.download = `next-filter-${Date.now()}.${capturedMedia.type === 'image' ? 'jpg' : 'webm'}`;
    a.click();
    toast.success('ডাউনলোড সম্পন্ন হয়েছে!');
  };

  const handleSaveAndShare = () => {
    if (!capturedMedia) return;
    if (onCaptureMedia) {
      onCaptureMedia(capturedMedia.url, capturedMedia.type);
    }
    toast.success('মিডিয়া সংরক্ষিত হয়েছে!');
    onClose();
  };

  if (!isOpen) return null;

  const currentFilters = activeCategory === 'makeup' ? MAKEUP_FILTERS : EFFECT_FILTERS;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col justify-between overflow-hidden select-none touch-none">
      {/* Hidden Video Feed for MediaPipe & Canvas Input */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="hidden"
      />

      {/* Main Interactive Canvas Display */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover sm:object-contain"
        />

        {/* Loading Spinner for MediaPipe AI Model */}
        {isModelLoading && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center z-40 text-white gap-3 p-6 text-center">
            <div className="w-12 h-12 border-4 border-white/20 border-t-[#1877F2] rounded-full animate-spin" />
            <p className="font-bold text-base tracking-wide">AI ফেস ল্যান্ডমার্ক মডেল লোড হচ্ছে...</p>
            <p className="text-xs text-white/60">Google MediaPipe Vision 478 Landmark Engine</p>
          </div>
        )}

        {/* Camera Permission / Error Warning */}
        {cameraError && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center z-50 text-white p-6 text-center gap-4">
            <AlertCircle size={56} className="text-amber-400" />
            <h3 className="font-black text-xl">ক্যামেরা সমস্যা</h3>
            <p className="text-sm text-white/80 max-w-sm">{cameraError}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={startCamera}
                className="bg-[#1877F2] hover:bg-blue-600 text-white px-5 py-2.5 rounded-full font-bold text-sm flex items-center gap-2 shadow-lg"
              >
                <RefreshCw size={16} /> আবার চেষ্টা করুন
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-white/20 hover:bg-white/30 text-white px-5 py-2.5 rounded-full font-bold text-sm"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        )}

        {/* Recording Timer Badge */}
        {isRecording && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-600/90 text-white font-mono font-bold text-xs px-4 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-md shadow-lg animate-pulse z-30">
            <div className="w-2.5 h-2.5 rounded-full bg-white" />
            <span>REC {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
          </div>
        )}

        {/* Top Action Bar */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-30 pointer-events-auto">
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-3 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-transform active:scale-95 shadow-lg"
            title="বন্ধ করুন"
          >
            <X size={22} />
          </button>

          {/* Center Brand / Filter Count */}
          <div className="bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 flex items-center gap-2 text-white">
            <Sparkles size={16} className="text-yellow-400" />
            <span className="font-black text-xs tracking-wider">NEXT AR FILTERS</span>
            {activeFilterIds.size > 0 && (
              <span className="bg-[#1877F2] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {activeFilterIds.size}
              </span>
            )}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Clear All */}
            {activeFilterIds.size > 0 && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="p-3 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-md transition-all active:scale-95 shadow-lg"
                title="ফিল্টার ক্লিয়ার"
              >
                <Trash2 size={20} />
              </button>
            )}

            {/* Camera Flip */}
            <button
              type="button"
              onClick={handleToggleFacingMode}
              className="p-3 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-transform active:scale-95 shadow-lg"
              title="ক্যামেরা ফ্লিপ (Front/Back)"
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Controls Area */}
      <div className="w-full flex flex-col z-30 bg-gradient-to-t from-black via-black/80 to-transparent pt-3 pointer-events-auto">
        {/* TikTok / Snapchat Style Adjustment Slider Panel (when filter is selected) */}
        {selectedFilterForEdit && activeFilterIds.has(selectedFilterForEdit.id) && (
          <FilterAdjustmentPanel
            filter={selectedFilterForEdit}
            settings={filterSettingsMap[selectedFilterForEdit.id] || selectedFilterForEdit.defaultSettings}
            onChange={handleUpdateSettings}
            onReset={handleResetFilter}
            onClose={() => setSelectedFilterForEdit(null)}
          />
        )}

        {/* Main Category Tabs: মেকআপ (Makeup) & ইফেক্ট (Effects) */}
        <div className="flex items-center justify-center gap-4 py-2 border-b border-white/10 mx-4">
          <button
            type="button"
            onClick={() => setActiveCategory('makeup')}
            className={`px-5 py-2 rounded-full font-black text-xs tracking-wide transition-all flex items-center gap-1.5 ${
              activeCategory === 'makeup'
                ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30 scale-105'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            <span>💄</span>
            <span>মেকআপ (Makeup)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('effects')}
            className={`px-5 py-2 rounded-full font-black text-xs tracking-wide transition-all flex items-center gap-1.5 ${
              activeCategory === 'effects'
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-purple-500/30 scale-105'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            <span>✨</span>
            <span>ইফেক্ট (Effects)</span>
          </button>
        </div>

        {/* Horizontal Filter Selector Carousel */}
        <div className="flex items-center gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
          {currentFilters.map(filter => {
            const isActive = activeFilterIds.has(filter.id);
            const isEditing = selectedFilterForEdit?.id === filter.id;

            return (
              <button
                type="button"
                key={filter.id}
                onClick={() => handleSelectFilter(filter)}
                className={`flex flex-col items-center gap-1 shrink-0 p-1.5 rounded-2xl transition-all group ${
                  isActive
                    ? 'scale-105'
                    : 'opacity-70 hover:opacity-100 hover:scale-100'
                }`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all relative ${
                    isActive
                      ? 'border-2 border-white bg-gradient-to-br from-[#1877F2] to-purple-600 shadow-lg shadow-blue-500/40 ring-2 ring-blue-400'
                      : 'border border-white/20 bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <span>{filter.icon}</span>
                  {isActive && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 text-white rounded-full flex items-center justify-center text-[9px] font-black border border-black shadow">
                      ✓
                    </div>
                  )}
                  {isEditing && (
                    <div className="absolute -bottom-1 inset-x-0 mx-auto w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
                  )}
                </div>
                <span className="text-[11px] font-bold text-white tracking-tight line-clamp-1 max-w-[70px] text-center">
                  {filter.banglaName}
                </span>
              </button>
            );
          })}
        </div>

        {/* Shutter / Capture Trigger Bar */}
        <div className="flex items-center justify-around py-4 px-8 pb-8">
          {/* Video Record Button */}
          <button
            type="button"
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-red-600 scale-110 shadow-lg shadow-red-500/50'
                : 'bg-white/15 hover:bg-white/25 text-red-500 border-2 border-red-500/50'
            }`}
            title={isRecording ? 'ভিডিও শেষ করুন' : 'ভিডিও রেকর্ড শুরু'}
          >
            {isRecording ? (
              <Square size={20} className="text-white fill-current" />
            ) : (
              <Video size={24} className="text-red-400" />
            )}
          </button>

          {/* Central Big Shutter Button (Snap Photo) */}
          <button
            type="button"
            onClick={handleTakePhoto}
            className="w-20 h-20 rounded-full border-4 border-white p-1 bg-transparent hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center justify-center"
            title="ছবি তুলুন (Take Photo)"
          >
            <div className="w-full h-full rounded-full bg-white hover:bg-gray-100 flex items-center justify-center transition-colors shadow-inner">
              <Camera size={32} className="text-gray-900" />
            </div>
          </button>

          {/* Reset Filters / Clear Button */}
          <button
            type="button"
            onClick={handleClearAllFilters}
            className="w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-all active:scale-95"
            title="সব রিসেট"
          >
            <RotateCcw size={22} />
          </button>
        </div>
      </div>

      {/* Captured Media Preview Modal */}
      {capturedMedia && (
        <div className="fixed inset-0 z-[10000] bg-black/95 flex flex-col items-center justify-between p-4 animate-in fade-in duration-200">
          {/* Top Bar */}
          <div className="w-full max-w-md flex justify-between items-center py-2 text-white">
            <h3 className="font-black text-lg">ক্যাপচার প্রিভিউ</h3>
            <button
              type="button"
              onClick={() => setCapturedMedia(null)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Media Player / Image */}
          <div className="relative flex-1 w-full max-w-md flex items-center justify-center my-3 rounded-3xl overflow-hidden bg-zinc-900 border border-white/10 shadow-2xl">
            {capturedMedia.type === 'image' ? (
              <img
                src={capturedMedia.url}
                alt="Captured Filter Shot"
                className="w-full h-full object-contain"
              />
            ) : (
              <video
                src={capturedMedia.url}
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-full object-contain"
              />
            )}
          </div>

          {/* Preview Action Buttons */}
          <div className="w-full max-w-md flex items-center gap-3 py-3">
            <button
              type="button"
              onClick={() => setCapturedMedia(null)}
              className="flex-1 py-3.5 bg-white/15 hover:bg-white/25 text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw size={18} /> আবার তুলুন
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="p-3.5 bg-white/15 hover:bg-white/25 text-white rounded-2xl font-bold transition-all shadow-md"
              title="ডাউনলোড"
            >
              <Download size={20} />
            </button>

            <button
              type="button"
              onClick={handleSaveAndShare}
              className="flex-1 py-3.5 bg-gradient-to-r from-[#1877F2] to-blue-600 text-white rounded-2xl font-bold text-sm shadow-xl hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <Check size={18} /> ব্যবহার করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default CameraFilterModal;
