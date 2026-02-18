import React, { memo } from 'react';
import { useCountdown } from '../../src/hooks/useCountdown';
import CountdownDisplay from './CountdownDisplay';

type CountdownCardProps = {
  eventDate: string;
  label?: string;
  variant?: 'guest' | 'organizer';
};

/** Isolated countdown — owns useCountdown state to avoid parent re-renders every second. */
function CountdownCardInner({ eventDate, label = 'До начала вечера', variant = 'guest' }: CountdownCardProps) {
  const countdown = useCountdown(eventDate || '');
  return (
    <>
      <p
        style={{
          fontSize: variant === 'guest' ? 14 : 13,
          color: '#6b7280',
          marginBottom: variant === 'guest' ? 16 : 12,
          marginTop: 0,
          ...(variant === 'organizer' && {
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }),
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
        <CountdownDisplay countdown={countdown} variant={variant} />
      </div>
    </>
  );
}

export default memo(CountdownCardInner);
