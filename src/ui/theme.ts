/**
 * Table category → subtle background fill.
 * Borders stay neutral; no saturated colors.
 */
export const TABLE_CATEGORY_COLORS: Record<string, string> = {
  VIP: '#EFE3C8',
  Premium: '#F4EEE3',
  Standard: '#F9F6F1',
};

export function getTableCategoryColor(category: string | undefined): string {
  if (!category) return TABLE_CATEGORY_COLORS.Standard;
  const c = TABLE_CATEGORY_COLORS[category];
  return c ?? TABLE_CATEGORY_COLORS.Standard;
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
