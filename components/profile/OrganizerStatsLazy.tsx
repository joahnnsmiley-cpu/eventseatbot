import React, { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import ProfileCard from './ProfileCard';
import ProfileSectionSkeleton from './ProfileSectionSkeleton';

const APPLE_EASE = [0.22, 1, 0.36, 1];

type Stats = {
  guestsTotal: number;
  fillPercent: number;
  ticketsSold: number;
  seatsFree: number;
};

type Tables = {
  total: number;
  full: number;
  partial: number;
  empty: number;
};

type OrganizerStatsLazyProps = {
  stats: Stats;
  tables: Tables;
};

function StatBlock({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 'clamp(28px, 5vw, 36px)',
          fontWeight: 600,
          color: '#EAE6DD',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#9B948A', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function TableStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: '#EAE6DD',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#9B948A', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function OrganizerStatsLazyInner({ stats, tables }: OrganizerStatsLazyProps) {
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
        <p
          style={{
            fontSize: 13,
            color: '#C6A75E',
            marginBottom: 20,
            marginTop: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Статистика
        </p>
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
        <p
          style={{
            fontSize: 13,
            color: '#C6A75E',
            marginBottom: 20,
            marginTop: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Столы
        </p>
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
    </motion.div>
  );
}

export default memo(OrganizerStatsLazyInner);
