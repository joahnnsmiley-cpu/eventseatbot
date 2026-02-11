import React from 'react';
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
  const navItem = (
    icon: React.ReactNode,
    isActive: boolean,
    label: string
  ) => (
    <div className="relative flex flex-col items-center justify-center gap-1">
      {isActive ? (
        <div className="text-[#FFC107]">{icon}</div>
      ) : (
        <div className="text-gray-400">{icon}</div>
      )}
      <span className={`text-[10px] tracking-wide uppercase ${isActive ? 'text-[#FFC107]' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto bg-black/70 backdrop-blur-md border-t border-white/10 flex justify-around items-center h-16">
      <button
        type="button"
        onClick={onEventsClick}
        className="flex flex-col items-center justify-center transition-colors duration-200"
      >
        {navItem(<CalendarDays size={20} strokeWidth={1.8} />, activeTab === 'events', UI_TEXT.nav.events)}
      </button>
      <button
        type="button"
        onClick={onMyTicketsClick}
        className="flex flex-col items-center justify-center transition-colors duration-200"
      >
        {navItem(<Ticket size={20} strokeWidth={1.8} />, activeTab === 'my-tickets', UI_TEXT.nav.myTickets)}
      </button>
      <button
        type="button"
        onClick={onProfileClick}
        className="flex flex-col items-center justify-center transition-colors duration-200"
      >
        {navItem(<User size={20} strokeWidth={1.8} />, activeTab === 'profile', UI_TEXT.nav.profile)}
      </button>
    </nav>
  );
}
