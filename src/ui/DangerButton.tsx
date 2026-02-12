import React from 'react';

type DangerButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function DangerButton({ children, className = '', ...props }: DangerButtonProps) {
  return (
    <button
      className={`bg-[#E8CFCF] text-[#7A2E2E] font-semibold rounded-xl px-6 py-3 transition active:scale-95 hover:bg-[#E0C5C5] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
