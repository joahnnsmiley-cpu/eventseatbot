import React from 'react';
import { motion } from 'framer-motion';
import { radius } from '../../design/theme';
import { duration, easing } from '../../design/motion';
import { cardHover, cardActive, heroBlur, darkCard } from '../../design/elevation';

const GLASS_FALLBACK_STYLE = `
@supports not (backdrop-filter: blur(20px)) {
  .profile-card-glass-fallback {
    background: rgba(26,26,26,0.95) !important;
  }
}
`;

type ProfileCardProps = {
  children: React.ReactNode;
  className?: string;
  /** Override padding (default 24px) */
  padding?: number;
  /** Override border-radius (default 24px) */
  rounded?: number;
  /** Override background, shadow, border */
  style?: React.CSSProperties;
  /** "glass" = dark glass + depth, "hero" = stronger blur + gradient, "solid" = no blur (fallback) */
  variant?: 'glass' | 'hero' | 'solid';
  /** Enable hover/press effects */
  interactive?: boolean;
};

/** Dark glass for profile (luxury dark theme) — depth, inner glow, gold rim */
const glassDark: React.CSSProperties = {
  background: 'rgba(22,22,22,0.75)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.06)',
  boxShadow: `${darkCard.shadow}, ${darkCard.innerGlow}`,
};

const glassHero: React.CSSProperties = {
  ...glassDark,
  backdropFilter: `blur(${heroBlur}px)`,
  WebkitBackdropFilter: `blur(${heroBlur}px)`,
  background: 'linear-gradient(180deg, rgba(28,28,28,0.92) 0%, rgba(18,18,18,0.88) 100%)',
  boxShadow: `${darkCard.shadow}, ${darkCard.innerGlow}, inset 0 1px 0 rgba(198,167,94,0.08)`,
};

const solidFallback: React.CSSProperties = {
  backgroundColor: '#1A1A1A',
  boxShadow: darkCard.shadow,
  border: '1px solid rgba(255,255,255,0.06)',
};

export default function ProfileCard({
  children,
  className = '',
  padding = 24,
  rounded = radius.lg,
  style: styleOverride,
  variant = 'glass',
  interactive = false,
}: ProfileCardProps) {
  const baseStyle: React.CSSProperties = {
    padding,
    borderRadius: rounded,
    transition: `transform ${duration.normal}ms ${easing.primary}, box-shadow ${duration.normal}ms ${easing.primary}`,
    ...(variant === 'glass' ? glassBase : variant === 'hero' ? glassHero : solidFallback),
  };

  const finalStyle = styleOverride ? { ...baseStyle, ...styleOverride } : baseStyle;
  const useGlassFallback = variant === 'glass' || variant === 'hero';

  const content = (
    <>
      {useGlassFallback && <style>{GLASS_FALLBACK_STYLE}</style>}
      <div
        className={`${className} ${useGlassFallback ? 'profile-card-glass-fallback' : ''}`}
        style={finalStyle}
      >
        {children}
      </div>
    </>
  );

  if (interactive) {
    return (
      <motion.div
        initial={false}
        whileHover={{ y: cardHover.translateY, boxShadow: darkCard.shadowHover }}
        whileTap={{ scale: cardActive.scale, transition: { duration: duration.fast / 1000 } }}
        transition={{ duration: duration.normal / 1000, ease: easing.primaryArray }}
        style={{ borderRadius: rounded }}
      >
        {content}
      </motion.div>
    );
  }

  return content;
}
