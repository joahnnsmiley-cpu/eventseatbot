import React from 'react';
import { motion } from 'framer-motion';
import ProfileLayout from '../components/profile/ProfileLayout';
import ProfileAnimatedStack from '../components/profile/ProfileAnimatedStack';
import CountdownCard from '../components/profile/CountdownCard';
import {
  resolveCategoryColorKeyFromName,
  getCategoryColor,
} from '../src/config/categoryColors';
import type { CategoryColorKey } from '../src/config/categoryColors';
import { UI_TEXT } from '../constants/uiText';
import { duration, easing } from '../design/motion';

// ─── Types ────────────────────────────────────────────────────────────────
export type ProfileGuestScreenProps = {
  guestName: string;
  avatarUrl?: string;
  event: {
    title: string;
    date: string;
    dateTime: string;
    venue: string;
  };
  category: CategoryColorKey;
  categoryName?: string;
  tableNumber: number;
  seatNumbers?: number[];
  seatsFree: number;
  neighbors: Array<{ name: string; avatar: string }>;
  privileges: string[];
  privateAccess: string;
};

export type ProfileGuestEmptyProps = {
  message?: string;
};

// ─── ProfileGuestEmpty ─────────────────────────────────────────────────────
export function ProfileGuestEmpty({ message = 'У вас пока нет забронированного места' }: ProfileGuestEmptyProps) {
  return (
    <ProfileLayout className="profile-guest-premium">
      <div className="pt-12 text-center">
        <p className="text-base text-white/70 leading-relaxed m-0">{message}</p>
      </div>
    </ProfileLayout>
  );
}

// ─── ProfileGuestScreen ────────────────────────────────────────────────────
/** Premium default avatar — absolute URL for correct loading in WebApp/subpath */
const getDefaultAvatarUrl = () => {
  if (typeof window === 'undefined') return '/avatar-default.png';
  const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '') || '/';
  return `${window.location.origin}${base}avatar-default.png`;
};

const FALLBACK_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="%231a1a1a" stroke="%23C6A75E" stroke-width="1" opacity="0.9"/><circle cx="20" cy="14" r="6" fill="%23C6A75E" opacity="0.6"/></svg>'
  );

/** Resolve category for colors — prefer categoryName when it matches a known category (fixes VIP text + Gold graphic mismatch). */
function resolveCategoryForColors(
  categoryColorKey: CategoryColorKey,
  categoryName?: string
): CategoryColorKey {
  const fromName = resolveCategoryColorKeyFromName(categoryName ?? '');
  return fromName ?? categoryColorKey;
}

