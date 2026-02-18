import React, { memo } from 'react';
import { motion } from 'framer-motion';
import ProfileLayout from '../components/profile/ProfileLayout';
import ProfileCard from '../components/profile/ProfileCard';
import ProfileAnimatedStack from '../components/profile/ProfileAnimatedStack';
import CountdownCard from '../components/profile/CountdownCard';
import OrganizerStatsLazy from '../components/profile/OrganizerStatsLazy';
import { luxuryLabel } from '../design/theme';
import { UI_TEXT } from '../constants/uiText';

// ─── Types ────────────────────────────────────────────────────────────────
export type ProfileOrganizerScreenProps = {
  eventDate: string;
  stats: {
    guestsTotal: number;
    fillPercent: number;
    ticketsSold: number;
    seatsFree: number;
  };
  tables: {
    total: number;
    full: number;
    partial: number;
    empty: number;
  };
  vipGuests: Array<{ name: string; category: string }>;
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
      style={{
        width: '100%',
        padding: '14px 20px',
        fontSize: 15,
        fontWeight: 500,
        color: '#EAE6DD',
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseOver={(e) => {
        if (onClick) {
          e.currentTarget.style.background = 'rgba(198,167,94,0.15)';
          e.currentTarget.style.borderColor = 'rgba(198,167,94,0.4)';
        }
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
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
  vipGuests,
  onOpenAdmin,
  onOpenMap,
  onViewAsGuest,
  isRefreshing = false,
}: ProfileOrganizerScreenProps) {
  return (
    <ProfileLayout>
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
        {/* 1️⃣ Hero */}
        <ProfileCard
          padding={32}
          rounded={28}
          variant="hero"
        >
          <h1
            style={{
              fontSize: 'clamp(22px, 3.5vw, 28px)',
              fontWeight: 600,
              color: '#F5F2EB',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Вы управляете этим вечером
          </h1>
          <p
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: '#C6A75E',
              marginTop: 10,
              marginBottom: 0,
              textShadow: '0 0 24px rgba(198,167,94,0.2)',
            }}
          >
            {stats.guestsTotal} гостей · {stats.fillPercent}% заполнено
          </p>
        </ProfileCard>

        {/* 2️⃣ CountdownCard — isolated to avoid parent re-renders */}
        <ProfileCard padding={24} rounded={24} variant="glass">
          <CountdownCard
            eventDate={eventDate || ''}
            label="До начала события"
            variant="organizer"
          />
        </ProfileCard>

        {/* 3️⃣ & 4️⃣ LiveStatsCard + TablesOverviewCard — lazy loaded */}
        <OrganizerStatsLazy stats={stats} tables={tables} />

        {/* 5️⃣ VIPGuestsCard */}
        <ProfileCard padding={24} rounded={24} variant="glass" interactive>
          <p style={{ ...luxuryLabel, marginBottom: 16, marginTop: 0 }}>VIP гости</p>
          {vipGuests.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {vipGuests.map((g, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom:
                      i < vipGuests.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    fontSize: 15,
                    color: '#EAE6DD',
                  }}
                >
                  <span>{g.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      color: '#9B948A',
                      fontWeight: 500,
                    }}
                  >
                    {g.category}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 15, color: '#9B948A' }}>
              VIP гости отсутствуют
            </p>
          )}
        </ProfileCard>

        {/* 6️⃣ QuickActionsCard */}
        <ProfileCard padding={24} rounded={24} variant="glass">
          <p style={{ ...luxuryLabel, marginBottom: 16, marginTop: 0 }}>Действия</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ActionButton label="Перейти в админ-панель" onClick={onOpenAdmin} />
            <ActionButton label="Открыть карту" onClick={onOpenMap} />
            <ActionButton label={UI_TEXT.profile.viewAsGuest} onClick={onViewAsGuest} />
          </div>
        </ProfileCard>
      </ProfileAnimatedStack>
    </ProfileLayout>
  );
}

export default memo(ProfileOrganizerScreenInner);
