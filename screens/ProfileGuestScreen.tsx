import React from 'react';
import { motion } from 'framer-motion';
import ProfileLayout from '../components/profile/ProfileLayout';
import ProfileCard from '../components/profile/ProfileCard';
import ProfileAnimatedStack from '../components/profile/ProfileAnimatedStack';
import CountdownCard from '../components/profile/CountdownCard';
import { CATEGORY_COLORS } from '../src/config/categoryColors';
import type { CategoryColorKey } from '../src/config/categoryColors';
import { luxuryLabel, darkTextPrimary, darkTextMuted, darkTextSubtle } from '../design/theme';
import { UI_TEXT } from '../constants/uiText';
import { duration, easing } from '../design/motion';
import CategoryBadge from '../components/profile/CategoryBadge';

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
    <ProfileLayout>
      <ProfileCard padding={32} rounded={28} variant="glass">
        <p
          style={{
            fontSize: 18,
            color: darkTextMuted,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>
      </ProfileCard>
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
  const categoryConfig = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.gold;
  const categoryLabel = categoryName ?? categoryConfig.label;

  return (
    <ProfileLayout>
      <ProfileAnimatedStack>
        {/* 1️⃣ Hero — avatar + greeting, Apple-style */}
        <ProfileCard
          padding={48}
          rounded={28}
          variant="hero"
          style={{
            background: `linear-gradient(165deg, rgba(22,21,19,0.98) 0%, rgba(14,13,12,0.98) 100%)`,
            border: `1px solid rgba(255,255,255,0.06)`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 200,
            gap: 24,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: easing.primaryArray }}
            style={{ position: 'relative' }}
          >
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }}
            >
              <img
                src={effectiveAvatarUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
            <CategoryBadge category={category} size={88} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.entrance / 1000, delay: 0.1, ease: easing.primaryArray }}
            style={{ textAlign: 'center' }}
          >
            <motion.h1
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.08, ease: easing.primaryArray }}
              style={{
                fontFamily: "'Cormorant Garamond', 'Times New Roman', serif",
                fontSize: 'clamp(32px, 6vw, 42px)',
                fontWeight: 400,
                color: darkTextPrimary,
                margin: 0,
                letterSpacing: '0.02em',
                lineHeight: 1.25,
              }}
            >
              Рады видеть вас,
            </motion.h1>
            <motion.span
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.18, ease: easing.primaryArray }}
              style={{
                fontFamily: "'Cormorant Garamond', 'Times New Roman', serif",
                fontSize: 'clamp(36px, 7vw, 48px)',
                fontWeight: 500,
                color: darkTextPrimary,
                display: 'block',
                marginTop: 4,
                letterSpacing: '0.03em',
              }}
            >
              {guestName}
            </motion.span>
          </motion.div>
        </ProfileCard>

        {/* 2️⃣ CountdownCard — isolated to avoid parent re-renders */}
        <ProfileCard padding={24} rounded={24} variant="glass">
          <CountdownCard eventDate={event.dateTime || ''} label="До начала вечера" variant="guest" dark />
        </ProfileCard>

        {/* 3️⃣ MyEveningCard */}
        <ProfileCard padding={24} rounded={24} variant="glass" interactive>
          <p style={{ ...luxuryLabel, marginBottom: 16, marginTop: 0 }}>
            {UI_TEXT.profile.yourEvening}
          </p>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: categoryConfig.gradient,
                flexShrink: 0,
                border: `2px solid ${categoryConfig.base}99`,
                boxShadow: `0 0 20px ${categoryConfig.base}33`,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: darkTextPrimary, letterSpacing: '-0.02em' }}>
                Стол № {tableNumber}
              </p>
              {seatNumbers.length > 0 && (
                <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 600, color: darkTextPrimary }}>
                  {seatNumbers.length > 1 ? 'Места' : 'Место'} № {seatNumbers.join(', ')}
                </p>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 16, color: '#E8D48A', fontWeight: 600 }}>{categoryLabel}</p>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: darkTextMuted }}>{event.venue}</p>
            </div>
          </div>
        </ProfileCard>

        {/* 4️⃣ TableNeighborsCard */}
        <ProfileCard padding={24} rounded={24} variant="glass" interactive>
          <p style={{ margin: '0 0 16px', fontSize: 15, color: darkTextMuted }}>
            {UI_TEXT.profile.neighborsCaption}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {neighbors.length === 0 ? (
              <p style={{ margin: 0, fontSize: 15, color: darkTextMuted }}>
                {UI_TEXT.profile.neighborsEmpty}
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
                {neighbors.map((n, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                        border: '2px solid rgba(255,255,255,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={n.avatar}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 500, color: darkTextPrimary }}>
                      {n.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ProfileCard>

        {/* 5️⃣ PrivilegesCard */}
        {privileges.length > 0 && (
          <ProfileCard padding={24} rounded={24} variant="glass" interactive>
            <p style={{ ...luxuryLabel, marginBottom: 16, marginTop: 0 }}>
              {UI_TEXT.profile.yourPrivileges}
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {privileges.map((p, i) => (
                <li
                  key={i}
                  style={{
                    marginBottom: 12,
                    fontSize: 15,
                    color: darkTextPrimary,
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ marginRight: 8 }}>✨</span>
                  {p}
                </li>
              ))}
            </ul>
          </ProfileCard>
        )}

        {/* 6️⃣ PrivateAccessCard */}
        {privateAccess && (
          <ProfileCard
            padding={24}
            rounded={24}
            variant="glass"
            interactive
            style={{
              border: `1px solid ${categoryConfig.base}66`,
              boxShadow: `0 0 24px ${categoryConfig.base}22`,
            }}
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: darkTextPrimary,
                marginBottom: 12,
                marginTop: 0,
              }}
            >
              {UI_TEXT.profile.privateAccessLabel} {categoryLabel}
            </p>
            <p
              style={{
                fontSize: 14,
                color: darkTextMuted,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {privateAccess}
            </p>
          </ProfileCard>
        )}
      </ProfileAnimatedStack>
    </ProfileLayout>
  );
}
