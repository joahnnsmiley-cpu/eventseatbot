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
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto bg-black/70 backdrop-blur-md border-t border-white/10 flex justify-around items-center h-16">
      <button
        type="button"
        onClick={onEventsClick}
        className={`flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${
          activeTab === 'events' ? 'text-[#FFC107]' : 'text-gray-400'
        }`}
      >
        <CalendarDays size={20} strokeWidth={1.8} />
        <span className="text-[10px] tracking-wide uppercase">{UI_TEXT.nav.events}</span>
      </button>
      <button
        type="button"
        onClick={onMyTicketsClick}
        className={`flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${
          activeTab === 'my-tickets' ? 'text-[#FFC107]' : 'text-gray-400'
        }`}
      >
        <Ticket size={20} strokeWidth={1.8} />
        <span className="text-[10px] tracking-wide uppercase">{UI_TEXT.nav.myTickets}</span>
      </button>
      <button
        type="button"
        onClick={onProfileClick}
        className={`flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${
          activeTab === 'profile' ? 'text-[#FFC107]' : 'text-gray-400'
        }`}
      >
        <User size={20} strokeWidth={1.8} />
        <span className="text-[10px] tracking-wide uppercase">{UI_TEXT.nav.profile}</span>
      </button>
    </nav>
  );
}
