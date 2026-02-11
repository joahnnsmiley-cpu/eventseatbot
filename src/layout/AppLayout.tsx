import React from 'react';

type AppLayoutProps = {
  children: React.ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0a0a0a] to-black text-white pb-24">
      <div className="max-w-[420px] mx-auto min-h-screen">
        {children}
      </div>
    </div>
  );
}