export default function ProfileGuestScreen({
  guestName,
  avatarUrl,
  event,
  category,
  categoryName,
  tableNumber,
  seatNumbers = [],
  seatsFree,
  neighbors,
  privileges,
  privateAccess,
}: ProfileGuestScreenProps) {
  const effectiveAvatarUrl = avatarUrl || getDefaultAvatarUrl();
  const categoryForColors = resolveCategoryForColors(category, categoryName);
  const categoryConfig = getCategoryColor(categoryForColors);
  const categoryLabel = categoryName ?? categoryConfig.label;

  return (
    <ProfileLayout className="profile-guest-premium">
      <ProfileAnimatedStack gap={28}>
        {/* 1️⃣ Header — no box, small text + large name */}
        <div className="pt-8 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: easing.primaryArray }}
            className="relative"
          >
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 shrink-0 mx-auto">
              <img
                src={effectiveAvatarUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  const defaultUrl = getDefaultAvatarUrl();
                  if (img.dataset.fallback === 'svg') return;
                  if (img.src !== defaultUrl && !img.src.includes('avatar-default')) {
                    img.src = defaultUrl;
                    img.dataset.fallback = 'tried-default';
                  } else {
                    img.dataset.fallback = 'svg';
                    img.src = FALLBACK_AVATAR;
                  }
                }}
              />
            </div>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-sm text-white/50 mt-4 mb-0"
          >
            Рады видеть вас,
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.45, ease: easing.primaryArray }}
            className="text-5xl font-serif text-white tracking-wide mt-1 mb-0"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
          >
            {guestName}
          </motion.h1>
        </div>

        {/* 2️⃣ Countdown — cinematic, glass only */}
        <div className="rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 px-6 py-5">
          <CountdownCard
            eventDate={event.dateTime || ''}
            label="ДО НАЧАЛА ВЕЧЕРА"
            variant="guest"
            dark
          />
        </div>

        {/* 3️⃣ Upcoming Event — VIP pass card */}
        <div
          className="rounded-2xl overflow-hidden border border-yellow-500/25 shadow-[0_0_24px_rgba(212,175,55,0.12)]"
          style={{
            background: `linear-gradient(165deg, rgba(22,21,19,0.95) 0%, rgba(14,13,12,0.98) 100%)`,
          }}
        >
          <div className="px-5 py-5 flex gap-4 items-start">
            <div
              className="w-14 h-14 rounded-full shrink-0 border-2 flex items-center justify-center"
              style={{
                background: categoryConfig.gradient,
                borderColor: `${categoryConfig.base}99`,
                boxShadow: `0 0 16px ${categoryConfig.base}40`,
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-yellow-500/90 uppercase tracking-[0.12em] mb-3 mt-0">
                {UI_TEXT.profile.yourEvening}
              </p>
              <p className="text-2xl font-bold text-white tracking-tight m-0">
                Стол № {tableNumber}
              </p>
              {seatNumbers.length > 0 && (
                <p className="text-lg font-semibold text-white mt-1 mb-0">
                  {seatNumbers.length > 1 ? 'Места' : 'Место'} № {seatNumbers.join(', ')}
                </p>
              )}
              <p className="text-sm font-semibold text-yellow-500/90 mt-2 mb-0">{categoryLabel}</p>
              <p className="text-sm text-white/50 mt-1 mb-0">{event.venue}</p>
            </div>
          </div>
        </div>

        {/* 4️⃣ Neighbors / Info — minimal, no border */}
        <div className="space-y-2">
          <p className="text-[15px] text-white/70 leading-relaxed m-0">{UI_TEXT.profile.neighborsCaption}</p>
          {neighbors.length === 0 ? (
            <p className="text-sm text-white/50 leading-relaxed m-0">{UI_TEXT.profile.neighborsEmpty}</p>
          ) : (
            <div className="flex flex-wrap gap-4 items-center pt-2">
              {neighbors.map((n, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/15 shrink-0">
                    <img
                      src={
                        n.avatar?.startsWith('http')
                          ? n.avatar
                          : n.avatar
                            ? `${window.location.origin}${n.avatar.startsWith('/') ? '' : '/'}${n.avatar}`
                            : getDefaultAvatarUrl()
                      }
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.dataset.fallback === 'done') return;
                        img.dataset.fallback = 'done';
                        img.src = getDefaultAvatarUrl();
                      }}
                    />
                  </div>
                  <span className="text-[15px] font-medium text-white">{n.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5️⃣ Privileges */}
        {privileges.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-yellow-500/90 uppercase tracking-[0.12em] m-0">
              {UI_TEXT.profile.yourPrivileges}
            </p>
            <ul className="m-0 pl-5 space-y-2 list-none">
              {privileges.map((p, i) => (
                <li key={i} className="text-[15px] text-white/90 leading-relaxed">
                  <span className="mr-2">✨</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 6️⃣ Private Access */}
        {privateAccess && (
          <div className="space-y-2 pt-2">
            <p className="text-sm font-semibold text-white m-0">
              {UI_TEXT.profile.privateAccessLabel} {categoryLabel}
            </p>
            <p className="text-sm text-white/70 leading-relaxed m-0">{privateAccess}</p>
          </div>
        )}
      </ProfileAnimatedStack>
    </ProfileLayout>
  );
}
