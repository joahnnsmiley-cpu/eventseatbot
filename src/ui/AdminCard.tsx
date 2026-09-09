import React from 'react';

type AdminCardProps = {
  children: React.ReactNode;
  className?: string;
  /** Optional heading. Was passed by AdminPanel but silently dropped before. */
  title?: string;
};

export default function AdminCard({ children, className = '', title }: AdminCardProps) {
  return (
    <div className={`admin-card ${className}`.trim()}>
      {title && <div className="text-sm font-semibold mb-3">{title}</div>}
      {children}
    </div>
  );
}
