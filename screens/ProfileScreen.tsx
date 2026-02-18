import React, { useEffect, useState } from 'react';
import ProfileGuestScreen, { ProfileGuestEmpty } from './ProfileGuestScreen';
import ProfileOrganizerScreen from './ProfileOrganizerScreen';
import ProfileOrganizerSkeleton from '../components/profile/ProfileOrganizerSkeleton';
import ProfileGuestSkeleton from '../components/profile/ProfileGuestSkeleton';
import BackHeader from '../src/ui/BackHeader';
import * as StorageService from '../services/storageService';
import type { CategoryColorKey } from '../src/config/categoryColors';
import { UI_TEXT } from '../constants/uiText';

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

  useEffect(() => {
    if (role !== 'guest' && !(role === 'organizer' && viewAsGuest)) return;
    setGuestLoading(true);
    setGuestError(null);
    StorageService.getProfileGuestData()
      .then(setGuestData)
      .catch((err) => setGuestError(err?.message ?? 'Ошибка загрузки'))
      .finally(() => setGuestLoading(false));
  }, [role, viewAsGuest]);

  useEffect(() => {
    if (role !== 'organizer') return;
    setOrganizerLoading(true);
    setOrganizerError(null);
    StorageService.getProfileOrganizerData(selectedEventId ?? undefined)
      .then((data) => {
        setOrganizerData(data);
      })
      .catch((err) => {
        setOrganizerError(err?.message ?? 'Ошибка загрузки');
      })
      .finally(() => setOrganizerLoading(false));
  }, [role, selectedEventId]);

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
    if (organizerLoading && !organizerData?.hasData) return wrapWithBack(<ProfileOrganizerSkeleton />);
    if (organizerError) return wrapWithBack(<ProfileStateMessage message={organizerError} isError />);
    if (!organizerData || !organizerData.hasData) {
      return wrapWithBack(<ProfileStateMessage message="Нет доступных событий для управления" />);
    }
    return wrapWithBack(
      <ProfileOrganizerScreen
        eventDate={organizerData.eventDate}
        stats={organizerData.stats}
        tables={organizerData.tables}
        categoryStats={organizerData.categoryStats}
        vipGuests={organizerData.vipGuests}
        onOpenAdmin={onOpenAdmin}
        onOpenMap={onOpenMap}
        onViewAsGuest={() => setViewAsGuest(true)}
        isRefreshing={organizerLoading}
      />
    );
  }

  if (guestLoading) return wrapWithBack(<ProfileGuestSkeleton />);
  if (guestError) return wrapWithBack(<ProfileStateMessage message={guestError} isError />);

  if (!guestData || !guestData.hasBooking) {
    return wrapWithBack(<ProfileGuestEmpty message="У вас пока нет забронированного места" />);
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

  return wrapWithBack(<ProfileGuestScreen {...guestProps} />);
}
