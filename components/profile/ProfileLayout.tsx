import React from 'react';
import { motion } from 'framer-motion';

const APPLE_EASE = [0.22, 1, 0.36, 1];

type ProfileLayoutProps = {
  children: React.ReactNode;
};

export default function ProfileLayout({ children }: ProfileLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: APPLE_EASE }}
      className="w-full max-w-[720px] mx-auto px-6 py-6"
      style={{
        minHeight: '100%',
        background: 'linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%)',
      }}
    >
      {children}
    </motion.div>
  );
}
