import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, AlertCircle, Code, ChevronLeft, Play, ExternalLink, Camera, RefreshCw, Download, RotateCcw, Video, StopCircle, Sparkles } from 'lucide-react';

const Lab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'menu' | 'ebooks' | 'coderunner' | 'camera'>('menu');
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
  <p>Write your HTML, CSS, and JS here.</p>
  <button onclick="alert('Running offline!')">Test JavaScript</button>
</body>
</html>`);
  const [runCode, setRunCode] = useState(htmlCode);

  // Camera Lab state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraFilter, setCameraFilter] = useState('none');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

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

  const activeFilterCss = filters.find(f => f.id === cameraFilter)?.css || '';

  const startCamera = useCallback(async () => {
    try {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      const constraints: MediaStreamConstraints = {
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setHasCameraPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
        setStream(videoOnly);
        setHasCameraPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = videoOnly;
          videoRef.current.play().catch(() => {});
        }
      } catch (e2) {
        setHasCameraPermission(false);
      }
    }
  }, [facingMode]);

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        setStream(null);
      }
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeTab, facingMode]);

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
        setRecordedVideoUrl(videoUrl);
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (e) {
      console.error('Recording start failed:', e);
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
    <div className="flex flex-col flex-1 h-[calc(100vh-140px)] md:h-full w-full bg-gray-50 dark:bg-black md:rounded-xl shadow-sm border-0 md:border border-gray-200 dark:border-gray-800 overflow-hidden max-w-[1200px] mx-auto">
      
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-3">
          {activeTab !== 'menu' && (
            <button 
              onClick={() => {
                setActiveTab('menu');
                setCapturedPhoto(null);
                setRecordedVideoUrl(null);
              }}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft size={24} className="text-gray-700 dark:text-gray-300" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            {activeTab === 'coderunner' ? (
              <Code className="text-[#1877F2]" size={20} />
            ) : activeTab === 'camera' ? (
              <Camera className="text-[#1877F2]" size={20} />
            ) : (
              <BookOpen className="text-[#1877F2]" size={20} />
            )}
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white leading-tight">
              {activeTab === 'menu' 
                ? 'Lab Area' 
                : activeTab === 'ebooks' 
                  ? 'E-Books Library' 
                  : activeTab === 'camera' 
                    ? 'Camera Studio' 
                    : 'Code Runner'}
            </h1>
            <p className="text-sm text-gray-500 font-medium">
              {activeTab === 'menu' 
                ? 'Select a tool to get started' 
                : activeTab === 'ebooks' 
                  ? 'Browse and read books directly' 
                  : activeTab === 'camera'
                    ? 'Capture photos, record clips, and preview filters'
                    : 'Run HTML, CSS & JS directly in your browser'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full relative overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-900">
        {activeTab === 'menu' && (
          <div className="p-4 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={() => setActiveTab('ebooks')}
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

            <button 
              onClick={() => setActiveTab('coderunner')}
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

            {/* Camera Studio positioned under Code Runner with matching theme color */}
            <button 
              onClick={() => setActiveTab('camera')}
              className="flex flex-col items-center justify-center gap-4 p-8 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all group active:scale-95 sm:col-span-2"
            >
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 text-[#1877F2] dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <Camera size={32} />
              </div>
              <div className="text-center">
                <h2 className="font-bold text-lg text-gray-900 dark:text-white">Camera Studio</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ক্যামেরা দিয়ে ছবি ও ভিডিও ক্লিপ তুলুন এবং ফিল্টার প্রয়োগ করুন</p>
              </div>
            </button>
          </div>
        )}

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
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#1877F2] hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
                >
                  <ExternalLink size={14} /> Open in new tab
                </a>
              </div>
            </div>
            <iframe 
              src="https://drive.google.com/embeddedfolderview?id=17dLwRV5ENwdoZvYNQenOOd4YG2GjzeGq#list" 
              width="100%" 
              height="100%" 
              frameBorder="0"
              className="w-full h-full border-0 flex-1"
              title="E-Books Lab"
              allow="autoplay"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            ></iframe>
          </div>
        )}

        {activeTab === 'coderunner' && (
          <div className="flex flex-col h-full w-full absolute inset-0 md:flex-row">
            <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-800">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 px-2 uppercase tracking-wider">HTML/CSS/JS Editor</span>
                <button 
                  onClick={handleRunCode}
                  className="flex items-center gap-1 px-4 py-1.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-bold rounded-md transition-colors"
                >
                  <Play size={16} fill="currentColor" /> Run Code
                </button>
              </div>
              <textarea
                value={htmlCode}
                onChange={(e) => setHtmlCode(e.target.value)}
                className="flex-1 w-full bg-[#1e1e1e] text-[#d4d4d4] p-4 font-mono text-sm border-none focus:ring-0 resize-none outline-none"
                spellCheck="false"
                placeholder="Write your HTML code here..."
              ></textarea>
            </div>
            <div className="flex-1 flex flex-col bg-white h-[50vh] md:h-auto">
              <div className="p-2 bg-gray-100 dark:bg-gray-900 border-b border-t md:border-t-0 border-gray-200 dark:border-gray-800 flex items-center">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 px-2 uppercase tracking-wider">Preview (Offline output)</span>
              </div>
              <iframe 
                srcDoc={runCode}
                title="Code Preview" 
                className="w-full h-full border-none bg-white"
                sandbox="allow-scripts allow-forms allow-popups allow-modals"
              ></iframe>
            </div>
          </div>
        )}

        {activeTab === 'camera' && (
          <div className="flex flex-col items-center justify-between p-4 sm:p-6 h-full max-w-xl mx-auto space-y-4">
            {/* Viewport */}
            <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-black rounded-2xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-800 flex items-center justify-center">
              {hasCameraPermission === false && (
                <div className="text-center p-6 text-white space-y-2">
                  <Camera size={36} className="mx-auto text-red-500" />
                  <p className="text-sm font-semibold">ক্যামেরা পারমিশন পাওয়া যায়নি</p>
                  <button
                    onClick={startCamera}
                    className="px-4 py-1.5 bg-[#1877F2] text-white rounded-full text-xs font-bold"
                  >
                    পুনরায় চেষ্টা করুন
                  </button>
                </div>
              )}

              {!capturedPhoto && !recordedVideoUrl ? (
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
                    <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 text-white text-xs px-3 py-1 rounded-full font-bold shadow-md animate-pulse">
                      <span className="w-2 h-2 bg-white rounded-full"></span>
                      <span>REC {Math.floor(recordingSeconds / 60)}:{('0' + (recordingSeconds % 60)).slice(-2)}</span>
                    </div>
                  )}
                </>
              ) : capturedPhoto ? (
                <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
              ) : (
                <video src={recordedVideoUrl || ''} controls autoPlay playsInline className="w-full h-full object-cover" />
              )}
            </div>

            {/* Filter Buttons */}
            {!capturedPhoto && !recordedVideoUrl && (
              <div className="flex items-center gap-2 overflow-x-auto py-1 w-full justify-center no-scrollbar">
                {filters.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setCameraFilter(f.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                      cameraFilter === f.id
                        ? 'bg-[#1877F2] text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {/* Controls Bar */}
            <div className="w-full flex items-center justify-around py-2 border-t border-gray-100 dark:border-gray-800">
              {!capturedPhoto && !recordedVideoUrl ? (
                <>
                  <button
                    onClick={toggleCamera}
                    className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-all active:scale-95"
                    title="Flip Camera"
                  >
                    <RefreshCw size={20} />
                  </button>

                  <button
                    onClick={takePhoto}
                    className="p-4 rounded-full bg-[#1877F2] hover:bg-blue-600 text-white shadow-lg active:scale-95 transition-all flex items-center justify-center"
                    title="Take Photo"
                  >
                    <Camera size={26} />
                  </button>

                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="p-3.5 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg active:scale-95 transition-all flex items-center justify-center"
                      title="Record Video"
                    >
                      <Video size={22} />
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="p-3.5 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg active:scale-95 transition-all flex items-center justify-center animate-bounce"
                      title="Stop Recording"
                    >
                      <StopCircle size={22} />
                    </button>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      setCapturedPhoto(null);
                      setRecordedVideoUrl(null);
                      startCamera();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-full text-xs font-bold hover:bg-gray-200 transition-all"
                  >
                    <RotateCcw size={16} />
                    <span>নতুন তুলুন</span>
                  </button>

                  <a
                    href={capturedPhoto || recordedVideoUrl || '#'}
                    download={capturedPhoto ? `next_lab_photo_${Date.now()}.jpg` : `next_lab_video_${Date.now()}.webm`}
                    className="flex items-center gap-1.5 px-5 py-2 bg-[#1877F2] text-white rounded-full text-xs font-bold hover:bg-blue-600 transition-all shadow-md"
                  >
                    <Download size={16} />
                    <span>ডাউনলোড করুন</span>
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
