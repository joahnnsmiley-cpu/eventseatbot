/**
 * Container-based table sizing. No fixed pixel sizes.
 * If widthPercent && heightPercent: rect with border-radius 14px
 * Else: circle, diameter = containerWidth * (sizePercent / 100)
 *
 * RULES (table rendering):
 * - Remove any min-width or min-height constraints on table wrapper/shape.
 * - Remove padding inside table container.
 * - Ensure table size equals exactly calculated width/height (use box-sizing: border-box).
 */
const DEFAULT_SIZE_PERCENT = 6;
const RECT_BORDER_RADIUS = 14;

export function computeTableSizes(
  containerWidth: number,
  options?: {
    sizePercent?: number;
    widthPercent?: number;
    heightPercent?: number;
  }
) {
  const wp = options?.widthPercent;
  const hp = options?.heightPercent;
  const hasExplicitDimensions = typeof wp === 'number' && wp > 0 && typeof hp === 'number' && hp > 0;

  if (hasExplicitDimensions) {
    const width = containerWidth * (wp! / 100);
    const height = containerWidth * (hp! / 100);
    const baseSize = Math.max(width, height);
    return {
      width,
      height,
      borderRadius: RECT_BORDER_RADIUS,
      fontNumber: baseSize * 0.22,
      fontSub: baseSize * 0.15,
    };
  }

  const pct = typeof options?.sizePercent === 'number' && options.sizePercent > 0 ? options.sizePercent : DEFAULT_SIZE_PERCENT;
  const size = containerWidth * (pct / 100);
  return {
    width: size,
    height: size,
    borderRadius: '50%' as const,
    fontNumber: size * 0.45,
    fontSub: size * 0.3,
  };
}
