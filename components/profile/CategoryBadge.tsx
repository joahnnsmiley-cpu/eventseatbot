/**
 * Category badge — animated icon around avatar (VIP: diamond, Gold: crown, etc.)
 * Apple-style: subtle, premium, elegant.
 */
import React from 'react';
import { motion } from 'framer-motion';
import type { CategoryColorKey } from '../../src/config/categoryColors';
import { CATEGORY_COLORS } from '../../src/config/categoryColors';

const BADGE_ICONS: Record<CategoryColorKey, React.ReactNode> = {
  vip: (
    <>
      <path d="M12 2L15 8L12 14L9 8Z" fill="currentColor" opacity="0.95" />
      <path d="M12 14L15 20L12 22L9 20Z" fill="currentColor" opacity="0.7" />
      <path d="M12 2L9 8L12 14L15 8Z" fill="currentColor" opacity="0.85" />
    </>
  ),
  gold: (
    <>
      <path d="M4 16L6 10L12 12L18 10L20 16L4 16Z" fill="currentColor" opacity="0.95" />
      <path d="M12 8L8 4L6 10L12 12L18 10L16 4L12 8Z" fill="currentColor" opacity="0.9" />
      <path d="M6 16L4 20H20L18 16" fill="currentColor" opacity="0.6" />
    </>
  ),
  silver: (
    <path d="M12 2L14 8L20 8L15 12L17 18L12 14L7 18L9 12L4 8L10 8Z" fill="currentColor" opacity="0.9" />
  ),
  bronze: (
    <path d="M12 22C16 18 18 14 18 10C18 6 15 4 12 2C9 4 6 6 6 10C6 14 8 18 12 22Z" fill="currentColor" opacity="0.9" />
  ),
  emerald: (
    <>
      <path d="M12 2C8 6 6 12 6 18C10 16 14 14 18 12C16 8 14 4 12 2Z" fill="currentColor" opacity="0.9" />
      <path d="M12 2C16 6 18 12 18 18C14 16 10 14 6 12C8 8 10 4 12 2Z" fill="currentColor" opacity="0.85" />
    </>
  ),
  sapphire: (
    <>
      <path d="M12 2L18 8L12 22L6 8Z" fill="currentColor" opacity="0.95" />
      <path d="M12 2L6 8H18L12 2Z" fill="currentColor" opacity="0.7" />
    </>
  ),
};

export type CategoryBadgeProps = {
  category: CategoryColorKey;
  size?: number;
  className?: string;
};

export default function CategoryBadge({ category, size = 56, className }: CategoryBadgeProps) {
  const config = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.gold;
  const icon = BADGE_ICONS[category] ?? BADGE_ICONS.gold;

  return (
    <motion.div
      className={className}
      style={{
        position: 'absolute',
        inset: -8,
        borderRadius: '50%',
        border: `2px solid ${config.base}`,
        boxShadow: `0 0 24px ${config.base}50, inset 0 0 16px ${config.base}15`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 2,
        pointerEvents: 'none',
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: 1,
        scale: 1,
        boxShadow: [
          `0 0 24px ${config.base}50, inset 0 0 16px ${config.base}15`,
          `0 0 32px ${config.base}70, inset 0 0 20px ${config.base}20`,
          `0 0 24px ${config.base}50, inset 0 0 16px ${config.base}15`,
        ],
      }}
      transition={{
        duration: 2.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <svg
        width={size * 0.32}
        height={size * 0.32}
        viewBox="0 0 24 24"
        fill="none"
        style={{ color: config.base, filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.3))` }}
      >
        {icon}
      </svg>
    </motion.div>
  );
}
