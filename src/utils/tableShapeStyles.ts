import type { CSSProperties } from 'react';
import type { CategoryColorConfig } from '../config/categoryColors';

/** Shared table shape styles for Admin and SeatMap — unified look. */
export function getTableShapeStyle(
  palette: CategoryColorConfig | null,
  isCircle: boolean
): CSSProperties {
  const background = palette
    ? `radial-gradient(circle at 35% 30%, ${palette.base}44, transparent 65%), linear-gradient(160deg, #0d0d0d, #050505)`
    : 'linear-gradient(160deg, #0d0d0d, #050505)';
  const border = palette ? palette.border.replace('1.5px', '2px') : '2px solid #2a2520';
  const boxShadow = palette
    ? `0 0 14px ${palette.base}55, inset 0 1px 0 rgba(255,255,255,0.03)`
    : '0 0 10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)';

  return {
    width: '100%',
    ...(isCircle ? {} : { height: '100%', borderRadius: 0 }),
    background,
    border,
    boxShadow,
  };
}

/** Shared table label style — single accent, no double contour. */
export function getTableLabelStyle(palette: CategoryColorConfig | null): CSSProperties | undefined {
  if (!palette) return undefined;
  return {
    background: `linear-gradient(145deg, ${palette.base}55, ${palette.base}22)`,
    border: `1px solid ${palette.base}66`,
    boxShadow: `0 0 8px ${palette.base}30`,
    color: '#F3E6C0',
  };
}
