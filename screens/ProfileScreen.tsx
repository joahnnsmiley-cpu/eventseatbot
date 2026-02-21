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
      <ProfileOrganizerScreen
        eventDate={organizerData.eventDate}
        stats={organizerData.stats}
        tables={organizerData.tables}
        categoryStats={organizerData.categoryStats}
        vipGuests={organizerData.vipGuests}
        eventTitle={currentEventTitle}
        allEvents={publishedEvents}
        selectedEventId={statsEventId}
        onSelectEvent={setStatsEventId}
        onOpenAdmin={onOpenAdmin}
        onOpenMap={onOpenMap}
        onViewAsGuest={() => setViewAsGuest(true)}
        isRefreshing={organizerLoading}
      />
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
