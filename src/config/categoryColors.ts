/**
 * Luxury color palette for ticket categories.
 * Store only color_key in DB; never raw hex.
 */

export type CategoryColorKey = 'vip' | 'gold' | 'silver' | 'bronze' | 'emerald' | 'sapphire';

export interface CategoryColorConfig {
  label: string;
  gradient: string;
  glow: string;
  border: string;
  /** Solid color for small UI (legend dots, etc.) */
  base: string;
}

export const CATEGORY_COLORS: Record<CategoryColorKey, CategoryColorConfig> = {
  vip: {
    label: 'VIP',
    gradient: 'linear-gradient(145deg, #E8F4FC, #B8D4E8)',
    glow: '0 0 12px rgba(184, 212, 232, 0.5)',
    border: '1.5px solid #7BA3C4',
    base: '#9BC4E0',
  },
  gold: {
    label: 'Gold',
    gradient: 'linear-gradient(145deg, #E8D48A, #B8942E)',
    glow: '0 0 14px rgba(184, 148, 46, 0.55)',
    border: '1.5px solid #8B6914',
    base: '#C9A227',
  },
  silver: {
    label: 'Silver',
    gradient: 'linear-gradient(145deg, #E8E8E8, #A8A8A8)',
    glow: '0 0 12px rgba(168, 168, 168, 0.4)',
    border: '1.5px solid #6B6B6B',
    base: '#A8A8A8',
  },
  bronze: {
    label: 'Bronze',
    gradient: 'linear-gradient(145deg, #E8C4A0, #CD7F32)',
    glow: '0 0 12px rgba(205, 127, 50, 0.4)',
    border: '1.5px solid #8B4513',
    base: '#CD7F32',
  },
  emerald: {
    label: 'Emerald',
    gradient: 'linear-gradient(145deg, #A8E6CF, #4A9B6B)',
    glow: '0 0 12px rgba(74, 155, 107, 0.4)',
    border: '1.5px solid #2D6A4F',
    base: '#4A9B6B',
  },
  sapphire: {
    label: 'Sapphire',
    gradient: 'linear-gradient(145deg, #A8C8E8, #4A7BA7)',
    glow: '0 0 12px rgba(74, 123, 167, 0.4)',
    border: '1.5px solid #2C5282',
    base: '#4A7BA7',
  },
};

export const CATEGORY_COLOR_KEYS: CategoryColorKey[] = [
  'vip',
  'gold',
  'silver',
  'bronze',
  'emerald',
  'sapphire',
];

export function getCategoryColor(colorKey: string | undefined): CategoryColorConfig {
  const key = (colorKey as CategoryColorKey) ?? 'gold';
  return CATEGORY_COLORS[key] ?? CATEGORY_COLORS.gold;
}

export function resolveCategoryColorKey(category: { color_key?: string; styleKey?: string; custom_color?: string } | null | undefined): CategoryColorKey {
  if (!category) return 'gold';
  if ((category as { custom_color?: string }).custom_color) return 'gold';
  const key = category.color_key ?? category.styleKey;
  if (key && key in CATEGORY_COLORS) return key as CategoryColorKey;
  const styleMap: Record<string, CategoryColorKey> = {
    vip: 'vip',
    gold: 'gold',
    silver: 'silver',
    bronze: 'bronze',
    standard: 'silver',
  };
  return styleMap[category.styleKey ?? ''] ?? 'gold';
}

/** Darken hex by amount (0-1). */
function darkenHex(hex: string, amount: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  let r = parseInt(m[1], 16);
  let g = parseInt(m[2], 16);
  let b = parseInt(m[3], 16);
  r = Math.max(0, Math.floor(r * (1 - amount)));
  g = Math.max(0, Math.floor(g * (1 - amount)));
  b = Math.max(0, Math.floor(b * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Lighten hex by amount (0-1). */
function lightenHex(hex: string, amount: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  let r = parseInt(m[1], 16);
  let g = parseInt(m[2], 16);
  let b = parseInt(m[3], 16);
  r = Math.min(255, Math.floor(r + (255 - r) * amount));
  g = Math.min(255, Math.floor(g + (255 - g) * amount));
  b = Math.min(255, Math.floor(b + (255 - b) * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Build CategoryColorConfig from custom hex. */
export function categoryConfigFromHex(hex: string): CategoryColorConfig {
  const base = hex.startsWith('#') ? hex : `#${hex}`;
  const light = lightenHex(base, 0.35);
  const dark = darkenHex(base, 0.25);
  const match = base.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  const [r, g, b] = match
    ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
    : [201, 162, 39];
  return {
    label: 'Свой',
    gradient: `linear-gradient(145deg, ${light}, ${dark})`,
    glow: `0 0 12px rgba(${r},${g},${b},0.5)`,
    border: `2px solid ${darkenHex(base, 0.4)}`,
    base,
  };
}

/** Get category color config — uses custom_color if set, else preset by color_key. */
export function getCategoryColorFromCategory(category: { color_key?: string; styleKey?: string; custom_color?: string } | null | undefined): CategoryColorConfig {
  if (!category) return CATEGORY_COLORS.gold;
  const custom = (category as { custom_color?: string }).custom_color;
  if (custom && /^#?[a-fA-F0-9]{6}$/.test(custom.replace('#', ''))) {
    return categoryConfigFromHex(custom);
  }
  return getCategoryColor(resolveCategoryColorKey(category));
}
