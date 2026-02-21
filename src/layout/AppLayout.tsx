import React, { useState, useRef, useEffect } from 'react';

const BOTTOM_NAV_HEIGHT = 140;

type AppLayoutProps = {
  children: React.ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  const [showScrollShadow, setShowScrollShadow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setShowScrollShadow(el.scrollTop > 8);
    check();
    el.addEventListener('scroll', check, { passive: true });
    return () => el.removeEventListener('scroll', check);
  }, []);

  const grainDataUrl =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E";

  return (
    <div
      className="flex flex-col w-full max-w-[420px] mx-auto relative bg-black text-white overflow-x-hidden"
      style={{
        height: '100dvh',
        minHeight: '100vh',
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      {/* Subtle grain overlay — luxury film look */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `url(${grainDataUrl})`,
          opacity: 0.04,
          mixBlendMode: 'overlay',
        }}
      />
      {showScrollShadow && (
        <div
          className="absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 100%)',
          }}
        />
      )}
      <div
        ref={scrollRef}
        data-app-scroll
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full scroll-smooth overscroll-contain"
        style={{
          paddingLeft: '1rem',
          paddingRight: '1rem',
        }}
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
