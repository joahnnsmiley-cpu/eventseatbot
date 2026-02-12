import React from 'react';

type DangerButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function DangerButton({ children, className = '', ...props }: DangerButtonProps) {
  return (
    <button
      type="button"
      className={`lux-danger ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
