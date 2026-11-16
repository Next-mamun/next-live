import React, { useRef, useEffect, useState } from 'react';
import { useTheme } from '@/contexts/AuthContext';
import { Play } from 'lucide-react';

interface EmbedPlayerProps {
  src: string;
}

const EmbedPlayer: React.FC<EmbedPlayerProps> = ({ src }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { autoplayVideos } = useTheme();
  
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Extract YouTube ID for thumbnail
  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };
  
  const ytId = src.includes('youtube') || src.includes('youtu.be') ? getYoutubeId(src) : null;

  useEffect(() => {
    const handleOtherVideoPlaying = (e: CustomEvent) => {
      if (e.detail.src !== src && iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), 
          '*'
        );
      }
    };
    window.addEventListener('single-video-play' as any, handleOtherVideoPlaying);
    return () => window.removeEventListener('single-video-play' as any, handleOtherVideoPlaying);
  }, [src]);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Lazy load iframe when it comes near viewport
    const loadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !shouldLoad) {
          setShouldLoad(true);
        }
      },
      { rootMargin: "200px 0px" } // Load a bit before it comes into view
    );
    loadObserver.observe(containerRef.current);

    const playObserver = new IntersectionObserver(
      ([entry]) => {
        if (!iframeRef.current) return;
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) {
          iframeRef.current.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), 
            '*'
          );
        } else if (entry.intersectionRatio >= 0.5 && autoplayVideos && isPlaying) {
           iframeRef.current.contentWindow?.postMessage(
             JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), 
             '*'
           );
           window.dispatchEvent(new CustomEvent('single-video-play', { detail: { src } }));
        }
      },
      { threshold: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0], rootMargin: "-30% 0px -30% 0px" }
    );
    
    if (containerRef.current) {
      playObserver.observe(containerRef.current);
    }

    return () => {
      loadObserver.disconnect();
      playObserver.disconnect();
    };
  }, [autoplayVideos, src, shouldLoad, isPlaying]);

  const getEnhancedSrc = (url: string) => {
    let enhancedUrl = url;
    if (enhancedUrl.includes('youtube.com') || enhancedUrl.includes('youtu.be')) {
      if (!enhancedUrl.includes('enablejsapi=1')) {
        enhancedUrl = enhancedUrl.includes('?') ? `${enhancedUrl}&enablejsapi=1` : `${enhancedUrl}?enablejsapi=1`;
      }
      if (isPlaying) {
        enhancedUrl = enhancedUrl.includes('?') ? `${enhancedUrl}&autoplay=1` : `${enhancedUrl}?autoplay=1`;
      }
    }
    return enhancedUrl;
  };

  const handlePlayClick = () => {
    setIsPlaying(true);
    setShouldLoad(true);
  };

  const isFacebook = src.includes('facebook') || src.includes('fb.watch');

  return (
    <div ref={containerRef} className="w-full aspect-video bg-black relative group cursor-pointer overflow-hidden">
      {!isPlaying && (
        <div onClick={handlePlayClick} className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-black to-zinc-900 hover:bg-black/80 transition-colors">
          {ytId ? (
            <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} loading="lazy" className="w-full h-full object-cover opacity-85" alt="Video Thumbnail" />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                {isFacebook ? 'Facebook Video' : 'Embedded Video'}
              </span>
              <span className="text-xs text-zinc-500">Tap to play</span>
            </div>
          )}
          <div className={`absolute w-16 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-lg ${ytId ? 'bg-red-600 group-hover:bg-red-500' : 'bg-[#1877F2] group-hover:bg-[#166fe5]'}`}>
            <Play fill="white" className="text-white ml-1 w-6 h-6" />
          </div>
        </div>
      )}
      {isPlaying && (
        <iframe
          ref={iframeRef}
          src={getEnhancedSrc(src)}
          className="w-full h-full absolute inset-0 z-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
          title="video-embed"
        />
      )}
    </div>
  );
};

export default EmbedPlayer;
