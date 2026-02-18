import React, { memo } from 'react';
import { motion } from 'framer-motion';
import ProfileLayout from '../components/profile/ProfileLayout';
import ProfileCard from '../components/profile/ProfileCard';
import ProfileAnimatedStack from '../components/profile/ProfileAnimatedStack';
import CountdownCard from '../components/profile/CountdownCard';
import OrganizerStatsLazy from '../components/profile/OrganizerStatsLazy';

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
        color: '#0f172a',
        background: 'rgba(248,250,252,0.8)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(226,232,240,0.9)',
        borderRadius: 12,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseOver={(e) => {
        if (onClick) {
          e.currentTarget.style.background = 'rgba(241,245,249,0.95)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
        }
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = 'rgba(248,250,252,0.8)';
        e.currentTarget.style.boxShadow = 'none';
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
            color: '#64748b',
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
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
          style={{
            background: 'linear-gradient(180deg, rgba(248,250,252,0.9) 0%, rgba(241,245,249,0.85) 100%)',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(22px, 3.5vw, 26px)',
              fontWeight: 600,
              color: '#0f172a',
              margin: 0,
            }}
          >
            Вы управляете этим вечером
          </h1>
          <p
            style={{
              fontSize: 15,
              color: '#64748b',
              marginTop: 8,
              marginBottom: 0,
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
          <p
            style={{
              fontSize: 13,
              color: '#64748b',
              marginBottom: 16,
              marginTop: 0,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            VIP гости
          </p>
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
                      i < vipGuests.length - 1 ? '1px solid #f1f5f9' : 'none',
                    fontSize: 15,
                    color: '#334155',
                  }}
                >
                  <span>{g.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      color: '#94a3b8',
                      fontWeight: 500,
                    }}
                  >
                    {g.category}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 15, color: '#94a3b8' }}>
              VIP гости отсутствуют
            </p>
          )}
        </ProfileCard>

        {/* 6️⃣ QuickActionsCard */}
        <ProfileCard padding={24} rounded={24} variant="glass">
          <p
            style={{
              fontSize: 13,
              color: '#64748b',
              marginBottom: 16,
              marginTop: 0,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Действия
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ActionButton label="Перейти в админ-панель" onClick={onOpenAdmin} />
            <ActionButton label="Открыть карту" onClick={onOpenMap} />
          </div>
        </ProfileCard>
      </ProfileAnimatedStack>
    </ProfileLayout>
  );
}

export default memo(ProfileOrganizerScreenInner);
