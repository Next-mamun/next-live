import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Maximize2, Minimize2, RefreshCw, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/AuthContext';
import Draggable from 'react-draggable';
import NextoRobot3D from './NextoRobot3D';
import NextoRobotStatic from './NextoRobotStatic';

const NextoRobot: React.FC = () => {
  const {
    robotSize,
    robotBrightness,
    robotEmote,
    robotEmoteEnabled,
    robotEmoteNonce,
    animationsEnabled,
  } = useTheme();
  const [showWindow, setShowWindow] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const [lookTarget, setLookTarget] = useState<{ x: number; y: number } | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const targetUrl = 'https://nexto-done.vercel.app';

  const handleRobotClick = () => {
    setShowWindow(true);
    if (!hasOpenedOnce) {
      setHasOpenedOnce(true);
    }
  };

  const robotSvg = (
    <svg
      viewBox="0 0 1024 1024"
      width={robotSize}
      height={robotSize}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Next Robot Logo"
      className="drop-shadow-lg cursor-pointer active:cursor-grabbing select-none"
    >
      <defs>
        <linearGradient id="bodyG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5ee0fd"/>
          <stop offset="100%" stopColor="#258be7"/>
        </linearGradient>
        <style>
          {`
            .eye { animation: blink 3s infinite; transform-origin: center; }
            @keyframes blink {
              0%,90%{opacity:1}
              95%{opacity:0}
              100%{opacity:1}
            }
          `}
        </style>
      </defs>

      {/* BODY */}
      <ellipse cx="512" cy="600" rx="230" ry="280" fill="url(#bodyG)"/>

      {/* ARMS */}
      <ellipse cx="300" cy="610" rx="50" ry="100" fill="url(#bodyG)"/>
      <ellipse cx="720" cy="610" rx="50" ry="100" fill="url(#bodyG)"/>

      {/* CHEST */}
      <rect x="400" y="540" width="220" height="120" rx="20" fill="#0c1b2c"/>
      <text x="425" y="615" fontSize="48" fill="#ffffff" fontFamily="Arial">▶ Next</text>

      {/* HEAD */}
      <ellipse cx="512" cy="320" rx="220" ry="200" fill="url(#bodyG)"/>

      {/* EYES */}
      <ellipse className="eye" cx="440" cy="260" rx="35" ry="35" fill="#000"/>
      <ellipse className="eye" cx="585" cy="260" rx="35" ry="35" fill="#000"/>

      {/* SMILE */}
      <path d="M450,330 Q512,380 575,330" fill="#d21c2c"/>

      {/* CHEEKS */}
      <circle cx="375" cy="310" r="30" fill="#ff7ea8" opacity=".8"/>
      <circle cx="650" cy="310" r="30" fill="#ff7ea8" opacity=".8"/>

      {/* ANTENNAS */}
      <line x1="400" y1="170" x2="360" y2="100" stroke="#4ba3f5" strokeWidth="20"/>
      <circle cx="360" cy="100" r="20" fill="#4ba3f5"/>

      <line x1="620" y1="170" x2="660" y2="100" stroke="#4ba3f5" strokeWidth="20"/>
      <circle cx="660" cy="100" r="20" fill="#4ba3f5"/>

      {/* SHADOW */}
      <ellipse cx="512" cy="900" rx="140" ry="30" fill="#000" opacity=".1"/>
    </svg>
  );

  return (
    <>
      {/* Draggable Robot */}
      <Draggable
        nodeRef={nodeRef}
        onStart={(_e, data) => {
          setIsDragging(false);
          setLookTarget(null);
          dragStartPos.current = { x: data.x, y: data.y };
          document.body.style.overflow = 'hidden';
        }}
        onDrag={() => {
          setIsDragging(true);
        }}
        onStop={(_e, data) => {
          document.body.style.overflow = '';
          // If the movement is less than 5px, consider it a click
          const distance = Math.sqrt(
            Math.pow(data.x - dragStartPos.current.x, 2) +
            Math.pow(data.y - dragStartPos.current.y, 2)
          );

          if (distance < 5) {
            handleRobotClick();
          }

          setTimeout(() => setIsDragging(false), 50);
        }}
      >
        <div
          ref={nodeRef}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 md:bottom-8 md:right-6 z-[9999] touch-none select-none"
          onMouseMove={(e) => {
            if (isDragging) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const nx = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
            const ny = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
            setLookTarget({ x: nx, y: ny });
          }}
          onMouseLeave={() => setLookTarget(null)}
        >
          <motion.div
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            <NextoRobot3D
              size={robotSize}
              brightness={robotBrightness}
              emote={robotEmote}
              emoteEnabled={robotEmoteEnabled}
              emoteNonce={robotEmoteNonce}
              animationsEnabled={animationsEnabled}
              lookTarget={lookTarget}
              fallback={robotSvg}
            />
          </motion.div>
        </div>
      </Draggable>

      {/* In-App Window (Iframe Modal) */}
      <AnimatePresence>
        {showWindow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[10000] flex items-center justify-center ${isFullScreen ? 'p-0' : 'p-4 md:p-8'} bg-black/60 backdrop-blur-sm`}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={`bg-white dark:bg-gray-900 w-full ${isFullScreen ? 'h-full max-w-none rounded-none' : 'max-w-[95vw] md:max-w-3xl h-fit max-h-[90vh] rounded-3xl'} overflow-hidden shadow-2xl flex flex-col border border-white/20 transition-all duration-300`}
            >
              {/* Header */}
              <div className="bg-gray-100 dark:bg-gray-800 p-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 gap-2">
                <div className="flex items-center gap-1.5 px-2">
                  <NextoRobotStatic size={22} />
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-widest">Nexto</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setIsLoading(true);
                      const iframe = document.querySelector('iframe[title="Nexto Window"]') as HTMLIFrameElement;
                      if (iframe) {
                        iframe.src = targetUrl;
                      }
                    }}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw size={18} />
                  </button>
                  <button 
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
                    title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
                  >
                    {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                  <button 
                    onClick={() => {
                      setShowWindow(false);
                      setIsFullScreen(false);
                    }}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Content (Iframe) */}
              <div className="flex-1 relative bg-white dark:bg-gray-800 overflow-auto min-h-[300px]">
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-10">
                    <Loader2 className="animate-spin text-[#1877F2]" size={40} />
                  </div>
                )}
                <iframe 
                  src={targetUrl}
                  className="w-full h-full border-none min-h-[600px]"
                  title="Nexto Window"
                  onLoad={() => setIsLoading(false)}
                  allow="microphone *; camera *; display-capture *; geolocation *; autoplay *; encrypted-media *"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default NextoRobot;
