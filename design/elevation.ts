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

/** Dark theme — luxury depth */
export const darkCard = {
  shadow: '0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04)',
  shadowHover: '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(198,167,94,0.12)',
  innerGlow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
  goldRim: 'linear-gradient(180deg, rgba(198,167,94,0.15) 0%, transparent 50%)',
} as const;
