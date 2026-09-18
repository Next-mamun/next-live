import React, { useRef, useEffect } from 'react';

interface RemoteAudioStreamProps {
  stream: MediaStream;
  isMuted?: boolean;
}

export const RemoteAudioStream: React.FC<RemoteAudioStreamProps> = ({ stream, isMuted = false }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !stream) return;

    try {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }

      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('RemoteAudioStream autoplay prevented or waiting for interaction:', err);
        });
      }
    } catch (err) {
      console.warn('RemoteAudioStream error:', err);
    }

    return () => {
      if (el) {
        try {
          el.srcObject = null;
        } catch (e) {}
      }
    };
  }, [stream]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      muted={isMuted}
      style={{ display: 'none' }}
    />
  );
};

export default RemoteAudioStream;
