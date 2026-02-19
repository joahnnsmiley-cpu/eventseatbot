import React, { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import ProfileSectionSkeleton from './ProfileSectionSkeleton';

const APPLE_EASE = [0.22, 1, 0.36, 1];
const SECTION_LABEL = 'text-xs font-semibold text-yellow-500/90 uppercase tracking-[0.12em]';

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

function OrganizerStatsLazyInner({ stats, tables, categoryStats = [] }: OrganizerStatsLazyProps) {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [minDelayPassed, setMinDelayPassed] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    categoryStats[0]?.id ?? null
  );
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

  useEffect(() => {
    if (categoryStats.length > 0 && !activeCategoryId) {
      setActiveCategoryId(categoryStats[0].id);
    }
  }, [categoryStats, activeCategoryId]);

  const showContent = hasBeenVisible && minDelayPassed;

  if (!showContent) {
    return (
      <div ref={ref} className="space-y-10">
        <div className="rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 p-6">
          <ProfileSectionSkeleton title rows={1} columns={1} dark />
        </div>
        <div className="rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 p-6">
          <ProfileSectionSkeleton title rows={1} columns={2} dark />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: APPLE_EASE }}
      className="space-y-10"
    >
      {/* Statistics — main metric big, secondary smaller, no columns */}
      <div className="space-y-2">
        <p className={SECTION_LABEL}>Статистика</p>
        <div className="text-5xl font-bold tabular-nums" style={{ color: '#D4AF37' }}>
          {stats.ticketsSold}
        </div>
        <p className="text-sm text-white/50">Продано</p>
        <div className="flex gap-8 pt-2">
          <div>
            <span className="text-2xl font-semibold text-white tabular-nums">{stats.seatsFree}</span>
            <p className="text-xs text-white/50 mt-0.5">Свободно</p>
          </div>
          <div>
            <span className="text-2xl font-semibold text-white tabular-nums">{stats.fillPercent}%</span>
            <p className="text-xs text-white/50 mt-0.5">Заполнено</p>
          </div>
        </div>
      </div>

      {/* Tables + Profit — merged analytics section */}
      <div className="space-y-6">
        <p className={SECTION_LABEL}>Аналитика</p>
        <div className="space-y-6">
          <div>
            <div className="text-3xl font-bold text-white tabular-nums">{tables.total}</div>
            <p className="text-sm text-white/50 mt-0.5">Столы всего</p>
            <div className="flex gap-6 mt-3 text-lg text-white/70">
              <span>{tables.full} полных</span>
              <span>{tables.partial} частично</span>
              <span>{tables.empty} пустых</span>
            </div>
          </div>
          {(stats.revenueExpected != null || stats.revenueCurrent != null) && (
            <div className="pt-2 border-t border-white/10">
              <div
                className="text-3xl font-bold tabular-nums"
                style={{
                  background: 'linear-gradient(135deg, #D4AF37 0%, #F5D76E 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {formatMoney(stats.revenueCurrent ?? 0)}
              </div>
              <p className="text-sm text-white/50 mt-0.5">Получено</p>
              <p className="text-sm text-white/40 mt-1">
                до {formatMoney(stats.revenueExpected ?? 0)} при полном выкупе
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Categories — soft glass cards, gold border for active */}
      {categoryStats.length > 0 && (
        <div className="space-y-4">
          <p className={SECTION_LABEL}>По категориям</p>
          <div className="flex flex-col gap-3">
            {categoryStats.map((c) => {
              const isActive = activeCategoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCategoryId(c.id)}
                  className={`text-left rounded-2xl backdrop-blur-md bg-white/5 border px-4 py-4 transition-all duration-200 ${
                    isActive
                      ? 'border-yellow-500/30 shadow-[0_0_20px_rgba(212,175,55,0.1)]'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-base font-semibold text-white">{c.name}</div>
                      <div className="text-sm text-white/50 mt-1">
                        {c.seatsSold} выкуплено · {c.seatsFree} свободно
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-sm font-semibold"
                        style={{ color: isActive ? '#D4AF37' : '#C6A75E' }}
                      >
                        {formatMoney(c.revenueCurrent)}
                      </div>
                      <div className="text-xs text-white/50 mt-0.5">
                        из {formatMoney(c.revenueExpected)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default memo(OrganizerStatsLazyInner);
