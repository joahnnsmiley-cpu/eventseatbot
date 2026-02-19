import React from 'react';
import { motion } from 'framer-motion';
import { duration, easing } from '../../design/motion';

type ProfileLayoutProps = {
  children: React.ReactNode;
  className?: string;
};

export default function ProfileLayout({ children, className }: ProfileLayoutProps) {
  const isOrganizerPremium = className?.includes('profile-organizer-premium');
  const isGuestPremium = className?.includes('profile-guest-premium');
  const usePremiumBg = isOrganizerPremium || isGuestPremium;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.entrance / 1000, ease: easing.primaryArray }}
      className={className ? `w-full max-w-[720px] mx-auto px-6 py-4 relative overflow-x-hidden ${className}` : 'w-full max-w-[720px] mx-auto px-6 py-4'}
      style={{
        minHeight: '100%',
        ...(usePremiumBg
          ? { background: '#0a0a0a' }
          : { background: 'linear-gradient(180deg, #0F0F0F 0%, #141414 50%, #0D0D0D 100%)' }),
        ...(isOrganizerPremium ? {} : { fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" }),
      }}
    >
      {usePremiumBg && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 80% 10%, rgba(88,28,135,0.12) 0%, transparent 55%)',
            zIndex: 0,
          }}
        />
      )}
      <div className={usePremiumBg ? 'relative' : undefined}>{children}</div>
    </motion.div>
  );
}
