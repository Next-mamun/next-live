import { useEffect, useRef, useState, useCallback } from 'react';

interface AutoScrollOptions {
  threshold?: number; // Distance in px from bottom to consider 'near bottom'
}

export const useAutoScroll = <T extends HTMLElement>(
  dependency: any,
  options: AutoScrollOptions = { threshold: 120 }
) => {
  const containerRef = useRef<T | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollBottomButton, setShowScrollBottomButton] = useState(false);

  const checkIfNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceToBottom <= (options.threshold || 120);
  }, [options.threshold]);

  const handleScroll = useCallback(() => {
    const near = checkIfNearBottom();
    setIsNearBottom(near);
    setShowScrollBottomButton(!near);
  }, [checkIfNearBottom]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    setShowScrollBottomButton(false);
    setIsNearBottom(true);
  }, []);

  // Trigger scroll on new message ONLY if already near bottom
  useEffect(() => {
    if (isNearBottom) {
      requestAnimationFrame(() => scrollToBottom(false));
    }
  }, [dependency, isNearBottom, scrollToBottom]);

  return { containerRef, isNearBottom, showScrollBottomButton, scrollToBottom, handleScroll };
};
