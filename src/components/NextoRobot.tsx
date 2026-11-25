import React, { useState, useRef, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Maximize2, Minimize2, RefreshCw, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/AuthContext';
import Draggable from 'react-draggable';
import NextoRobotStatic, { NextoRobot2DSvg } from './NextoRobotStatic';

const NextoRobot3D = lazy(() => import('./NextoRobot3D'));

const NextoRobot: React.FC = () => {
  const {
    robotMode,
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
            {robotMode === '2d' ? (
              <NextoRobot2DSvg
                size={robotSize}
                animated={true}
                className="drop-shadow-lg cursor-pointer active:cursor-grabbing"
              />
            ) : (
              <Suspense fallback={<NextoRobotStatic size={robotSize} />}>
                <NextoRobot3D
                  size={robotSize}
                  brightness={robotBrightness}
                  emote={robotEmote}
                  emoteEnabled={robotEmoteEnabled}
                  emoteNonce={robotEmoteNonce}
                  animationsEnabled={animationsEnabled}
                  lookTarget={lookTarget}
                />
              </Suspense>
            )}
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
                    title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
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
