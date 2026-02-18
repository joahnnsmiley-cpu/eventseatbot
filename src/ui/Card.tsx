import React from 'react';
import { motion } from 'framer-motion';
import { glass, glassFallback, radius, shadow } from '../../design/theme';
import { duration, easing } from '../../design/motion';
import { cardHover, cardActive } from '../../design/elevation';

const GLASS_FALLBACK_STYLE = `
@supports not (backdrop-filter: blur(20px)) {
  .card-glass-fallback { background: rgba(11,11,11,0.95) !important; }
}
`;

type CardProps = {
  children: React.ReactNode;
  interactive?: boolean;
};

export default function Card({ children, interactive = false }: CardProps) {
  const baseStyle: React.CSSProperties = {
    background: 'rgba(11,11,11,0.6)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: shadow.soft,
    borderRadius: radius.lg,
    padding: 24,
    transition: `transform ${duration.normal}ms ${easing.primary}, box-shadow ${duration.normal}ms ${easing.primary}`,
  };

  const content = (
    <>
      <style>{GLASS_FALLBACK_STYLE}</style>
      <div className="card-glass-fallback" style={baseStyle}>
        {children}
      </div>
    </>
  );

  if (interactive) {
    return (
      <motion.div
        initial={false}
        whileHover={{ y: cardHover.translateY, boxShadow: cardHover.shadow }}
        whileTap={{ scale: cardActive.scale }}
        transition={{ duration: duration.normal / 1000, ease: easing.primaryArray }}
        style={{ borderRadius: radius.lg }}
      >
        {content}
      </motion.div>
    );
  }

  return content;
}
