import React from 'react';

type SectionTitleProps = {
  title: string;
};

export default function SectionTitle({ title }: SectionTitleProps) {
  return (
    <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-3">
      {title}
    </h2>
  );
}
