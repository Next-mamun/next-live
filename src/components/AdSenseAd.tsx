import React, { useEffect, useState, useRef } from 'react';

interface AdSenseAdProps {
  slotType?: 'display' | 'infeed';
  className?: string;
}

const CLIENT_ID = 'ca-pub-1044610166642937';
const DISPLAY_SLOT = '6970765232';
const INFEED_SLOT = '7198046270';
const INFEED_LAYOUT_KEY = '-6t+ed+2i-1n-4w';

let adSenseScriptPromise: Promise<boolean> | null = null;

const waitForAdSenseScript = (): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false);
  }

  const adsGlobal = (window as any).adsbygoogle;
  if (adsGlobal && (adsGlobal.loaded === true || !Array.isArray(adsGlobal))) {
    return Promise.resolve(true);
  }

  if (adSenseScriptPromise) {
    return adSenseScriptPromise;
  }

  adSenseScriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.getElementById('next-adsense-script') as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any)._adSenseSettled) {
        resolve(Boolean((existing as any)._adSenseOk));
        return;
      }
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      setTimeout(() => {
        const g = (window as any).adsbygoogle;
        resolve(Boolean(g && (g.loaded === true || !Array.isArray(g))));
      }, 8000);
      return;
    }

    try {
      const s = document.createElement('script');
      s.id = 'next-adsense-script';
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT_ID}`;

      const finish = (ok: boolean) => {
        (s as any)._adSenseSettled = true;
        (s as any)._adSenseOk = ok;
        resolve(ok);
      };

      s.onload = () => finish(true);
      s.onerror = () => finish(false);
      document.head.appendChild(s);
    } catch (_) {
      resolve(false);
    }
  });

  return adSenseScriptPromise;
};

const AdSenseAd: React.FC<AdSenseAdProps> = ({ slotType = 'infeed', className = '' }) => {
  const [adLoaded, setAdLoaded] = useState(false);
  const [isUnfilled, setIsUnfilled] = useState(false);
  const adRef = useRef<HTMLModElement>(null);
  const adLoadedRef = useRef(false);

  useEffect(() => {
    adLoadedRef.current = adLoaded;
  }, [adLoaded]);

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;

    setAdLoaded(false);
    setIsUnfilled(false);
    adLoadedRef.current = false;

    const el = adRef.current;
    if (!el) return;

    const checkAdStatus = () => {
      const node = adRef.current;
      if (!node || cancelled) return;
      const status = node.getAttribute('data-ad-status');
      const googleStatus = node.getAttribute('data-adsbygoogle-status');

      if (status === 'unfilled') {
        setIsUnfilled(true);
        setAdLoaded(false);
        return;
      }

      if (status === 'filled' || googleStatus === 'done') {
        const hasRendered =
          node.offsetHeight > 10 ||
          node.querySelector('iframe') !== null ||
          node.innerHTML.trim().length > 20;
        if (hasRendered) {
          setAdLoaded(true);
          setIsUnfilled(false);
        }
      }
    };

    observer = new MutationObserver(() => {
      checkAdStatus();
    });
    observer.observe(el, { attributes: true, childList: true, subtree: true });

    waitForAdSenseScript().then((ready) => {
      if (cancelled) return;
      if (!ready) {
        setIsUnfilled(true);
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const node = adRef.current;
        if (!node || !node.isConnected) return;

        // Ensure AdSense script actually initialized its push processor before pushing,
        // and verify this exact <ins> slot is genuinely unprocessed.
        const adsQueue = (window as any).adsbygoogle;
        const isScriptInitialized = adsQueue && (adsQueue.loaded === true || !Array.isArray(adsQueue));
        if (!isScriptInitialized) {
          setIsUnfilled(true);
          return;
        }

        const alreadyHandled =
          node.hasAttribute('data-adsbygoogle-status') ||
          node.hasAttribute('data-ad-status') ||
          node.hasAttribute('data-next-ad-pushed') ||
          node.childElementCount > 0 ||
          node.getBoundingClientRect().width <= 0;

        if (!alreadyHandled) {
          const unprocessedCount = Array.from(document.querySelectorAll('ins.adsbygoogle')).filter(
            (ins) =>
              !ins.hasAttribute('data-adsbygoogle-status') &&
              !ins.hasAttribute('data-ad-status') &&
              !ins.hasAttribute('data-next-ad-pushed')
          ).length;

          if (unprocessedCount > 0) {
            try {
              node.setAttribute('data-next-ad-pushed', '1');
              adsQueue.push({});
            } catch (_) {
              setIsUnfilled(true);
              return;
            }
          }
        }

        checkAdStatus();

        fallbackTimer = setTimeout(() => {
          if (cancelled) return;
          checkAdStatus();
          const current = adRef.current;
          if (current) {
            const status = current.getAttribute('data-ad-status');
            if (
              status === 'unfilled' ||
              (!adLoadedRef.current && current.offsetHeight <= 10 && !current.querySelector('iframe'))
            ) {
              setIsUnfilled(true);
            }
          }
        }, 3500);
      });
    });

    return () => {
      cancelled = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [slotType]);

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
              key="display"
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
              key="infeed"
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
