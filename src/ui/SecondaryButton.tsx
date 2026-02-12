import React from 'react';

type SecondaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function SecondaryButton({ children, className = '', ...props }: SecondaryButtonProps) {
  return (
    <button
      className={`lux-button-secondary ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
