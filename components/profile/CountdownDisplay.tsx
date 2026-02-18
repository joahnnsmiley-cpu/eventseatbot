import React from 'react';
import type { CountdownResult } from '../../src/hooks/useCountdown';

type CountdownDisplayProps = {
  countdown: CountdownResult;
  /** "guest" = larger, "organizer" = smaller */
  variant?: 'guest' | 'organizer';
};

function Block({ value, size, dark }: { value: number; size: string | number; dark?: boolean }) {
  return (
    <span
      style={{
        fontSize: size,
        fontWeight: 700,
        color: dark ? '#F5F2EB' : '#111827',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
      }}
    >
      {String(value).padStart(2, '0')}
    </span>
  );
}

function Sep({ size, dark }: { size: number; dark?: boolean }) {
  return (
    <span style={{ fontSize: size, fontWeight: 300, color: dark ? '#6E6A64' : '#d1d5db', margin: '0 2px' }}>
      :
    </span>
  );
}

export default function CountdownDisplay({ countdown, variant = 'guest' }: CountdownDisplayProps) {
  const blockSize = variant === 'guest' ? 'clamp(36px, 7vw, 44px)' : 'clamp(32px, 6vw, 40px)';
  const sepSize = variant === 'guest' ? 28 : 24;
  const dark = variant === 'organizer';

  return (
    <>
      <Block value={countdown.days} size={blockSize} dark={dark} />
      <Sep size={sepSize} dark={dark} />
      <Block value={countdown.hours} size={blockSize} dark={dark} />
      <Sep size={sepSize} dark={dark} />
      <Block value={countdown.minutes} size={blockSize} dark={dark} />
      <Sep size={sepSize} dark={dark} />
      <Block value={countdown.seconds} size={blockSize} dark={dark} />
    </>
  );
}
