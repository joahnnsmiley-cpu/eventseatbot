import React, { useState, useEffect } from 'react';

const BOTTOM_NAV_HEIGHT = 140;

type AppLayoutProps = {
  children: React.ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  const [showScrollShadow, setShowScrollShadow] = useState(false);

  useEffect(() => {
    // The scroll handler used to call setState on every scroll event, so React
    // re-rendered this component on each frame of every scroll for a shadow
    // that has only two states. Coalesce to one check per frame and only set
    // state when the answer actually changes.
    let frame = 0;
    let shown = false;
    const check = () => {
      frame = 0;
      const next = window.scrollY > 8;
      if (next !== shown) {
        shown = next;
        setShowScrollShadow(next);
      }
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const grainDataUrl =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E";

  return (
    <div
      className="flex flex-col w-full max-w-[420px] mx-auto relative bg-[#0B0A09] text-white overflow-x-hidden min-h-[100dvh]"
      style={{
        paddingTop: 'calc(var(--vk-safe-top, 0px) + env(safe-area-inset-top))',
      }}
    >
      {/*
        Subtle grain — luxury film look. No mixBlendMode: a full-screen fixed
        layer that blends forces the compositor to re-blend the whole viewport
        on every frame, which is one of the classic sources of scroll stutter in
        the Telegram webview on mid-range Android. At 4% opacity over black the
        blend was doing nothing visible anyway.
      */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `url(${grainDataUrl})`,
          opacity: 0.04,
          top: 'var(--vk-safe-top, 0px)',
        }}
      />
      {showScrollShadow && (
        <div
          className="fixed left-0 right-0 h-8 z-50 pointer-events-none max-w-[420px] mx-auto"
          style={{
            top: 'var(--vk-safe-top, 0px)',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 100%)',
          }}
        />
      )}
      <div
        data-app-scroll
        className="flex-1 w-full flex flex-col"
      >
        {children}
        <div
          className="w-full shrink-0"
          style={{ height: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))` }}
        />
      </div>
    </div>
  );
}
