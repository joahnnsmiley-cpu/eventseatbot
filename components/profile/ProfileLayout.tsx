import React from 'react';
import { motion } from 'framer-motion';
import { duration, easing } from '../../design/motion';

type ProfileLayoutProps = {
  children: React.ReactNode;
};

export default function ProfileLayout({ children }: ProfileLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.entrance / 1000, ease: easing.primaryArray }}
      className="w-full max-w-[720px] mx-auto px-6 py-4"
      style={{
        minHeight: '100%',
        background: 'linear-gradient(180deg, #0F0F0F 0%, #141414 50%, #0D0D0D 100%)',
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {children}
    </motion.div>
  );
}
