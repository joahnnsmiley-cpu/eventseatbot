import React from 'react';
import { motion } from 'framer-motion';

const APPLE_EASE = [0.22, 1, 0.36, 1];
const STAGGER_DELAY = 0.07;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: APPLE_EASE,
      delay: i * STAGGER_DELAY,
    },
  }),
};

type ProfileAnimatedStackProps = {
  children: React.ReactNode;
  gap?: number;
};

/** Wraps each child in motion.div with staggered Apple-style animation. */
export default function ProfileAnimatedStack({ children, gap = 20 }: ProfileAnimatedStackProps) {
  const items = React.Children.toArray(children);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {items.map((child, i) => (
        <motion.div
          key={i}
          custom={i}
          initial="hidden"
          animate="visible"
          variants={itemVariants}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
