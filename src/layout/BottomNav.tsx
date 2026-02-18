import React from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Ticket, User } from 'lucide-react';
import { UI_TEXT } from '../../constants/uiText';

export type BottomNavTab = 'events' | 'my-tickets' | 'profile';

type BottomNavProps = {
  activeTab: BottomNavTab;
  onEventsClick: () => void;
  onMyTicketsClick: () => void;
  onProfileClick: () => void;
};

export default function BottomNav({
  activeTab,
  onEventsClick,
  onMyTicketsClick,
  onProfileClick,
}: BottomNavProps) {
  const items = [
    { key: 'events' as const, icon: <CalendarDays size={20} strokeWidth={1.8} />, label: UI_TEXT.nav.events, onClick: onEventsClick },
    { key: 'my-tickets' as const, icon: <Ticket size={20} strokeWidth={1.8} />, label: UI_TEXT.nav.myTickets, onClick: onMyTicketsClick },
    { key: 'profile' as const, icon: <User size={20} strokeWidth={1.8} />, label: UI_TEXT.nav.profile, onClick: onProfileClick },
  ];

  return (
    <motion.nav
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="relative mx-3 mb-3 rounded-2xl overflow-hidden">
        {/* Glass background with subtle gradient border */}
        <div
          className="absolute inset-0 rounded-2xl bg-black/75 backdrop-blur-xl"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        />
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-px rounded-full opacity-60"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,193,7,0.5), rgba(255,193,7,0.8), rgba(255,193,7,0.5), transparent)',
          }}
        />
        <div className="relative flex justify-around items-center h-16 px-2">
          {items.map((item, i) => {
            const isActive = activeTab === item.key;
            return (
              <motion.button
                key={item.key}
                type="button"
                onClick={item.onClick}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
                whileTap={{ scale: 0.92 }}
                className="relative flex flex-col items-center justify-center gap-1 min-w-[72px] py-2 rounded-xl transition-colors duration-200"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,193,7,0.15), rgba(255,193,7,0.05))',
                      border: '1px solid rgba(255,193,7,0.25)',
                      boxShadow: '0 0 20px rgba(255,193,7,0.12)',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <motion.div
                  className="relative z-10"
                  animate={{ scale: isActive ? 1.05 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {isActive ? (
                    <div className="text-[#FFC107] drop-shadow-[0_0_6px_rgba(255,193,7,0.5)]">{item.icon}</div>
                  ) : (
                    <div className="text-muted-light">{item.icon}</div>
                  )}
                </motion.div>
                <motion.span
                  className={`relative z-10 text-[10px] tracking-wide uppercase transition-colors duration-200 ${
                    isActive ? 'text-[#FFC107] font-medium' : 'text-muted-light'
                  }`}
                  animate={{ opacity: isActive ? 1 : 0.85 }}
                >
                  {item.label}
                </motion.span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
