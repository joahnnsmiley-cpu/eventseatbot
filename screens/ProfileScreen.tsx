import React, { useEffect, useState } from 'react';
import ProfileGuestScreen, { ProfileGuestEmpty } from './ProfileGuestScreen';
import ProfileOrganizerScreen from './ProfileOrganizerScreen';
import ProfileOrganizerSkeleton from '../components/profile/ProfileOrganizerSkeleton';
import ProfileGuestSkeleton from '../components/profile/ProfileGuestSkeleton';
import BackHeader from '../src/ui/BackHeader';
import * as StorageService from '../services/storageService';
import type { CategoryColorKey } from '../src/config/categoryColors';
import { UI_TEXT } from '../constants/uiText';
import type { EventData } from '../types';

const ProfileStateMessage = ({
  message,
  isError = false,
}: {
  message: string;
  isError?: boolean;
}) => (
  <div className="w-full max-w-[720px] mx-auto px-6 py-6 flex items-center justify-center min-h-[200px]">
    <p style={{ fontSize: 16, color: isError ? '#dc2626' : '#6b7280' }}>{message}</p>
  </div>
);

export type ProfileScreenProps = {
  /** Role from auth/context. Fallback to guest if not determined. */
  userRole?: 'guest' | 'organizer' | null;
  /** Override guest name (e.g. from Telegram first_name). */
  guestNameOverride?: string;
  /** Event ID for organizer profile (optional; backend picks first if omitted). */
  selectedEventId?: string | null;
  onOpenAdmin?: () => void;
  onOpenMap?: () => void;
  /** Navigate to previous screen */
  onBack?: () => void;
};

