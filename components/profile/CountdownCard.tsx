import React, { memo } from 'react';
import { useCountdown } from '../../src/hooks/useCountdown';
import CountdownDisplay from './CountdownDisplay';
import { luxuryLabel } from '../../design/theme';

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
          ...(variant === 'organizer' ? luxuryLabel : {}),
          fontSize: variant === 'guest' ? 14 : luxuryLabel.fontSize,
          color: variant === 'organizer' ? luxuryLabel.color : '#6b7280',
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
        <CountdownDisplay countdown={countdown} variant={variant} />
      </div>
    </>
  );
}

export default memo(CountdownCardInner);
