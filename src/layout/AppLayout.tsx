import React, { useState, useRef, useEffect } from 'react';

const BOTTOM_NAV_HEIGHT = 72;

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
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full scroll-smooth overscroll-contain"
        style={{
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
