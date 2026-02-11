import React from 'react';

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
    <nav className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto bg-black border-t border-white/10 flex justify-around items-center h-16">
      <button
        type="button"
        onClick={onEventsClick}
        className={`flex flex-col items-center gap-0.5 text-xs font-medium ${
          activeTab === 'events' ? 'text-[#FFC107]' : 'text-gray-400'
        }`}
      >
        <span className="text-lg">🏠</span>
        <span>EVENTS</span>
      </button>
      <button
        type="button"
        onClick={onMyTicketsClick}
        className={`flex flex-col items-center gap-0.5 text-xs font-medium ${
          activeTab === 'my-tickets' ? 'text-[#FFC107]' : 'text-gray-400'
        }`}
      >
        <span className="text-lg">🎟</span>
        <span>MY TICKETS</span>
      </button>
      <button
        type="button"
        onClick={onProfileClick}
        className={`flex flex-col items-center gap-0.5 text-xs font-medium ${
          activeTab === 'profile' ? 'text-[#FFC107]' : 'text-gray-400'
        }`}
      >
        <span className="text-lg">👤</span>
        <span>PROFILE</span>
      </button>
    </nav>
  );
}
