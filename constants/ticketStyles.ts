import type { TicketCategory } from '../types';

/**
 * Scalable TicketCategory style system.
 * Maps styleKey (vip, gold, silver, bronze) to visual tokens.
 * Used for table rendering and ticket display.
 */

export type TicketStyleKey = 'vip' | 'gold' | 'silver' | 'bronze';

export interface TicketStyleTokens {
  /** Light gradient stop */
  light: string;
  /** Base gradient stop */
  base: string;
  /** Border / dark accent */
  dark: string;
  /** Accent color for highlights */
  accent: string;
}

export const TICKET_STYLES: Record<TicketStyleKey, TicketStyleTokens> = {
  vip: {
    light: '#F8E7A1',
    base: '#D4AF37',
    dark: '#A67C00',
    accent: '#FFD700',
  },
  gold: {
    light: '#F3D98A',
    base: '#C9A227',
    dark: '#8F6F00',
    accent: '#E6C35C',
  },
  silver: {
    light: '#E8E8E8',
    base: '#A8A8A8',
    dark: '#6B6B6B',
    accent: '#C0C0C0',
  },
  bronze: {
    light: '#E8C4A0',
    base: '#CD7F32',
    dark: '#8B4513',
    accent: '#D4A574',
  },
};

const DEFAULT_STYLE: TicketStyleTokens = TICKET_STYLES.gold;

/**
 * Get style tokens by styleKey.
 * Falls back to gold if key is unknown.
 */
export function getTicketStyle(styleKey: string | undefined): TicketStyleTokens {
  if (!styleKey || typeof styleKey !== 'string') return DEFAULT_STYLE;
  const key = styleKey.toLowerCase() as TicketStyleKey;
  return TICKET_STYLES[key] ?? DEFAULT_STYLE;
}

/**
 * Get CSS variables object for inline style.
 */
export function getTicketStyleVars(styleKey: string | undefined): Record<string, string> {
  const tokens = getTicketStyle(styleKey);
  return {
    '--ticket-light': tokens.light,
    '--ticket-base': tokens.base,
    '--ticket-dark': tokens.dark,
    '--ticket-accent': tokens.accent,
  };
}

/** Returns gold-tone CSS vars (--gold-light, --gold-base, --gold-dark) for table rendering. */
export function getGoldToneFromStyleKey(styleKey: string | undefined): Record<string, string> {
  const tokens = getTicketStyle(styleKey);
  return {
    '--gold-light': tokens.light,
    '--gold-base': tokens.base,
    '--gold-dark': tokens.dark,
  };
}

/** Default ticket categories for new events. IDs are stable for migration. */
export const DEFAULT_TICKET_CATEGORIES: TicketCategory[] = [
  { id: 'default-vip', name: 'VIP', price: 5000, description: '', styleKey: 'vip', isActive: true },
  { id: 'default-gold', name: 'Gold', price: 3000, description: '', styleKey: 'gold', isActive: true },
  { id: 'default-standard', name: 'Standard', price: 1500, description: '', styleKey: 'silver', isActive: true },
];
