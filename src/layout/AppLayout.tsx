import React from 'react';

const BOTTOM_NAV_HEIGHT = 72;

type AppLayoutProps = {
  children: React.ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen max-w-[420px] mx-auto relative bg-black text-white overflow-x-hidden">
      <div
        className="flex-1 overflow-y-auto px-4 w-full"
        style={{
          paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
