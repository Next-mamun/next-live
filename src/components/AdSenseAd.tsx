import React, { useEffect, useState, useRef } from 'react';

interface AdSenseAdProps {
  slotType?: 'display' | 'infeed';
  className?: string;
}

const CLIENT_ID = 'ca-pub-1044610166642937';
const DISPLAY_SLOT = '6970765232';
const INFEED_SLOT = '7198046270';
const INFEED_LAYOUT_KEY = '-6t+ed+2i-1n-4w';

const ensureAdSenseScript = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('next-adsense-script')) return;
  try {
    const s = document.createElement('script');
    s.id = 'next-adsense-script';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT_ID}`;
    s.onerror = () => {};
    document.head.appendChild(s);
  } catch (_) {}
};

const AdSenseAd: React.FC<AdSenseAdProps> = ({ slotType = 'infeed', className = '' }) => {
  const [adLoaded, setAdLoaded] = useState(false);
  const [isUnfilled, setIsUnfilled] = useState(false);
  const adRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    ensureAdSenseScript();
    // Only execute if not already pushed
    if (!pushedRef.current && adRef.current) {
      try {
        const isAlreadyProcessed = adRef.current.hasAttribute('data-adsbygoogle-status') || 
                                  adRef.current.hasAttribute('data-ad-status') ||
                                  adRef.current.childNodes.length > 0;
        if (!isAlreadyProcessed) {
          ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
          pushedRef.current = true;
        }
      } catch (e: any) {
        // Silently ignore already-pushed or ad-block errors
      }
    }

    if (adRef.current) {
      const checkAdStatus = () => {
        if (!adRef.current) return;
        const status = adRef.current.getAttribute('data-ad-status');
        const googleStatus = adRef.current.getAttribute('data-adsbygoogle-status');

        if (status === 'unfilled') {
          setIsUnfilled(true);
          setAdLoaded(false);
          return;
        }

        if (status === 'filled' || googleStatus === 'done') {
          // Verify that something actual (iframe or non-empty content with height > 0) is rendered
          const hasRendered = adRef.current.offsetHeight > 10 || 
                              adRef.current.querySelector('iframe') !== null ||
                              adRef.current.innerHTML.trim().length > 20;
          if (hasRendered) {
            setAdLoaded(true);
            setIsUnfilled(false);
          }
        }
      };

      const observer = new MutationObserver(() => {
        checkAdStatus();
      });

      observer.observe(adRef.current, { attributes: true, childList: true, subtree: true });

      // Fallback check after 3 seconds: if no ad has rendered, keep it hidden
      const fallbackTimer = setTimeout(() => {
        checkAdStatus();
        if (adRef.current) {
          const status = adRef.current.getAttribute('data-ad-status');
          if (status === 'unfilled' || (!adLoaded && adRef.current.offsetHeight <= 10 && !adRef.current.querySelector('iframe'))) {
            setIsUnfilled(true);
          }
        }
      }, 3500);

      return () => {
        observer.disconnect();
        clearTimeout(fallbackTimer);
      };
    }
  }, [slotType, adLoaded]);

  // If unfilled or not connected/loaded, do not take any visual space
  if (isUnfilled) {
    return null;
  }

  const isDisplay = slotType === 'display';

  return (
    <div
      className={`transition-all duration-300 ${adLoaded ? 'block mb-4' : 'w-full h-0 overflow-hidden opacity-0 pointer-events-none m-0 p-0'} ${className}`}
    >
      <div className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden p-3 flex flex-col items-center justify-center">
        <div className="w-full flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Sponsored
          </span>
        </div>

        <div className="w-full overflow-hidden flex justify-center items-center min-h-[50px]">
          {isDisplay ? (
            <ins
              ref={adRef}
              className="adsbygoogle"
              style={{ display: 'block', maxWidth: '100%', minWidth: '280px', textAlign: 'center' }}
              data-ad-client={CLIENT_ID}
              data-ad-slot={DISPLAY_SLOT}
              data-ad-format="auto"
              data-full-width-responsive="true"
            />
          ) : (
            <ins
              ref={adRef}
              className="adsbygoogle"
              style={{ display: 'block', width: '100%' }}
              data-ad-format="fluid"
              data-ad-layout-key={INFEED_LAYOUT_KEY}
              data-ad-client={CLIENT_ID}
              data-ad-slot={INFEED_SLOT}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdSenseAd;
