import React from 'react';

type AdminCardProps = {
  children: React.ReactNode;
  className?: string;
};

export default function AdminCard({ children, className = '' }: AdminCardProps) {
  return (
    <div className={`admin-card ${className}`.trim()}>
      {children}
    </div>
  );
}
