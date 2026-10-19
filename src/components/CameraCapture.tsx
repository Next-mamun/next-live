import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Video, RotateCcw, X, Check, RefreshCw, Sparkles, StopCircle, Download } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (mediaUrl: string, type: 'image' | 'video') => void;
  onCancel: () => void;
  title?: string;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  onCancel,
  title = 'ক্যামেরা স্টুডিও'
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [capturedMedia, setCapturedMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [filter, setFilter] = useState<string>('none');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const filters = [
    { id: 'none', label: 'Normal', css: '' },
    { id: 'vibrant', label: 'Vibrant', css: 'saturate(1.4) contrast(1.1)' },
    { id: 'warm', label: 'Warm', css: 'sepia(0.25) saturate(1.2)' },
    { id: 'cool', label: 'Cool', css: 'hue-rotate(180deg) saturate(0.9)' },
    { id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.2)' },
    { id: 'vintage', label: 'Vintage', css: 'sepia(0.5) contrast(0.9) brightness(1.1)' }
  ];

  const activeFilterCss = filters.find(f => f.id === filter)?.css || '';

  const startCamera = useCallback(async () => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      const constraints: MediaStreamConstraints = {
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setHasPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Camera access denied or failed:', err);
      // Fallback to video-only if audio fails
      try {
        const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode }
        });
        setStream(videoOnlyStream);
        setHasPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = videoOnlyStream;
          videoRef.current.play().catch(() => {});
        }
      } catch (e2) {
        setHasPermission(false);
      }
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (activeFilterCss) {
      ctx.filter = activeFilterCss;
    }
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedMedia({ url: dataUrl, type: 'image' });
  };

  const startRecording = () => {
    if (!stream) return;
    recordedChunksRef.current = [];
    try {
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setCapturedMedia({ url: videoUrl, type: 'video' });
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (e) {
      console.error('MediaRecorder start failed:', e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleRetake = () => {
    setCapturedMedia(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedMedia) {
      onCapture(capturedMedia.url, capturedMedia.type);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between items-center select-none text-white overflow-hidden p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="w-full max-w-lg flex items-center justify-between z-10 py-2">
        <button
          type="button"
          onClick={onCancel}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white backdrop-blur-md"
          title="Cancel"
        >
          <X size={22} />
        </button>

        <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full backdrop-blur-md border border-white/10">
          <Camera size={16} className="text-[#1877F2]" />
          <span className="text-xs font-bold tracking-wide">{title}</span>
        </div>

        <button
          type="button"
          onClick={toggleCamera}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white backdrop-blur-md"
          title="Switch Camera"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Main Viewport */}
      <div className="relative w-full max-w-lg aspect-[3/4] sm:aspect-[4/5] bg-neutral-950 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center my-auto">
        {hasPermission === false && (
          <div className="text-center p-6 space-y-3">
            <Camera size={44} className="mx-auto text-red-500 opacity-80" />
            <p className="text-sm font-semibold">ক্যামেরা ব্যবহারের অনুমতি পাওয়া যায়নি</p>
            <p className="text-xs text-white/60">ব্রাউজারের সেটিংস থেকে ক্যামেরা পারমিশন এলাউ করুন।</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-[#1877F2] hover:bg-blue-600 text-white rounded-full text-xs font-bold transition-all"
            >
              পুনরায় চেষ্টা করুন
            </button>
          </div>
        )}

        {!capturedMedia ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ filter: activeFilterCss }}
              className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />
            {isRecording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600/90 text-white text-xs px-3 py-1.5 rounded-full font-bold shadow-lg animate-pulse">
                <span className="w-2.5 h-2.5 bg-white rounded-full"></span>
                <span>REC {Math.floor(recordingSeconds / 60)}:{('0' + (recordingSeconds % 60)).slice(-2)}</span>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full relative flex items-center justify-center bg-black">
            {capturedMedia.type === 'image' ? (
              <img
                src={capturedMedia.url}
                alt="Captured"
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={capturedMedia.url}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            )}
          </div>
        )}
      </div>

      {/* Filter Selector & Controls */}
      <div className="w-full max-w-lg flex flex-col items-center gap-4 z-10 pb-2">
        {!capturedMedia ? (
          <>
            {/* Filter pills */}
            <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full no-scrollbar">
              {filters.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
                    filter === f.id
                      ? 'bg-[#1877F2] text-white shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white/80'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Shutter / Record buttons */}
            <div className="flex items-center justify-around w-full px-8 py-2">
              <button
                type="button"
                onClick={takePhoto}
                className="p-4 rounded-full bg-white text-gray-900 hover:bg-gray-100 active:scale-90 transition-all shadow-xl flex items-center justify-center"
                title="Take Photo"
              >
                <div className="w-7 h-7 rounded-full border-2 border-gray-900 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-gray-900"></div>
                </div>
              </button>

              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 active:scale-90 transition-all shadow-xl flex items-center justify-center"
                  title="Record Video"
                >
                  <Video size={24} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 active:scale-90 transition-all shadow-xl flex items-center justify-center animate-bounce"
                  title="Stop Recording"
                >
                  <StopCircle size={24} />
                </button>
              )}
            </div>
          </>
        ) : (
          /* Confirm or Retake */
          <div className="flex items-center justify-center gap-6 w-full py-2">
            <button
              type="button"
              onClick={handleRetake}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium text-sm transition-all"
            >
              <RotateCcw size={18} />
              <span>পুনরায় তুলুন</span>
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-2 px-7 py-2.5 rounded-full bg-[#1877F2] hover:bg-blue-600 active:scale-95 text-white font-bold text-sm shadow-xl transition-all"
            >
              <Check size={18} />
              <span>ব্যবহার করুন</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;
