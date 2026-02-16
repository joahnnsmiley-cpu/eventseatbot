/**
 * Table category → subtle background fill.
 * Borders stay neutral; no saturated colors.
 */
export const TABLE_CATEGORY_COLORS: Record<string, string> = {
  VIP: '#C6A75E',
  Premium: '#B8954C',
  Standard: '#9C7C3A',
};

export function getTableCategoryColor(category: string | undefined): string {
  if (!category) return TABLE_CATEGORY_COLORS.Standard;
  const c = TABLE_CATEGORY_COLORS[category];
  return c ?? TABLE_CATEGORY_COLORS.Standard;
}

/** Gold tone CSS variables by category for table rendering. */
const GOLD_TONES: Record<string, { light: string; base: string; dark: string }> = {
  VIP: { light: '#F8E7A1', base: '#D4AF37', dark: '#A67C00' },
  Premium: { light: '#F3D98A', base: '#C9A227', dark: '#8F6F00' },
  Standard: { light: '#E8C96A', base: '#B8931E', dark: '#7A5E00' },
};

export function getGoldToneByCategory(category: string | undefined): Record<string, string> {
  const tone = GOLD_TONES[category ?? ''] ?? GOLD_TONES.Standard;
  return {
    '--gold-light': tone.light,
    '--gold-base': tone.base,
    '--gold-dark': tone.dark,
  };
}

/**
 * Neutral luxury palette.
 * No bright colors, no pure green, no blue, no gradients, no neon.
 */
export const theme = {
  colors: {
    backgroundPrimary: '#F6F3EE',
    backgroundSecondary: '#ECE6DD',
    surface: '#FFFFFF',
    borderSoft: '#DDD6CC',
    borderStrong: '#C8BFB3',

    textPrimary: '#1C1C1C',
    textSecondary: '#6E6A64',
    textMuted: '#9B948A',

    accentGold: '#C6A75E',
    accentGoldSoft: '#E7D7A8',

    dangerSoft: '#E8CFCF',
    danger: '#B85C5C',

    successMuted: '#6F7C6A',
  },
  radius: {
    card: '1.5rem',
  },
};
