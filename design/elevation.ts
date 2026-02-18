/**
 * Design System — Elevation tokens.
 * Card hover, active states, depth.
 */

export const cardHover = {
  translateY: -2,
  shadow: '0 8px 24px rgba(0,0,0,0.08)',
} as const;

export const cardActive = {
  scale: 0.98,
} as const;

export const heroBlur = 24;
