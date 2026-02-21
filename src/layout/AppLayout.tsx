import React, { useState, useEffect } from 'react';

const BOTTOM_NAV_HEIGHT = 140;

type AppLayoutProps = {
  children: React.ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  const [showScrollShadow, setShowScrollShadow] = useState(false);

  useEffect(() => {
    const check = () => setShowScrollShadow(window.scrollY > 8);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, []);

  const grainDataUrl =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E";

  return (
    <div
      className="flex flex-col w-full max-w-[420px] mx-auto relative bg-black text-white overflow-x-hidden min-h-screen"
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
          className="fixed top-0 left-0 right-0 h-8 z-50 pointer-events-none max-w-[420px] mx-auto"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 100%)',
          }}
        />
      )}
      <div
        data-app-scroll
        className="flex-1 w-full flex flex-col"
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
