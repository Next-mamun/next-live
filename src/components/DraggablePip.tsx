import React, { useState, useRef, useEffect } from 'react';
import { VideoStreamPlayer } from './VideoStreamPlayer';
import { Mic, MicOff } from 'lucide-react';

interface DraggablePipProps {
  id: string;
  stream: MediaStream;
  name: string;
  avatar?: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isSpeaking?: boolean;
  initialPosition?: { x: number; y: number };
  onClose?: () => void;
}

export const DraggablePip: React.FC<DraggablePipProps> = ({
  id,
  stream,
  name,
  avatar,
  isLocal = false,
  isMuted = false,
  isSpeaking = false,
  initialPosition = { x: 16, y: 70 },
  onClose
}) => {
  const [pos, setPos] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    e.stopPropagation();
    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;
    
    // Constrain to window bounds
    const maxX = Math.max(0, window.innerWidth - 140);
    const maxY = Math.max(0, window.innerHeight - 180);
    
    const newX = Math.min(Math.max(8, dragStartRef.current.startPosX + deltaX), maxX);
    const newY = Math.min(Math.max(60, dragStartRef.current.startPosY + deltaY), maxY);
    
    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
  };

  return (
    <div
      ref={containerRef}
      id={`pip-${id}`}
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        touchAction: 'none',
        zIndex: 100
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`w-28 h-36 sm:w-36 sm:h-48 rounded-2xl overflow-hidden shadow-2xl bg-gray-900 border-2 transition-shadow cursor-grab active:cursor-grabbing select-none ${
        isSpeaking ? 'border-green-500 shadow-green-500/30' : isLocal ? 'border-blue-500/60 shadow-blue-500/20' : 'border-white/20'
      }`}
    >
      <div className="w-full h-full relative">
        <VideoStreamPlayer
          stream={stream}
          isMuted={isLocal} // Always mute local to prevent echo
          isMirrored={isLocal}
          className="w-full h-full object-cover"
        />

        {/* Gradient Overlay for Label */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[10px] font-bold text-white truncate max-w-[80px] sm:max-w-[100px]">
              {isLocal ? 'You' : name}
            </span>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            {isMuted ? (
              <span className="bg-red-500/80 p-0.5 rounded-full text-white">
                <MicOff size={10} />
              </span>
            ) : isSpeaking ? (
              <span className="bg-green-500/80 p-0.5 rounded-full text-white animate-pulse">
                <Mic size={10} />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DraggablePip;
