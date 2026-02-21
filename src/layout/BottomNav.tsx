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
    { key: 'events' as const, icon: <CalendarDays size={22} strokeWidth={2} />, label: UI_TEXT.nav.events, onClick: onEventsClick },
    { key: 'my-tickets' as const, icon: <Ticket size={22} strokeWidth={2} />, label: UI_TEXT.nav.myTickets, onClick: onMyTicketsClick },
    { key: 'profile' as const, icon: <User size={22} strokeWidth={2} />, label: UI_TEXT.nav.profile, onClick: onProfileClick },
  ];

  return (
    <motion.nav
      initial={{ y: 32, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto z-40 px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
    >
      <div className="relative rounded-[32px] overflow-hidden">
        {/* Deep Glass Background */}
        <div
          className="absolute inset-0 rounded-[32px] bg-black/45 backdrop-blur-[40px] supports-[backdrop-filter]:bg-black/35"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        />

        <div className="relative flex justify-around items-center h-[72px] px-2">
          {items.map((item, i) => {
            const isActive = activeTab === item.key;
            return (
              <motion.button
                key={item.key}
                type="button"
                onClick={item.onClick}
                whileTap={{ scale: 0.88 }}
                className="relative flex flex-col items-center justify-center gap-1.5 w-full h-full rounded-2xl transition-colors duration-300"
              >
                <motion.div
                  className="relative z-10"
                  animate={{
                    scale: isActive ? 1.05 : 1,
                    y: isActive ? -2 : 0
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <div className={`transition-colors duration-300 ${isActive ? 'text-white' : 'text-[#8E8E93]'}`}>
                    {item.icon}
                  </div>
                </motion.div>

                <motion.span
                  className={`relative z-10 text-[10px] tracking-wide transition-all duration-300 ${isActive ? 'text-white font-semibold' : 'text-[#8E8E93] font-medium'
                    }`}
                  animate={{ opacity: isActive ? 1 : 0.85 }}
                >
                  {item.label}
                </motion.span>

                {/* Subtle active indicator dot under text */}
                {isActive && (
                  <motion.div
                    layoutId="active-dot"
                    className="absolute bottom-1 w-1 h-1 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
