import React from 'react';
import type { CountdownResult } from '../../src/hooks/useCountdown';

type CountdownDisplayProps = {
  countdown: CountdownResult;
  /** "guest" = larger, "organizer" = smaller */
  variant?: 'guest' | 'organizer';
  /** Force light text on dark background (default: true for organizer, false for guest) */
  dark?: boolean;
};

function Block({
  value,
  size,
  dark,
  cinematic,
}: {
  value: number;
  size: string | number;
  dark?: boolean;
  cinematic?: boolean;
}) {
  return (
    <span
      style={{
        fontSize: size,
        fontWeight: 700,
        color: dark ? '#FFFFFF' : '#111827',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: cinematic ? '0.12em' : '-0.02em',
        fontFamily: cinematic ? "'Cormorant Garamond', Georgia, serif" : undefined,
        textShadow: dark ? '0 1px 2px rgba(0,0,0,0.3)' : undefined,
      }}
    >
      {String(value).padStart(2, '0')}
    </span>
  );
}

function Sep({ size, dark }: { size: number; dark?: boolean }) {
  return (
    <span style={{ fontSize: size, fontWeight: 300, color: dark ? '#B8B2A8' : '#d1d5db', margin: '0 2px' }}>
      :
    </span>
  );
}

export default function CountdownDisplay({ countdown, variant = 'guest', dark: darkProp }: CountdownDisplayProps) {
  const dark = darkProp ?? variant === 'organizer';
  const cinematic = variant === 'organizer' || dark;
  const blockSize = cinematic
    ? 'clamp(40px, 8vw, 52px)'
    : variant === 'guest'
      ? 'clamp(36px, 7vw, 44px)'
      : 'clamp(32px, 6vw, 40px)';
  const sepSize = cinematic ? 32 : variant === 'guest' ? 28 : 24;

  return (
    <>
      <Block value={countdown.days} size={blockSize} dark={dark} cinematic={cinematic} />
      <Sep size={sepSize} dark={dark} />
      <Block value={countdown.hours} size={blockSize} dark={dark} cinematic={cinematic} />
      <Sep size={sepSize} dark={dark} />
      <Block value={countdown.minutes} size={blockSize} dark={dark} cinematic={cinematic} />
      <Sep size={sepSize} dark={dark} />
      <Block value={countdown.seconds} size={blockSize} dark={dark} cinematic={cinematic} />
    </>
  );
}
