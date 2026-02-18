import React from 'react';
import { typography, spacing } from '../../design/theme';

type ProfileHeroProps = {
  title: string;
  subtitle?: string;
};

export default function ProfileHero({ title, subtitle }: ProfileHeroProps) {
  return (
    <header style={{ marginBottom: spacing[5] }}>
      <h1
        className="font-semibold tracking-tight"
        style={{ fontSize: `clamp(28px, 5vw, ${typography.hero})`, color: '#111827' }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{ marginTop: spacing[2], fontSize: `clamp(16px, 2.5vw, ${typography.subtitle})`, color: '#6b7280' }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
}
