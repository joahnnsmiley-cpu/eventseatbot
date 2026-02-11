import React from 'react';

type PrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function PrimaryButton({ children, className = '', ...props }: PrimaryButtonProps) {
  return (
    <button
      className={`bg-[#FFC107] text-black font-semibold rounded-xl px-6 py-3 transition active:scale-95 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
