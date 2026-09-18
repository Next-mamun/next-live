import React, { useRef, useEffect } from 'react';

interface VideoStreamPlayerProps {
  stream?: MediaStream | null;
  isMuted?: boolean;
  isMirrored?: boolean;
  className?: string;
  autoPlay?: boolean;
  playsInline?: boolean;
  objectFit?: 'cover' | 'contain';
}

export const VideoStreamPlayer: React.FC<VideoStreamPlayerProps> = ({
  stream,
  isMuted = false,
  isMirrored = false,
  className = '',
  autoPlay = true,
  playsInline = true,
  objectFit = 'cover'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    try {
      if (stream) {
        if (el.srcObject !== stream) {
          el.srcObject = stream;
        }
        const playPromise = el.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            // Auto-play was prevented (often due to autoplay policy on unmuted video)
            console.warn('VideoStreamPlayer autoplay catch:', err);
          });
        }
      } else {
        el.srcObject = null;
      }
    } catch (err) {
      console.warn('VideoStreamPlayer stream assignment error:', err);
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay={autoPlay}
      playsInline={playsInline}
      muted={isMuted}
      style={{ objectFit }}
      className={`w-full h-full ${isMirrored ? '-scale-x-100' : ''} ${className}`}
    />
  );
};

export default VideoStreamPlayer;
