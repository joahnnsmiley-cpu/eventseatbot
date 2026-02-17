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
    gradient: 'linear-gradient(145deg, #F8E7A1, #D4AF37)',
    glow: '0 0 12px rgba(212, 175, 55, 0.5)',
    border: '1.5px solid #A67C00',
    base: '#D4AF37',
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

export function resolveCategoryColorKey(category: { color_key?: string; styleKey?: string } | null | undefined): CategoryColorKey {
  if (!category) return 'gold';
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
