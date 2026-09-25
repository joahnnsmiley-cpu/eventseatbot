import React from 'react';

type SectionTitleProps = {
  title: string;
  className?: string;
};

export default function SectionTitle({ title, className }: SectionTitleProps) {
  return (
    <h2 className={`text-[13px] tracking-normal text-muted mb-3 ${className ?? ''}`.trim()}>
      {title}
    </h2>
  );
}
