import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';
import ProfileLayout from '../components/profile/ProfileLayout';
import ProfileAnimatedStack from '../components/profile/ProfileAnimatedStack';
import CountdownCard from '../components/profile/CountdownCard';
import OrganizerStatsLazy from '../components/profile/OrganizerStatsLazy';
import { UI_TEXT } from '../constants/uiText';

// ─── Types ────────────────────────────────────────────────────────────────
export type ProfileOrganizerScreenProps = {
  eventDate: string;
  stats: {
    guestsTotal: number;
    fillPercent: number;
    ticketsSold: number;
    seatsFree: number;
    revenueExpected?: number;
    revenueCurrent?: number;
    revenueReserved?: number;
  };
  tables: {
    total: number;
    full: number;
    partial: number;
    empty: number;
  };
  categoryStats?: Array<{
    id: string;
    name: string;
    colorKey: string;
    seatsTotal: number;
    seatsSold: number;
    seatsFree: number;
    revenueExpected: number;
    revenueCurrent: number;
  }>;
  vipGuests: Array<{ phone: string; names: string[]; category: string }>;
  /** Title of the selected event to display in the hero */
  eventTitle?: string | null;
  /** All events available for selection in the picker */
  allEvents?: Array<{ id: string; title: string }>;
  /** Currently selected event id */
  selectedEventId?: string | null;
  /** Called when organizer picks a different event */
  onSelectEvent?: (id: string) => void;
  onOpenAdmin?: () => void;
  onOpenMap?: () => void;
  /** Switch to guest profile view (organizer preview) */
  onViewAsGuest?: () => void;
  /** Optimistic: show subtle loading when refetching */
  isRefreshing?: boolean;
};

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="w-full px-5 py-3.5 text-[15px] font-medium text-white rounded-xl transition-all duration-200 hover:bg-yellow-500/10"
      style={{
        background: '#1a1a1a',
        border: '1px solid rgba(234, 179, 8, 0.2)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {label}
    </motion.button>
  );
}

// ─── ProfileOrganizerScreen ────────────────────────────────────────────────
function ProfileOrganizerScreenInner({
  eventDate,
  stats,
  tables,
  categoryStats = [],
  vipGuests,
  eventTitle,
  allEvents = [],
  selectedEventId,
  onSelectEvent,
  onOpenAdmin,
  onOpenMap,
  onViewAsGuest,
  isRefreshing = false,
}: ProfileOrganizerScreenProps) {
  return (
    <ProfileLayout className="profile-organizer-premium">
      {isRefreshing && (
        <div
          style={{
            position: 'fixed',
            top: 12,
            right: 16,
            zIndex: 50,
            padding: '6px 12px',
            fontSize: 12,
            color: '#9B948A',
            background: 'rgba(26,26,26,0.9)',
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          Обновление…
        </div>
      )}
      <ProfileAnimatedStack>
        {/* 1️⃣ Hero — no card, hierarchy with spacing */}
        <div className="pt-8 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-4xl font-bold tracking-wide text-white">
              Вы управляете этим вечером
            </h1>
            <p className="text-sm text-white/50 mt-1">
              Private Access
            </p>
            {/* Inline event picker — lives right where the event title is */}
            {eventTitle && (
              <div className="relative inline-flex items-center mt-2 max-w-full">
                <p
                  className="text-sm font-semibold truncate"
                  style={{
                    background: 'linear-gradient(135deg, #D4AF37 0%, #F5D76E 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    pointerEvents: 'none',
                  }}
                >
                  {eventTitle}
                  {allEvents.length > 1 && (
                    <span style={{ WebkitTextFillColor: 'rgba(212,175,55,0.5)', marginLeft: 4, fontSize: '0.75em' }}>››</span>
                  )}
                </p>
                {/* Transparent select overlay — tappable but invisible */}
                {allEvents.length > 1 && onSelectEvent && (
                  <select
                    value={selectedEventId ?? ''}
                    onChange={(e) => onSelectEvent(e.target.value)}
                    aria-label="Выбрать событие"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0,
                      width: '100%',
                      cursor: 'pointer',
                      fontSize: 0,
                    }}
                  >
                    {allEvents.map((evt) => (
                      <option key={evt.id} value={evt.id}>{evt.title}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div
              className="mt-4 font-bold tabular-nums"
              style={{
                fontSize: 'clamp(3rem, 8vw, 4.5rem)',
                background: 'linear-gradient(135deg, #D4AF37 0%, #F5D76E 50%, #E8C547 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.02em',
              }}
            >
              {stats.guestsTotal}
            </div>
            <p className="text-sm text-white/50 mt-1">гостей</p>
          </div>
          {onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-yellow-500/10 hover:border-yellow-500/30 transition-all"
              title="Перейти в админ-панель"
              aria-label="Перейти в админ-панель"
            >
              <Settings size={24} className="text-yellow-400" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* 2️⃣ Countdown — cinematic, glass blur only, no box */}
        <div className="rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 px-6 py-5">
          <CountdownCard
            eventDate={eventDate || ''}
            label="ДО НАЧАЛА СОБЫТИЯ"
            variant="organizer"
          />
        </div>

        {/* 3️⃣ & 4️⃣ LiveStatsCard + TablesOverviewCard + Profit + Categories — lazy loaded */}
        <OrganizerStatsLazy stats={stats} tables={tables} categoryStats={categoryStats} />

        {/* 5️⃣ VIP guests — minimal, no heavy card */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-yellow-500/90 uppercase tracking-[0.12em]">
            VIP гости
          </p>
          {vipGuests.length > 0 ? (
            <ul className="space-y-4 list-none m-0 p-0">
              {vipGuests.map((g, i) => (
                <li key={i} className="flex flex-col gap-1 py-2 border-b border-white/10 last:border-0">
                  <div className="flex justify-between items-center">
                    <span className="text-[15px] text-white font-medium">{g.phone}</span>
                    <span className="text-xs text-white/50 font-medium">{g.category}</span>
                  </div>
                  {g.names.length > 0 && (
                    <span className="text-sm text-white/60">{g.names.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-white/50 m-0">VIP гости отсутствуют</p>
          )}
        </div>

        {/* 6️⃣ Actions — premium buttons */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-yellow-500/90 uppercase tracking-[0.12em]">
            Действия
          </p>
          <div className="flex flex-col gap-3">
            <ActionButton label="Открыть карту" onClick={onOpenMap} />
            <ActionButton label={UI_TEXT.profile.viewAsGuest} onClick={onViewAsGuest} />
          </div>
        </div>
      </ProfileAnimatedStack>
    </ProfileLayout>
  );
}

export default memo(ProfileOrganizerScreenInner);
