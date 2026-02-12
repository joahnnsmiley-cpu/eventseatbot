import React from 'react';

type PrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function PrimaryButton({ children, className = '', ...props }: PrimaryButtonProps) {
  return (
    <button
      className={`bg-[#C6A75E] text-white font-semibold rounded-xl px-6 py-3 transition active:scale-95 hover:bg-[#B89A52] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
