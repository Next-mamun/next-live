import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  BookOpen, AlertCircle, Code, ChevronLeft, Play, ExternalLink, Camera, 
  RefreshCw, Download, RotateCcw, StopCircle, GraduationCap, Award, 
  Maximize2, Minimize2, Sparkles, X, Check
} from 'lucide-react';
import { toast } from 'sonner';

const getSupportedVideoMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
};

// Safe pushState to prevent DOMException / SecurityError crashes in iframes & WebViews
const safePushState = (data: any) => {
  try {
    window.history.pushState(data, '');
  } catch (e) {
    // Silently ignore in sandboxed environments
  }
};

interface FilterEffect {
  id: string;
  label: string;
  css: string;
  gradient: string;
}

const CAMERA_FILTERS: FilterEffect[] = [
  { id: 'none', label: 'Natural', css: '', gradient: 'from-gray-500 to-gray-700' },
  { id: 'glamour', label: 'Glamour', css: 'saturate(1.25) contrast(1.08) brightness(1.08)', gradient: 'from-pink-500 to-rose-400' },
  { id: 'cyberpunk', label: 'Cyberpunk', css: 'hue-rotate(290deg) saturate(1.8) contrast(1.15)', gradient: 'from-purple-600 to-cyan-400' },
  { id: 'golden', label: 'Sunset', css: 'sepia(0.35) saturate(1.6) brightness(1.05) hue-rotate(-15deg)', gradient: 'from-amber-500 to-orange-500' },
  { id: 'noir', label: 'Cinema Noir', css: 'grayscale(1) contrast(1.4) brightness(0.9)', gradient: 'from-zinc-900 to-zinc-600' },
  { id: 'vintage', label: '90s Retro', css: 'sepia(0.4) contrast(0.95) brightness(1.1) saturate(1.3)', gradient: 'from-yellow-600 to-amber-700' },
  { id: 'teal', label: 'Emerald', css: 'hue-rotate(85deg) saturate(1.4) brightness(1.05)', gradient: 'from-emerald-500 to-teal-600' },
  { id: 'dreamy', label: 'Dreamy', css: 'brightness(1.15) contrast(0.95) saturate(1.35)', gradient: 'from-indigo-400 to-pink-300' },
  { id: 'matrix', label: 'Matrix', css: 'hue-rotate(90deg) contrast(1.35) saturate(1.6)', gradient: 'from-green-600 to-lime-500' },
  { id: 'midnight', label: 'Midnight', css: 'hue-rotate(180deg) saturate(1.25) contrast(1.1)', gradient: 'from-blue-700 to-indigo-900' }
];

