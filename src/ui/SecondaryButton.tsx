import React from 'react';

type SecondaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function SecondaryButton({ children, className = '', ...props }: SecondaryButtonProps) {
  return (
    <button
      className={`bg-[#ECE6DD] text-[#1C1C1C] font-semibold rounded-xl px-6 py-3 transition active:scale-95 hover:bg-[#E0D9CF] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
