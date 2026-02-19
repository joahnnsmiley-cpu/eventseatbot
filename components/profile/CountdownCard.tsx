import React, { memo } from 'react';
import { useCountdown } from '../../src/hooks/useCountdown';
import CountdownDisplay from './CountdownDisplay';

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
        className={useLuxury ? 'text-xs font-semibold text-yellow-500/90 uppercase tracking-[0.12em] mb-3 mt-0' : undefined}
        style={
          useLuxury
            ? undefined
            : {
                fontSize: 14,
                color: '#B8B2A8',
                marginBottom: variant === 'guest' ? 16 : 12,
                marginTop: 0,
              }
        }
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
