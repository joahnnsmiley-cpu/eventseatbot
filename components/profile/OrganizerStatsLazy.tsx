import React, { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import ProfileCard from './ProfileCard';
import ProfileSectionSkeleton from './ProfileSectionSkeleton';
import { luxuryLabel } from '../../design/theme';

const APPLE_EASE = [0.22, 1, 0.36, 1];

type Stats = {
  guestsTotal: number;
  fillPercent: number;
  ticketsSold: number;
  seatsFree: number;
  revenueExpected?: number;
  revenueCurrent?: number;
  revenueReserved?: number;
};

type Tables = {
  total: number;
  full: number;
  partial: number;
  empty: number;
};

type CategoryStat = {
  id: string;
  name: string;
  colorKey: string;
  seatsTotal: number;
  seatsSold: number;
  seatsFree: number;
  revenueExpected: number;
  revenueCurrent: number;
};

type OrganizerStatsLazyProps = {
  stats: Stats;
  tables: Tables;
  categoryStats?: CategoryStat[];
};

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₽`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K ₽`;
  return `${n} ₽`;
}

function StatBlock({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 'clamp(28px, 5vw, 36px)',
          fontWeight: 700,
          color: '#F5F2EB',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.03em',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#9B948A', marginTop: 6, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function TableStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: '#F5F2EB',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#9B948A', marginTop: 6, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function OrganizerStatsLazyInner({ stats, tables, categoryStats = [] }: OrganizerStatsLazyProps) {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [minDelayPassed, setMinDelayPassed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setMinDelayPassed(true), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setHasBeenVisible(true);
      },
      { rootMargin: '80px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showContent = hasBeenVisible && minDelayPassed;

  if (!showContent) {
    return (
      <div ref={ref}>
        <ProfileCard padding={24} rounded={24} variant="glass">
          <ProfileSectionSkeleton title rows={1} columns={3} dark />
        </ProfileCard>
        <div style={{ height: 32 }} />
        <ProfileCard padding={24} rounded={24} variant="glass">
          <ProfileSectionSkeleton title rows={1} columns={4} dark />
        </ProfileCard>
        <div style={{ height: 32 }} />
        <ProfileCard padding={24} rounded={24} variant="glass">
          <ProfileSectionSkeleton title rows={1} columns={3} dark />
        </ProfileCard>
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: APPLE_EASE }}
    >
      <ProfileCard padding={24} rounded={24} variant="glass" interactive>
        <p style={{ ...luxuryLabel, marginBottom: 20, marginTop: 0 }}>Статистика</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 24,
          }}
        >
          <StatBlock label="Продано" value={stats.ticketsSold} />
          <StatBlock label="Свободно" value={stats.seatsFree} />
          <StatBlock label="Заполнено" value={`${stats.fillPercent}%`} />
        </div>
      </ProfileCard>
      <div style={{ height: 32 }} />
      <ProfileCard padding={24} rounded={24} variant="glass" interactive>
        <p style={{ ...luxuryLabel, marginBottom: 20, marginTop: 0 }}>Столы</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}
        >
          <TableStat label="Всего" value={tables.total} />
          <TableStat label="Полных" value={tables.full} />
          <TableStat label="Частично" value={tables.partial} />
          <TableStat label="Пустых" value={tables.empty} />
        </div>
      </ProfileCard>
      {(stats.revenueExpected != null || stats.revenueCurrent != null) && (
        <>
          <div style={{ height: 32 }} />
          <ProfileCard padding={24} rounded={24} variant="glass" interactive>
            <p style={{ ...luxuryLabel, marginBottom: 20, marginTop: 0 }}>Прибыль</p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 24,
              }}
            >
              <StatBlock
                label="Ожидается при полном выкупе"
                value={formatMoney(stats.revenueExpected ?? 0)}
              />
              <StatBlock label="Получено" value={formatMoney(stats.revenueCurrent ?? 0)} />
              <StatBlock label="В брони" value={formatMoney(stats.revenueReserved ?? 0)} />
            </div>
          </ProfileCard>
        </>
      )}
      {categoryStats.length > 0 && (
        <>
          <div style={{ height: 32 }} />
          <ProfileCard padding={24} rounded={24} variant="glass" interactive>
            <p style={{ ...luxuryLabel, marginBottom: 20, marginTop: 0 }}>По категориям</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {categoryStats.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F2EB' }}>{c.name}</div>
                    <div style={{ fontSize: 13, color: '#9B948A', marginTop: 4 }}>
                      {c.seatsSold} выкуплено · {c.seatsFree} свободно
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#C6A75E' }}>
                      {formatMoney(c.revenueCurrent)}
                    </div>
                    <div style={{ fontSize: 12, color: '#9B948A', marginTop: 2 }}>
                      из {formatMoney(c.revenueExpected)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ProfileCard>
        </>
      )}
    </motion.div>
  );
}

export default memo(OrganizerStatsLazyInner);
