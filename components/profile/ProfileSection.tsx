import React from 'react';

type ProfileSectionProps = {
  title?: string;
  children: React.ReactNode;
};

export default function ProfileSection({ title, children }: ProfileSectionProps) {
  return (
    <section className="mb-8 last:mb-0">
      {title && (
        <h2
          className="font-medium mb-4"
          style={{ fontSize: 'clamp(16px, 2.5vw, 18px)', color: '#374151' }}
        >
          {title}
        </h2>
      )}
      <div style={{ color: '#6b7280', fontSize: 15 }}>{children}</div>
    </section>
  );
}