const Lab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'menu' | 'ielts' | 'results' | 'ebooks' | 'coderunner' | 'camera'>(() => {
    try {
      const saved = sessionStorage.getItem('next_lab_active_tab');
      if (saved && ['menu', 'ielts', 'results', 'ebooks', 'coderunner', 'camera'].includes(saved)) {
        return saved as any;
      }
    } catch (e) {}
    return 'menu';
  });

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tab switching with safe history & session storage
  const handleSelectTab = useCallback((tab: 'menu' | 'ielts' | 'results' | 'ebooks' | 'coderunner' | 'camera') => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem('next_lab_active_tab', tab);
    } catch (e) {}
    if (tab !== 'menu') {
      safePushState({ labTab: tab });
    }
  }, []);

  // Listen to native PC/mobile back button (popstate)
  useEffect(() => {
    const handlePopState = () => {
      if (isFullscreen) {
        setIsFullscreen(false);
        return;
      }
      if (activeTab !== 'menu') {
        setActiveTab('menu');
        try {
          sessionStorage.setItem('next_lab_active_tab', 'menu');
        } catch (e) {}
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, isFullscreen]);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      safePushState({ labFullscreen: true });
    } else {
      setIsFullscreen(false);
      try {
        if (window.history.state?.labFullscreen) {
          window.history.back();
        }
      } catch (e) {}
    }
  };

  // Open Results Checker: Full-page in Android WebView, new tab in regular browser
  const handleOpenResultsChecker = useCallback(() => {
    const isAndroidApp = typeof navigator !== 'undefined' && (
      navigator.userAgent.includes('Next') ||
      navigator.userAgent.includes('wv') ||
      /Android.*Version\/[0-9.]+/i.test(navigator.userAgent)
    );

    const targetUrl = 'https://educationboardresults.gov.bd';

    if (isAndroidApp) {
      // 1. Android App WebView: Top-level full page navigation so Cloudflare/anti-bot verification works without iframe blocking
      window.location.href = targetUrl;
    } else {
      // 2. Regular browser: open official site in a new tab via anchor link
      const link = document.createElement('a');
      link.href = targetUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, []);

  // Code Runner state
  const [htmlCode, setHtmlCode] = useState(`<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: sans-serif; text-align: center; margin-top: 50px; }
  h1 { color: #1877F2; }
</style>
</head>
<body>
  <h1>Hello Lab!</h1>
  <p id="demo-status">Write your HTML, CSS, and JS here.</p>
  <button onclick="document.getElementById('demo-status').textContent = 'Running offline!'">Test JavaScript</button>
</body>
</html>`);
  const [runCode, setRunCode] = useState(htmlCode);

  // Camera Lab state (TikTok style)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraFilter, setCameraFilter] = useState('none');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedVideoExt, setRecordedVideoExt] = useState<'webm' | 'mp4'>('webm');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const activeFilter = CAMERA_FILTERS.find(f => f.id === cameraFilter);
  const activeFilterCss = activeFilter?.css || '';

  const stopActiveStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const clearRecordedVideo = useCallback(() => {
    if (recordedUrlRef.current && recordedUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
    }
    setRecordedVideoUrl(null);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopActiveStream();
      const constraints: MediaStreamConstraints = {
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = newStream;
      setHasCameraPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
        streamRef.current = videoOnly;
        setHasCameraPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = videoOnly;
          videoRef.current.play().catch(() => {});
        }
      } catch (e2) {
        setHasCameraPermission(false);
      }
    }
  }, [facingMode, stopActiveStream]);

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopActiveStream();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      stopActiveStream();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeTab, startCamera, stopActiveStream]);

  useEffect(() => {
    return () => {
      if (recordedUrlRef.current && recordedUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(recordedUrlRef.current);
        recordedUrlRef.current = null;
      }
    };
  }, []);

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
    setCapturedPhoto(dataUrl);
  };

  const startRecording = () => {
    const activeStream = streamRef.current;
    if (!activeStream) return;
    recordedChunksRef.current = [];
    try {
      const mimeType = getSupportedVideoMimeType();
      const recorder = mimeType
        ? new MediaRecorder(activeStream, { mimeType })
        : new MediaRecorder(activeStream);
      const outputType = mimeType || recorder.mimeType || 'video/webm';
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: outputType });
        if (recordedUrlRef.current && recordedUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(recordedUrlRef.current);
        }
        const videoUrl = URL.createObjectURL(blob);
        recordedUrlRef.current = videoUrl;
        setRecordedVideoExt(outputType.includes('mp4') ? 'mp4' : 'webm');
        setRecordedVideoUrl(videoUrl);
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (e) {
      console.error('Recording start failed:', e);
      toast.error('Video recording is not supported on this device/browser.');
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

  const handleRunCode = () => {
    setRunCode(htmlCode);
  };

  return (
    <div className={`flex flex-col flex-1 ${isFullscreen ? 'fixed inset-0 z-[9999] bg-black w-screen h-screen m-0 p-0 rounded-none' : 'h-[calc(100vh-140px)] md:h-full w-full bg-gray-50 dark:bg-black md:rounded-xl shadow-sm border-0 md:border border-gray-200 dark:border-gray-800 overflow-hidden max-w-[1200px] mx-auto'}`}>
      
      {/* Top Header (Shown for menu, results, ebooks, coderunner; camera has internal TikTok overlay) */}
      {!isFullscreen && activeTab !== 'camera' && (
        <div className="p-3.5 md:p-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {activeTab !== 'menu' && (
              <button 
                onClick={() => {
                  handleSelectTab('menu');
                  setCapturedPhoto(null);
                  clearRecordedVideo();
                }}
                className="p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1 text-gray-700 dark:text-gray-300"
                title="Back to Lab Menu"
              >
                <ChevronLeft size={22} />
                <span className="text-xs font-bold md:hidden">Menu</span>
              </button>
            )}
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              {activeTab === 'ielts' ? (
                <GraduationCap className="text-[#1877F2]" size={20} />
              ) : activeTab === 'results' ? (
                <Award className="text-emerald-600 dark:text-emerald-400" size={20} />
              ) : activeTab === 'coderunner' ? (
                <Code className="text-[#1877F2]" size={20} />
              ) : (
                <BookOpen className="text-[#1877F2]" size={20} />
              )}
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-gray-900 dark:text-white leading-tight">
                {activeTab === 'menu' 
                  ? 'Lab Area' 
                  : activeTab === 'ielts'
                    ? 'Next IELTS'
                    : activeTab === 'results'
                      ? 'Results Checker'
                      : activeTab === 'ebooks' 
                        ? 'E-Books Library' 
                        : 'Code Runner'}
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                {activeTab === 'menu' 
                  ? 'Select a tool to get started' 
                  : activeTab === 'ielts'
                    ? '100% Free Complete IELTS Practice'
                    : activeTab === 'results'
                      ? 'Check Your Board Results Instant'
                      : activeTab === 'ebooks' 
                        ? 'Browse and read books directly' 
                        : 'Run HTML, CSS & JS directly in your browser'}
              </p>
            </div>
          </div>

          {activeTab === 'ielts' && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-200 transition-all flex items-center gap-1.5"
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
            </button>
          )}
        </div>
      )}

      <div className="flex-1 w-full relative overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-900">
        {/* Lab Main Menu */}
        {activeTab === 'menu' && (
          <div className="p-4 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Next IELTS (Top Option) */}
            <button 
              onClick={() => handleSelectTab('ielts')}
              className="flex flex-col items-center justify-center gap-4 p-8 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all group active:scale-95 text-center shadow-sm"
            >
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-800 text-[#1877F2] dark:text-blue-300 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <GraduationCap size={32} />
              </div>
              <div className="text-center">
                <h2 className="font-bold text-lg text-gray-900 dark:text-white">Next IELTS</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">World's First 100% Free IELTS Practice</p>
              </div>
            </button>

            {/* 2. Results Checker (Top Option) */}
            <button 
              onClick={() => {
                handleSelectTab('results');
                handleOpenResultsChecker();
              }}
              className="flex flex-col items-center justify-center gap-4 p-8 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all group active:scale-95 text-center shadow-sm cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-300 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <Award size={32} />
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <h2 className="font-bold text-lg text-gray-900 dark:text-white">Results Checker</h2>
                  <ExternalLink size={16} className="text-emerald-600 dark:text-emerald-400 opacity-70 group-hover:opacity-100" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Check Your Board Results Instant</p>
                <span className="inline-block mt-2 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                  Official Server • 100% Verified
                </span>
              </div>
            </button>

            {/* 3. E-Books Library */}
            <button 
              onClick={() => handleSelectTab('ebooks')}
              className="flex flex-col items-center justify-center gap-4 p-8 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all group active:scale-95"
            >
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-800 text-[#1877F2] dark:text-blue-300 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <BookOpen size={32} />
              </div>
              <div className="text-center">
                <h2 className="font-bold text-lg text-gray-900 dark:text-white">E-Books Library</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Read books without downloading</p>
              </div>
            </button>

            {/* 4. Code Runner */}
            <button 
              onClick={() => handleSelectTab('coderunner')}
              className="flex flex-col items-center justify-center gap-4 p-8 bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-2xl hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-300 dark:hover:border-green-700 transition-all group active:scale-95"
            >
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-800 text-green-500 dark:text-green-300 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <Code size={32} />
              </div>
              <div className="text-center">
                <h2 className="font-bold text-lg text-gray-900 dark:text-white">Code Runner</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Offline HTML/JS executor</p>
              </div>
            </button>

            {/* 5. Camera Studio (Description in English, TikTok-style) */}
            <button 
              onClick={() => handleSelectTab('camera')}
              className="flex flex-col items-center justify-center gap-4 p-8 bg-gradient-to-br from-pink-50/60 to-purple-50/60 dark:from-pink-950/20 dark:to-purple-950/20 border border-pink-100 dark:border-pink-900/30 rounded-2xl hover:border-pink-300 dark:hover:border-pink-700 transition-all group active:scale-95 sm:col-span-2 shadow-sm"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
                <Camera size={32} />
              </div>
              <div className="text-center">
                <h2 className="font-bold text-lg text-gray-900 dark:text-white">Camera Studio</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Capture photos, record clips & apply unique creative filters</p>
              </div>
            </button>
          </div>
        )}

        {/* Tab 1: Next IELTS Full-Bleed Viewer */}
        {activeTab === 'ielts' && (
          <div className="flex flex-col h-full w-full absolute inset-0 bg-white dark:bg-gray-900">
            {/* Fullscreen Floating Toggle Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="fixed bottom-6 right-6 z-[100] p-3 rounded-full bg-black/75 hover:bg-black text-white shadow-2xl backdrop-blur-md border border-white/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              <span className="text-xs font-bold hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>

            <iframe 
              src="https://next-ielts.vercel.app" 
              width="100%" 
              height="100%" 
              className="flex-1 border-none w-full h-full bg-white dark:bg-gray-900"
              allow="microphone; camera; clipboard-write; autoplay; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              title="Next IELTS"
            />
          </div>
        )}

        {/* Tab 2: Results Checker Dedicated Portal View (Zero anti-bot verification failure) */}
        {activeTab === 'results' && (
          <div className="flex flex-col h-full w-full absolute inset-0 bg-gradient-to-b from-emerald-50/50 via-white to-gray-50 dark:from-emerald-950/20 dark:via-black dark:to-gray-950 p-4 md:p-8 overflow-y-auto">
            <div className="max-w-lg mx-auto w-full flex flex-col items-center text-center my-auto py-6">
              {/* Official Portal Emblem */}
              <div className="relative mb-5">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-emerald-600 text-white flex items-center justify-center shadow-2xl shadow-emerald-600/30">
                  <Award size={44} />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-white dark:bg-black rounded-full p-1 shadow-md">
                  <Check size={18} className="text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              {/* Title & Organization */}
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                Education Board Results
              </h2>
              <p className="text-xs md:text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                Ministry of Education, Bangladesh
              </p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-sm mt-3 leading-relaxed">
                Official examination results server for SSC, Dakhil, HSC, Alim, JSC, Vocational & DIBS.
              </p>

              {/* Supported Examinations Pills */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 my-5 max-w-md">
                {['SSC / DAKHIL', 'HSC / ALIM', 'JSC / JDC', 'VOCATIONAL', 'DIBS'].map((exam) => (
                  <span 
                    key={exam} 
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 shadow-2xs"
                  >
                    {exam}
                  </span>
                ))}
              </div>

              {/* Verification & Security Notice */}
              <div className="w-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/40 rounded-2xl p-4 text-left mb-6 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                    ✓
                  </div>
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-emerald-900 dark:text-emerald-200">
                      ১০০% ভেরিফিকেশন ফেইল ছাড়া রেজাল্ট
                    </p>
                    <p className="text-emerald-700 dark:text-emerald-300 text-[11px] leading-relaxed">
                      সরকারি ওয়েবসাইটের সিকিউরিটি কারণে আইফ্রেমের ভেতরে ভেরিফিকেশন ফেইল হতো। এখন নিচের বাটনে ক্লিক করলেই সরাসরি অফিশিয়াল সার্ভার ওপেন হবে—অ্যাপের ভেতর থেকে ফুল-পেজে এবং ব্রাউজার থেকে নতুন ট্যাবে।
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleOpenResultsChecker}
                  className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-base shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Award size={20} />
                  <span>Open Official Results Portal</span>
                  <ExternalLink size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('menu')}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  ← Back to Lab Menu
                </button>
              </div>

              {/* Official Server URL */}
              <div className="mt-6 text-[11px] text-gray-400 dark:text-gray-500">
                <span>Official URL: </span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">https://educationboardresults.gov.bd</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: E-Books Library */}
        {activeTab === 'ebooks' && (
          <div className="flex flex-col h-full w-full absolute inset-0">
            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 p-3 border-b border-blue-100 dark:border-blue-800/30 shrink-0">
              <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
              <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium leading-relaxed">
                  Double-click a book to open it. It will open securely within the browser.
                </p>
                <a 
                  href="https://drive.google.com/drive/folders/17dLwRV5ENwdoZvYNQenOOd4YG2GjzeGq" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#1877F2] dark:text-blue-400 font-bold hover:underline whitespace-nowrap"
                >
                  <ExternalLink size={14} /> Open directly in Google Drive
                </a>
              </div>
            </div>
            <iframe 
              src="https://drive.google.com/embeddedfolderview?id=17dLwRV5ENwdoZvYNQenOOd4YG2GjzeGq#list" 
              width="100%" 
              height="100%" 
              className="flex-1 border-none w-full h-full bg-white dark:bg-gray-900"
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="Drive Books"
            />
          </div>
        )}

        {/* Tab 4: Code Runner */}
        {activeTab === 'coderunner' && (
          <div className="flex flex-col md:flex-row h-full w-full absolute inset-0 bg-white dark:bg-gray-900">
            <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 h-1/2 md:h-full">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">HTML/CSS/JS Source</span>
                <button 
                  onClick={handleRunCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1877F2] hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
                >
                  <Play size={14} /> Run Code
                </button>
              </div>
              <textarea 
                value={htmlCode}
                onChange={(e) => setHtmlCode(e.target.value)}
                className="flex-1 w-full p-4 font-mono text-sm bg-gray-900 text-green-400 outline-none resize-none"
                spellCheck={false}
              />
            </div>
            <div className="flex-1 flex flex-col h-1/2 md:h-full">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Preview Console</span>
                <span className="text-xs text-green-500 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span> Live Sandbox
                </span>
              </div>
              <iframe 
                srcDoc={runCode}
                title="Preview"
                className="flex-1 w-full h-full border-none bg-white"
                sandbox="allow-scripts"
              />
            </div>
          </div>
        )}

        {/* Tab 5: TikTok-Style Camera Studio */}
        {activeTab === 'camera' && (
          <div className="absolute inset-0 w-full h-full bg-black overflow-hidden flex flex-col justify-between select-none">
            {/* Viewfinder Video / Preview Area */}
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
              {!capturedPhoto && !recordedVideoUrl ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ filter: activeFilterCss }}
                    className={`w-full h-full object-cover transition-all duration-300 ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                  />
                  {hasCameraPermission === false && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/85 p-6 text-center">
                      <Camera size={48} className="text-gray-500 mb-3" />
                      <h3 className="text-lg font-bold mb-1">Camera Access Required</h3>
                      <p className="text-xs text-gray-400 max-w-xs mb-4">Please allow camera permissions in your browser to use Camera Studio.</p>
                      <button
                        onClick={startCamera}
                        className="px-5 py-2.5 bg-[#1877F2] text-white rounded-full text-xs font-bold hover:bg-blue-600 transition-all"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </>
              ) : capturedPhoto ? (
                <img src={capturedPhoto} alt="Captured" className="w-full h-full object-contain bg-black" />
              ) : (
                <video src={recordedVideoUrl || ''} controls autoPlay playsInline className="w-full h-full object-contain bg-black" />
              )}
            </div>

            {/* Top Overlay Bar */}
            <div className="relative z-30 p-4 pt-5 flex items-center justify-between w-full bg-gradient-to-b from-black/60 to-transparent">
              <button 
                onClick={() => {
                  handleSelectTab('menu');
                  setCapturedPhoto(null);
                  clearRecordedVideo();
                }}
                className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/70 transition-all active:scale-95"
                title="Back to Lab Menu"
              >
                <ChevronLeft size={22} />
              </button>

              {/* Recording Timer or Mode Indicator */}
              {isRecording ? (
                <div className="flex items-center gap-2 bg-red-600 text-white text-xs px-3.5 py-1.5 rounded-full font-black tracking-wide shadow-lg animate-pulse">
                  <span className="w-2.5 h-2.5 bg-white rounded-full"></span>
                  <span>REC {Math.floor(recordingSeconds / 60)}:{('0' + (recordingSeconds % 60)).slice(-2)}</span>
                </div>
              ) : (
                <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/90 text-xs font-semibold">
                  Camera Studio
                </div>
              )}

              {/* Flip Camera Button */}
              <button 
                onClick={toggleCamera}
                disabled={isRecording || !!capturedPhoto || !!recordedVideoUrl}
                className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/70 transition-all active:scale-95 disabled:opacity-40"
                title="Flip Camera"
              >
                <RefreshCw size={19} />
              </button>
            </div>

            {/* Active Filter Pill (When a filter other than normal is on) */}
            {activeFilter && activeFilter.id !== 'none' && !capturedPhoto && !recordedVideoUrl && (
              <div className="relative z-20 self-center">
                <button
                  onClick={() => setShowFilterDrawer(true)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white text-xs font-bold shadow-lg"
                >
                  <Sparkles size={12} className="text-yellow-400" />
                  <span>{activeFilter.label}</span>
                </button>
              </div>
            )}

            {/* Bottom Controls Area (TikTok Style) */}
            <div className="relative z-30 pb-6 pt-3 px-6 flex flex-col items-center gap-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
              {/* Portable Effects Drawer (Popup Carousel) */}
              {showFilterDrawer && !capturedPhoto && !recordedVideoUrl && (
                <div className="w-full max-w-md bg-black/85 backdrop-blur-xl border border-white/15 rounded-3xl p-3.5 shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-1.5 text-white font-bold text-xs tracking-wide">
                      <Sparkles size={14} className="text-yellow-400" />
                      <span>Creative Effects & Filters</span>
                    </div>
                    <button 
                      onClick={() => setShowFilterDrawer(false)}
                      className="p-1 rounded-full text-gray-400 hover:text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Horizontal Scroll of Portable Filter Bubbles */}
                  <div className="flex items-center gap-3 overflow-x-auto py-1 px-1 no-scrollbar scroll-smooth">
                    {CAMERA_FILTERS.map(f => {
                      const isSelected = cameraFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setCameraFilter(f.id)}
                          className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none"
                        >
                          <div className={`w-14 h-14 rounded-full bg-gradient-to-tr ${f.gradient} p-0.5 flex items-center justify-center transition-all ${
                            isSelected ? 'ring-2 ring-white scale-105 shadow-lg' : 'opacity-80 group-hover:opacity-100'
                          }`}>
                            <div className="w-full h-full rounded-full bg-black/40 flex items-center justify-center backdrop-blur-xs text-white">
                              {isSelected ? <Check size={18} className="text-white" /> : <Sparkles size={14} />}
                            </div>
                          </div>
                          <span className={`text-[11px] font-semibold tracking-tight whitespace-nowrap ${
                            isSelected ? 'text-white font-bold' : 'text-gray-400 group-hover:text-gray-200'
                          }`}>
                            {f.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Live Capture Controls (When not in preview) */}
              {!capturedPhoto && !recordedVideoUrl ? (
                <>
                  {/* Photo / Video Mode Selector */}
                  {!isRecording && (
                    <div className="flex items-center gap-4 text-xs font-bold tracking-wider">
                      <button
                        onClick={() => setCameraMode('photo')}
                        className={`transition-colors py-1 ${cameraMode === 'photo' ? 'text-white border-b-2 border-white' : 'text-white/60 hover:text-white'}`}
                      >
                        PHOTO
                      </button>
                      <button
                        onClick={() => setCameraMode('video')}
                        className={`transition-colors py-1 ${cameraMode === 'video' ? 'text-white border-b-2 border-white' : 'text-white/60 hover:text-white'}`}
                      >
                        VIDEO
                      </button>
                    </div>
                  )}

                  {/* Main Shutter Row */}
                  <div className="w-full flex items-center justify-around max-w-xs">
                    {/* Portable Effects Toggle Button */}
                    <button
                      onClick={() => setShowFilterDrawer(prev => !prev)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${
                        showFilterDrawer || cameraFilter !== 'none'
                          ? 'text-yellow-400 scale-105'
                          : 'text-white hover:text-yellow-300 opacity-90'
                      }`}
                      title="Toggle Filter Effects"
                    >
                      <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
                        <Sparkles size={20} />
                      </div>
                      <span className="text-[10px] font-bold tracking-wider uppercase">Effects</span>
                    </button>

                    {/* TikTok Style Main Shutter Button */}
                    {cameraMode === 'photo' ? (
                      <button
                        onClick={takePhoto}
                        className="w-18 h-18 rounded-full border-4 border-white p-1 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl cursor-pointer"
                        title="Take Photo"
                      >
                        <div className="w-full h-full rounded-full bg-white transition-transform" />
                      </button>
                    ) : (
                      !isRecording ? (
                        <button
                          onClick={startRecording}
                          className="w-18 h-18 rounded-full border-4 border-white p-1 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl cursor-pointer"
                          title="Record Video"
                        >
                          <div className="w-full h-full rounded-full bg-red-600 transition-transform" />
                        </button>
                      ) : (
                        <button
                          onClick={stopRecording}
                          className="w-18 h-18 rounded-full border-4 border-white p-1 flex items-center justify-center active:scale-95 transition-all shadow-2xl animate-pulse cursor-pointer"
                          title="Stop Recording"
                        >
                          <div className="w-7 h-7 rounded-md bg-red-600 transition-transform" />
                        </button>
                      )
                    )}

                    {/* Flip Camera / Quick Action */}
                    <button
                      onClick={toggleCamera}
                      className="flex flex-col items-center gap-1 p-2 text-white hover:text-blue-300 opacity-90 transition-all"
                      title="Flip Camera"
                    >
                      <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
                        <RefreshCw size={19} />
                      </div>
                      <span className="text-[10px] font-bold tracking-wider uppercase">Flip</span>
                    </button>
                  </div>
                </>
              ) : (
                /* Post-Capture Review Controls (in English) */
                <div className="w-full flex items-center justify-center gap-4 max-w-sm">
                  <button
                    onClick={() => {
                      setCapturedPhoto(null);
                      clearRecordedVideo();
                      startCamera();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 px-5 bg-white/15 hover:bg-white/25 backdrop-blur-md text-white rounded-2xl text-xs font-bold transition-all border border-white/20 active:scale-95 shadow-lg"
                  >
                    <RotateCcw size={16} />
                    <span>Retake</span>
                  </button>

                  <a
                    href={capturedPhoto || recordedVideoUrl || '#'}
                    download={capturedPhoto ? `next_photo_${Date.now()}.jpg` : `next_video_${Date.now()}.${recordedVideoExt}`}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 px-5 bg-[#1877F2] hover:bg-blue-600 text-white rounded-2xl text-xs font-bold transition-all shadow-lg active:scale-95"
                  >
                    <Download size={16} />
                    <span>Download</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Lab;
