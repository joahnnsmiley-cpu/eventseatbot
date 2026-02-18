/**
 * Design System — Motion tokens.
 * Premium easing and durations.
 */

export const easing = {
  primary: 'cubic-bezier(0.22, 1, 0.36, 1)',
  primaryArray: [0.22, 1, 0.36, 1] as [number, number, number, number],
} as const;

export const duration = {
  fast: 120,
  normal: 200,
  slow: 400,
  entrance: 600,
} as const;

export const spring = {
  gentle: { type: 'spring' as const, stiffness: 300, damping: 30 },
  snappy: { type: 'spring' as const, stiffness: 400, damping: 25 },
} as const;
