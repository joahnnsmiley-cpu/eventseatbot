import React from 'react';
import ProfileLayout from '../components/profile/ProfileLayout';
import ProfileCard from '../components/profile/ProfileCard';
import ProfileAnimatedStack from '../components/profile/ProfileAnimatedStack';
import CountdownCard from '../components/profile/CountdownCard';
import { CATEGORY_COLORS } from '../src/config/categoryColors';
import type { CategoryColorKey } from '../src/config/categoryColors';

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
            color: '#6b7280',
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
        {/* 1️⃣ Hero */}
        <ProfileCard
          padding={32}
          rounded={28}
          variant="solid"
          style={{
            background: categoryConfig.gradient,
            border: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 28px)',
              fontWeight: 600,
              color: '#1f2937',
              margin: 0,
            }}
          >
            Рады видеть вас, {guestName}
          </h1>
          <p
            style={{
              fontSize: 16,
              color: '#6b7280',
              marginTop: 8,
              marginBottom: 0,
            }}
          >
            {event.title} · {event.date}
          </p>
        </ProfileCard>

        {/* 2️⃣ CountdownCard — isolated to avoid parent re-renders */}
        <ProfileCard padding={24} rounded={24} variant="glass">
          <CountdownCard eventDate={event.dateTime || ''} label="До начала вечера" variant="guest" />
        </ProfileCard>

        {/* 3️⃣ MyEveningCard */}
        <ProfileCard padding={24} rounded={24} variant="glass" interactive>
          <p
            style={{
              fontSize: 14,
              color: '#6b7280',
              marginBottom: 16,
              marginTop: 0,
            }}
          >
            Ваш вечер
          </p>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: categoryConfig.gradient,
                flexShrink: 0,
                border: `2px solid ${categoryConfig.base}88`,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
                Стол № {tableNumber}
              </p>
              {seatNumbers.length > 0 && (
                <p style={{ margin: '4px 0 0', fontSize: 15, color: '#6b7280' }}>
                  Место{seatNumbers.length > 1 ? 'а' : ''} № {seatNumbers.join(', ')}
                </p>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 15, color: '#6b7280' }}>{categoryLabel}</p>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#9ca3af' }}>{event.venue}</p>
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
                    background: '#e5e7eb',
                    border: '2px solid #fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#6b7280',
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
            <p style={{ margin: 0, fontSize: 15, color: '#374151' }}>
              {seatsFree > 0
                ? `${seatsFree} ${seatsFree === 1 ? 'место' : 'места'} свободно`
                : 'Стол полностью занят'}
            </p>
          </div>
        </ProfileCard>

        {/* 5️⃣ PrivilegesCard */}
        {privileges.length > 0 && (
          <ProfileCard padding={24} rounded={24} variant="glass" interactive>
            <p
              style={{
                fontSize: 14,
                color: '#6b7280',
                marginBottom: 16,
                marginTop: 0,
              }}
            >
              Ваши преимущества
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {privileges.map((p, i) => (
                <li
                  key={i}
                  style={{
                    marginBottom: 12,
                    fontSize: 15,
                    color: '#374151',
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
                color: '#374151',
                marginBottom: 12,
                marginTop: 0,
              }}
            >
              Только для гостей категории {categoryLabel}
            </p>
            <p
              style={{
                fontSize: 14,
                color: '#6b7280',
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
