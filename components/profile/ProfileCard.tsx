import React from 'react';
import { motion } from 'framer-motion';
import { glass, glassFallback, radius, shadow } from '../../design/theme';
import { duration, easing } from '../../design/motion';
import { cardHover, cardActive, heroBlur } from '../../design/elevation';

const GLASS_FALLBACK_STYLE = `
@supports not (backdrop-filter: blur(20px)) {
  .profile-card-glass-fallback {
    background: ${glassFallback} !important;
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
  /** "glass" = subtle blur, "hero" = stronger blur + gradient, "solid" = no blur (fallback) */
  variant?: 'glass' | 'hero' | 'solid';
  /** Enable hover/press effects */
  interactive?: boolean;
};

const glassBase: React.CSSProperties = {
  background: glass.background,
  backdropFilter: glass.backdropFilter,
  WebkitBackdropFilter: glass.WebkitBackdropFilter,
  border: glass.border,
  boxShadow: shadow.soft,
};

const glassHero: React.CSSProperties = {
  ...glassBase,
  backdropFilter: `blur(${heroBlur}px)`,
  WebkitBackdropFilter: `blur(${heroBlur}px)`,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.55) 100%)',
};

const solidFallback: React.CSSProperties = {
  backgroundColor: '#ffffff',
  boxShadow: shadow.soft,
  border: '1px solid rgba(0,0,0,0.04)',
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
        whileHover={{ y: cardHover.translateY, boxShadow: cardHover.shadow }}
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
