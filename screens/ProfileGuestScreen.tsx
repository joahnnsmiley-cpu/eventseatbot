import React from 'react';
import ProfileLayout from '../components/profile/ProfileLayout';
import ProfileCard from '../components/profile/ProfileCard';
import ProfileAnimatedStack from '../components/profile/ProfileAnimatedStack';
import CountdownCard from '../components/profile/CountdownCard';
import { CATEGORY_COLORS } from '../src/config/categoryColors';
import type { CategoryColorKey } from '../src/config/categoryColors';
import { luxuryLabel, darkTextPrimary, darkTextMuted, darkTextSubtle } from '../design/theme';
import { UI_TEXT } from '../constants/uiText';

// ─── Types ────────────────────────────────────────────────────────────────
export type ProfileGuestScreenProps = {
  guestName: string;
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
  neighbors: Array<{ name: string; avatar: string | null }>;
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
export default function ProfileGuestScreen({
  guestName,
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
  const categoryConfig = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.gold;
  const categoryLabel = categoryName ?? categoryConfig.label;

  return (
    <ProfileLayout>
      <ProfileAnimatedStack>
        {/* 1️⃣ Hero — dark luxury with category accent */}
        <ProfileCard
          padding={32}
          rounded={28}
          variant="hero"
          style={{
            background: `linear-gradient(145deg, rgba(28,26,24,0.98) 0%, rgba(18,16,14,0.98) 50%, rgba(12,10,8,0.98) 100%)`,
            border: `1px solid ${categoryConfig.base}55`,
            boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 48px ${categoryConfig.base}15, inset 0 1px 0 rgba(198,167,94,0.08)`,
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 28px)',
              fontWeight: 700,
              color: darkTextPrimary,
              margin: 0,
              letterSpacing: '-0.02em',
              textShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            Рады видеть вас, {guestName}
          </h1>
          <p
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: '#C6A75E',
              marginTop: 10,
              marginBottom: 0,
              textShadow: '0 0 24px rgba(198,167,94,0.2)',
            }}
          >
            {event.title} · {event.date}
          </p>
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
                  Место{seatNumbers.length > 1 ? 'а' : ''} № {seatNumbers.join(', ')}
                </p>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 16, color: '#E8D48A', fontWeight: 600 }}>{categoryLabel}</p>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: darkTextMuted }}>{event.venue}</p>
            </div>
          </div>
        </ProfileCard>

        {/* 4️⃣ TableNeighborsCard */}
        <ProfileCard padding={24} rounded={24} variant="glass" interactive>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', marginRight: 8 }}>
              {neighbors.map((n, i) => (
                <div
                  key={i}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    marginLeft: i > 0 ? -12 : 0,
                    background: 'rgba(255,255,255,0.1)',
                    border: '2px solid rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                    color: darkTextPrimary,
                    zIndex: neighbors.length - i,
                  }}
                >
                  {n.avatar ? (
                    <img
                      src={n.avatar}
                      alt=""
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    (n.name && n.name[0]) || '?'
                  )}
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 15, color: darkTextMuted }}>
              {seatsFree > 0
                ? `${seatsFree} ${seatsFree === 1 ? 'место' : 'места'} свободно`
                : 'Стол полностью занят'}
            </p>
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
