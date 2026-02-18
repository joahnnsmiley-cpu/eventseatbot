import { useState, useEffect } from 'react';

export type CountdownResult = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isStarted: boolean;
};

/**
 * Countdown to event date. Updates every second.
 * @param eventDate - ISO date string (e.g. "2026-03-15T19:00:00")
 */
export function useCountdown(eventDate: string): CountdownResult {
  const [result, setResult] = useState<CountdownResult>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isStarted: false,
  });

  useEffect(() => {
    const targetTime = new Date(eventDate).getTime();
    if (!eventDate || Number.isNaN(targetTime)) {
      setResult({ days: 0, hours: 0, minutes: 0, seconds: 0, isStarted: true });
      return;
    }

    const tick = () => {
      const now = Date.now();
      const delta = Math.max(0, targetTime - now);
      const isStarted = now >= targetTime;

      setResult({
        days: Math.floor(delta / (1000 * 60 * 60 * 24)),
        hours: Math.floor((delta % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((delta % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((delta % (1000 * 60)) / 1000),
        isStarted,
      });
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [eventDate]);

  return result;
}
