import React, { memo } from 'react';
import { useCountdown } from '../../src/hooks/useCountdown';
import CountdownDisplay from './CountdownDisplay';
import { luxuryLabel } from '../../design/theme';

type CountdownCardProps = {
  eventDate: string;
  label?: string;
  variant?: 'guest' | 'organizer';
  /** Dark background — use light text (for guest on dark layout) */
  dark?: boolean;
};

/** Isolated countdown — owns useCountdown state to avoid parent re-renders every second. */
function CountdownCardInner({ eventDate, label = 'До начала вечера', variant = 'guest', dark = false }: CountdownCardProps) {
  const countdown = useCountdown(eventDate || '');
  const useLuxury = variant === 'organizer' || dark;
  return (
    <>
      <p
        style={{
          ...(useLuxury ? luxuryLabel : {}),
          fontSize: useLuxury ? luxuryLabel.fontSize : 14,
          color: useLuxury ? luxuryLabel.color : '#B8B2A8',
          marginBottom: variant === 'guest' ? 16 : 12,
          marginTop: 0,
        }}
      >
        {label}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'center',
          gap: 4,
          flexWrap: 'wrap',
        }}
      >
        <CountdownDisplay countdown={countdown} variant={variant} dark={dark || variant === 'organizer'} />
      </div>
    </>
  );
}

export default memo(CountdownCardInner);
