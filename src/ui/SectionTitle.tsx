import React from 'react';

type SectionTitleProps = {
  title: string;
  className?: string;
};

export default function SectionTitle({ title, className }: SectionTitleProps) {
  return (
    <h2 className={`text-xs uppercase tracking-widest text-muted mb-3 ${className ?? ''}`.trim()}>
      {title}
    </h2>
  );
}
