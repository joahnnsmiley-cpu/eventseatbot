import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Check } from 'lucide-react';
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
  const [sheetOpen, setSheetOpen] = useState(false);
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
            {/* Inline event picker trigger */}
            {eventTitle && (
              <button
                type="button"
                onClick={() => allEvents.length > 1 && setSheetOpen(true)}
                style={{ background: 'none', border: 'none', padding: 0, margin: '8px 0 0', cursor: allEvents.length > 1 ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}
                aria-haspopup={allEvents.length > 1 ? 'listbox' : undefined}
              >
                <span
                  className="text-sm font-semibold truncate"
                  style={{
                    background: 'linear-gradient(135deg, #D4AF37 0%, #F5D76E 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {eventTitle}
                </span>
                {allEvents.length > 1 && (
                  <span style={{ color: 'rgba(212,175,55,0.45)', fontSize: '0.7em', flexShrink: 0 }}>›</span>
                )}
              </button>
            )}

            {/* Custom iOS-style bottom sheet picker */}
            <AnimatePresence>
              {sheetOpen && allEvents.length > 1 && (
                <>
                  <motion.div
                    key="sheet-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    onClick={() => setSheetOpen(false)}
                    style={{
                      position: 'fixed', inset: 0, zIndex: 1000,
                      background: 'rgba(0,0,0,0.65)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                    }}
                  />
                  <motion.div
                    key="sheet-panel"
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 26, stiffness: 280, mass: 0.7 }}
                    style={{
                      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001,
                      maxWidth: 480, margin: '0 auto',
                      paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                    }}
                  >
                    <div style={{
                      background: 'rgba(14,14,16,0.98)',
                      borderTop: '1px solid rgba(255,255,255,0.09)',
                      borderRadius: '22px 22px 0 0',
                      overflow: 'hidden',
                    }}>
                      {/* Handle */}
                      <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ width: 34, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
                      </div>
                      {/* Header */}
                      <p style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', padding: '6px 0 10px' }}>
                        Выберите событие
                      </p>
                      {/* Divider */}
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 16px 4px' }} />
                      {/* Options */}
                      {allEvents.map((evt, i) => {
                        const isSelected = evt.id === selectedEventId;
                        return (
                          <React.Fragment key={evt.id}>
                            {i > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 20px' }} />}
                            <motion.button
                              type="button"
                              whileTap={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                              onClick={() => { onSelectEvent?.(evt.id); setSheetOpen(false); }}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '15px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <span style={{
                                fontSize: 15, fontWeight: isSelected ? 600 : 400,
                                color: isSelected ? '#F5D76E' : 'rgba(255,255,255,0.82)',
                                flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {evt.title}
                              </span>
                              {isSelected && <Check size={15} strokeWidth={2.5} style={{ color: '#D4AF37', flexShrink: 0, marginLeft: 10 }} />}
                            </motion.button>
                          </React.Fragment>
                        );
                      })}
                      {/* Cancel */}
                      <div style={{ padding: '10px 16px 4px' }}>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSheetOpen(false)}
                          style={{
                            width: '100%', padding: '14px 0', borderRadius: 14,
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
                            color: 'rgba(255,255,255,0.45)', fontSize: 15, fontWeight: 500, cursor: 'pointer',
                          }}
                        >
                          Отмена
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
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
