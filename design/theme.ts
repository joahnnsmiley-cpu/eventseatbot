/**
 * Design System — Premium tokens (Apple / Linear / Stripe level).
 * Use these tokens across the entire project.
 */

export const spacing = [4, 8, 12, 16, 24, 32, 48] as const;
export type SpacingKey = keyof typeof spacing;

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const shadow = {
  soft: '0 4px 12px rgba(0,0,0,0.06)',
  medium: '0 8px 24px rgba(0,0,0,0.08)',
  elevated: '0 12px 32px rgba(0,0,0,0.12)',
} as const;

export const glass = {
  background: 'rgba(255,255,255,0.6)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.4)',
} as const;

export const glassFallback = 'rgba(255,255,255,0.95)';

export const typography = {
  hero: '32px',
  title: '24px',
  subtitle: '18px',
  body: '16px',
  caption: '14px',
} as const;

export const glassPreset = {
  background: 'rgba(255,255,255,0.6)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.4)',
} as const;

export const glassFallbackPreset = 'rgba(255,255,255,0.95)';
