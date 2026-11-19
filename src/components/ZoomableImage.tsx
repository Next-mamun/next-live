import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { optimizeCloudinaryUrl } from '@/lib/utils';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
}

const ZoomableImage: React.FC<ZoomableImageProps> = ({ src, alt, className, referrerPolicy }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const scaleRef = useRef(1);
  const viewerTokenRef = useRef<string>('');
  const hasPushedHistoryRef = useRef(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const closeViewer = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (
      hasPushedHistoryRef.current &&
      window.history.state?.zoomableToken === viewerTokenRef.current
    ) {
      window.history.back();
    } else {
      hasPushedHistoryRef.current = false;
      setIsOpen(false);
      scaleRef.current = 1;
      setIsZoomed(false);
    }
  }, []);

  // Intercept phone hardware back button, browser back button, and Escape key
  useEffect(() => {
    if (!isOpen) return;

    const token = `zoom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    viewerTokenRef.current = token;
    window.history.pushState({ ...(window.history.state || {}), zoomableToken: token }, '');
    hasPushedHistoryRef.current = true;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handlePopState = () => {
      if (window.history.state?.zoomableToken !== viewerTokenRef.current) {
        hasPushedHistoryRef.current = false;
        setIsOpen(false);
        scaleRef.current = 1;
        setIsZoomed(false);
      }
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        closeViewer();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeViewer]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && scaleRef.current <= 1.02) {
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      swipeStartRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || scaleRef.current > 1.02) {
      swipeStartRef.current = null;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!swipeStartRef.current || scaleRef.current > 1.02 || e.changedTouches.length !== 1) {
      swipeStartRef.current = null;
      return;
    }
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;

    if (dy > 95 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      closeViewer();
    }
  };

  const fullScreenViewer = isOpen
    ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full screen image viewer"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center select-none touch-none"
        >
          <button
            type="button"
            aria-label="Back"
            onClick={closeViewer}
            className="fixed top-3 left-3 sm:top-4 sm:left-4 z-[10000] w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 active:scale-95 text-white flex items-center justify-center backdrop-blur-sm border border-white/15 transition-all"
          >
            <ArrowLeft size={20} strokeWidth={2.25} />
          </button>

          <div
            className="w-full h-full flex items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget && scaleRef.current <= 1.02) {
                closeViewer(e);
              }
            }}
          >
            <TransformWrapper
              initialScale={1}
              minScale={1}
              maxScale={5}
              centerOnInit={true}
              centerZoomedOut={true}
              limitToBounds={true}
              doubleClick={{ disabled: false, mode: 'toggle', step: 2.2 }}
              panning={{ disabled: !isZoomed }}
              wheel={{ disabled: false, step: 0.15 }}
              pinch={{ disabled: false, step: 5 }}
              onTransform={(_ref, state) => {
                scaleRef.current = state.scale;
                const zoomed = state.scale > 1.02;
                setIsZoomed((prev) => (prev === zoomed ? prev : zoomed));
              }}
            >
              <TransformComponent
                wrapperClass="!w-screen !h-[100dvh] flex items-center justify-center"
                contentClass="!w-screen !h-[100dvh] flex items-center justify-center"
              >
                <img
                  src={optimizeCloudinaryUrl(src, { width: 1920, type: 'image' })}
                  alt={alt || 'Photo'}
                  draggable={false}
                  className={`max-w-full max-h-full w-auto h-auto object-contain select-none ${
                    isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
                  }`}
                  referrerPolicy={referrerPolicy}
                />
              </TransformComponent>
            </TransformWrapper>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={alt ? `View ${alt}` : 'View photo full screen'}
        className="w-full h-full flex items-center justify-center overflow-hidden cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          scaleRef.current = 1;
          setIsZoomed(false);
          setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            scaleRef.current = 1;
            setIsZoomed(false);
            setIsOpen(true);
          }
        }}
      >
        <img
          src={optimizeCloudinaryUrl(src, { width: 1080, type: 'image' })}
          alt={alt || ''}
          loading="lazy"
          className={className}
          referrerPolicy={referrerPolicy}
        />
      </div>
      {fullScreenViewer}
    </>
  );
};

export default ZoomableImage;
