import React from 'react';
import type { CountdownResult } from '../../src/hooks/useCountdown';

type CountdownDisplayProps = {
  countdown: CountdownResult;
  /** "guest" = larger, "organizer" = smaller */
  variant?: 'guest' | 'organizer';
};

function Block({ value, size }: { value: number; size: string | number }) {
  return (
    <span
      style={{
        fontSize: size,
        fontWeight: 600,
        color: '#111827',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {String(value).padStart(2, '0')}
    </span>
  );
}

function Sep({ size }: { size: number }) {
  return (
    <span style={{ fontSize: size, fontWeight: 300, color: '#d1d5db', margin: '0 2px' }}>
      :
    </span>
  );
}

export default function CountdownDisplay({ countdown, variant = 'guest' }: CountdownDisplayProps) {
  const blockSize = variant === 'guest' ? 'clamp(36px, 7vw, 44px)' : 'clamp(32px, 6vw, 40px)';
  const sepSize = variant === 'guest' ? 28 : 24;

  return (
    <>
      <Block value={countdown.days} size={blockSize} />
      <Sep size={sepSize} />
      <Block value={countdown.hours} size={blockSize} />
      <Sep size={sepSize} />
      <Block value={countdown.minutes} size={blockSize} />
      <Sep size={sepSize} />
      <Block value={countdown.seconds} size={blockSize} />
    </>
  );
}