export default function ProfileScreen({
  userRole: userRoleProp,
  guestNameOverride,
  selectedEventId,
  onOpenAdmin,
  onOpenMap,
  onBack,
}: ProfileScreenProps) {
  const role = userRoleProp ?? 'guest';
  const [viewAsGuest, setViewAsGuest] = useState(false);
  const [guestData, setGuestData] = useState<StorageService.ProfileGuestData | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [organizerData, setOrganizerData] = useState<StorageService.ProfileOrganizerData | null>(null);
  const [organizerLoading, setOrganizerLoading] = useState(false);
  const [organizerError, setOrganizerError] = useState<string | null>(null);
  // Event picker state for organizer statistics
  const [publishedEvents, setPublishedEvents] = useState<EventData[]>([]);
  const [statsEventId, setStatsEventId] = useState<string | null>(selectedEventId ?? null);

  useEffect(() => {
    if (role !== 'guest' && !(role === 'organizer' && viewAsGuest)) return;
    setGuestLoading(true);
    setGuestError(null);
    StorageService.getProfileGuestData()
      .then(setGuestData)
      .catch((err) => setGuestError(err?.message ?? 'Ошибка загрузки'))
      .finally(() => setGuestLoading(false));
  }, [role, viewAsGuest]);

  // Load organizer event list for the stats picker
  useEffect(() => {
    if (role !== 'organizer') return;
    StorageService.getAdminEvents()
      .then((evts) => {
        // Show all events that are not archived — let organizer pick any
        const active = evts.filter((e: EventData) => (e as any).status !== 'archived');
        const list = active.length > 0 ? active : evts; // fallback: show all if none pass filter
        setPublishedEvents(list);
        // Auto-select first if nothing selected yet
        if (!statsEventId && list.length > 0) {
          setStatsEventId(list[0].id);
        }
      })
      .catch(() => { /* silent — picker just won't show */ });
  }, [role]);

  useEffect(() => {
    if (role !== 'organizer') return;
    setOrganizerLoading(true);
    setOrganizerError(null);
    StorageService.getProfileOrganizerData(statsEventId ?? undefined)
      .then((data) => {
        setOrganizerData(data);
      })
      .catch((err) => {
        setOrganizerError(err?.message ?? 'Ошибка загрузки');
      })
      .finally(() => setOrganizerLoading(false));
  }, [role, statsEventId]);

  const wrapWithBack = (content: React.ReactNode, backHandler?: () => void, backLabel?: string) => {
    const handler = backHandler ?? onBack;
    if (!handler) return <>{content}</>;
    return (
      <>
        <BackHeader onBack={handler} variant="dark" backLabel={backLabel} />
        {content}
      </>
    );
  };


  if (role === 'organizer' && viewAsGuest) {
    if (guestLoading) return wrapWithBack(<ProfileGuestSkeleton />, () => setViewAsGuest(false), UI_TEXT.profile.backToOrganizer);
    if (guestError) return wrapWithBack(<ProfileStateMessage message={guestError} isError />, () => setViewAsGuest(false), UI_TEXT.profile.backToOrganizer);
    if (!guestData || !guestData.hasBooking) {
      return wrapWithBack(<ProfileGuestEmpty message="У вас пока нет забронированного места" />, () => setViewAsGuest(false), UI_TEXT.profile.backToOrganizer);
    }
    const guestName = guestNameOverride ?? guestData.guestName;
    const guestProps: Parameters<typeof ProfileGuestScreen>[0] = {
      guestName,
      avatarUrl: guestData.avatarUrl ?? '',
      event: {
        title: guestData.event.name ?? guestData.event.title,
        date: guestData.event.date,
        dateTime: guestData.event.start_at,
        venue: guestData.event.venue,
      },
      category: (guestData.categoryColorKey || 'gold') as CategoryColorKey,
      categoryName: guestData.categoryName,
      tableNumber: guestData.tableNumber,
      seatNumbers: guestData.seatNumbers ?? [],
      seatsFree: guestData.seatsFree,
      neighbors: guestData.neighbors,
      privileges: guestData.privileges ?? [],
      privateAccess: guestData.privateAccess ?? '',
    };
    return wrapWithBack(<ProfileGuestScreen {...guestProps} />, () => setViewAsGuest(false), UI_TEXT.profile.backToOrganizer);
  }

  if (role === 'organizer') {
    if (organizerLoading && !organizerData?.hasData) return <ProfileOrganizerSkeleton />;
    if (organizerError) return <ProfileStateMessage message={organizerError} isError />;
    if (!organizerData || !organizerData.hasData) {
      return <ProfileStateMessage message="Нет доступных событий для управления" />;
    }
    const currentEventTitle = publishedEvents.find((e) => e.id === statsEventId)?.title ?? null;
    return (
      <>
        {/* Event picker — shown whenever any events are available */}
        {publishedEvents.length >= 1 && (
          <div
            className="w-full px-4 pt-4 pb-1"
            style={{ maxWidth: 480, margin: '0 auto' }}
          >
            <label className="text-[10px] font-semibold text-amber-500/70 uppercase tracking-widest block mb-1.5">
              Статистика для события
            </label>
            <div className="relative">
              <select
                value={statsEventId ?? ''}
                onChange={(e) => setStatsEventId(e.target.value || null)}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white appearance-none pr-9 cursor-pointer transition-all focus:outline-none"
                style={{
                  background: 'rgba(20,20,22,0.95)',
                  border: '1px solid rgba(198,167,94,0.3)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                }}
              >
                {publishedEvents.map((evt) => (
                  <option key={evt.id} value={evt.id} style={{ background: '#111' }}>
                    {evt.title}
                  </option>
                ))}
              </select>
              <span
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-400/70"
                style={{ fontSize: 12 }}
              >
                ▼
              </span>
            </div>
          </div>
        )}
        <ProfileOrganizerScreen
          eventDate={organizerData.eventDate}
          stats={organizerData.stats}
          tables={organizerData.tables}
          categoryStats={organizerData.categoryStats}
          vipGuests={organizerData.vipGuests}
          eventTitle={currentEventTitle}
          onOpenAdmin={onOpenAdmin}
          onOpenMap={onOpenMap}
          onViewAsGuest={() => setViewAsGuest(true)}
          isRefreshing={organizerLoading}
        />
      </>
    );
  }

  if (guestLoading) return <ProfileGuestSkeleton />;
  if (guestError) return <ProfileStateMessage message={guestError} isError />;

  if (!guestData || !guestData.hasBooking) {
    return <ProfileGuestEmpty message="У вас пока нет забронированного места" />;
  }

  const guestName = guestNameOverride ?? guestData.guestName;
  const guestProps: Parameters<typeof ProfileGuestScreen>[0] = {
    guestName,
    avatarUrl: guestData.avatarUrl ?? '',
    event: {
      title: guestData.event.name ?? guestData.event.title,
      date: guestData.event.date,
      dateTime: guestData.event.start_at,
      venue: guestData.event.venue,
    },
    category: (guestData.categoryColorKey || 'gold') as CategoryColorKey,
    categoryName: guestData.categoryName,
    tableNumber: guestData.tableNumber,
    seatNumbers: guestData.seatNumbers ?? [],
    seatsFree: guestData.seatsFree,
    neighbors: guestData.neighbors,
    privileges: guestData.privileges ?? [],
    privateAccess: guestData.privateAccess ?? '',
  };

  return <ProfileGuestScreen {...guestProps} />;
}
