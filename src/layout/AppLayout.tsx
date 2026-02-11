import React from 'react';

type AppLayoutProps = {
  children: React.ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <div className="max-w-[420px] mx-auto w-full px-4 pb-24">
        {children}
      </div>
    </div>
  );
}
