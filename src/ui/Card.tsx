import React from 'react';

type CardProps = {
  children: React.ReactNode;
};

export default function Card({ children }: CardProps) {
  return (
    <div
      className="bg-[#0B0B0B] border border-white/10 rounded-2xl p-6"
    >
      {children}
    </div>
  );
}
