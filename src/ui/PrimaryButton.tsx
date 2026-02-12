import React from 'react';

type PrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function PrimaryButton({ children, className = '', ...props }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      className={`primary-button ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
