import React, { useEffect, useMemo, useState } from 'react';
import * as StorageService from '../services/storageService';
import { EventData, Table } from '../types';
import { UI_TEXT } from '../constants/uiText';
import { getTableCategoryColor } from '../src/ui/theme';
import { computeTableSizes } from '../src/ui/tableSizing';
import { useContainerWidth } from '../src/hooks/useContainerWidth';
import { TableNumber, SeatInfo } from './TableLabel';
import PrimaryButton from '../src/ui/PrimaryButton';
import SecondaryButton from '../src/ui/SecondaryButton';
import DangerButton from '../src/ui/DangerButton';
import EventCard, { EventCardSkeleton } from './EventCard';
import AdminCard from '../src/ui/AdminCard';
import { mapTableFromDb } from '../src/utils/mapTableFromDb';

type AdminBooking = {
  id: string;
  event_id?: string;
  table_id?: string | null;
  seat_indices?: number[];
  seats_booked?: number;
  user_telegram_id?: number | null;
  user_phone?: string;
  status?: string;
  created_at?: string;
  expires_at?: string | null;
  event: { id: string; title?: string; date?: string };
  seatIds?: string[];
  tableBookings?: Array<{ tableId: string; seats: number }>;
  userTelegramId?: number;
  totalAmount?: number;
  expiresAt?: string | number;
};

/** Convert ISO string to datetime-local input value (local time) */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ensure required table fields for backend; defaults so nothing is undefined. */
function tableForBackend(t: Table, index: number): Table {
  const x = typeof t.x === 'number' ? t.x : (typeof t.centerX === 'number' ? t.centerX : 50);
  const y = typeof t.y === 'number' ? t.y : (typeof t.centerY === 'number' ? t.centerY : 50);
  return {
    ...t,
    id: t.id || `tbl-${Date.now()}-${index}`,
    number: typeof t.number === 'number' ? t.number : index + 1,
    seatsTotal: typeof t.seatsTotal === 'number' ? t.seatsTotal : 4,
    seatsAvailable: typeof t.seatsAvailable === 'number' ? t.seatsAvailable : (typeof t.seatsTotal === 'number' ? t.seatsTotal : 4),
    x,
    y,
    centerX: typeof t.centerX === 'number' ? t.centerX : x,
    centerY: typeof t.centerY === 'number' ? t.centerY : y,
    visibleFrom: t.visibleFrom ?? undefined,
    visibleUntil: t.visibleUntil ?? undefined,
  };
}

/** Validate table numbers: positive integer, unique within event. Returns error message or null. */
function validateTableNumbers(tables: Table[]): string | null {
  const seen = new Map<number, string>();
  for (const t of tables) {
    const n = t.number;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      return `${UI_TEXT.tables.tableNumberInvalid}`;
    }
    if (seen.has(n)) {
      return `${UI_TEXT.tables.tableNumberDuplicate} ${n}`;
    }
    seen.set(n, t.id);
  }
  return null;
}

/** Validate rect tables: width_percent > 0, height_percent > 0, rotation in [-180, 180]. Returns error or null. */
function validateRectTables(tables: Table[]): string | null {
  for (const t of tables) {
    const shape = t.shape ?? 'circle';
    if (shape === 'circle') continue;
    const w = (t as { widthPercent?: number }).widthPercent;
    const h = (t as { heightPercent?: number }).heightPercent;
    const rot = (t as { rotationDeg?: number }).rotationDeg ?? 0;
    if (typeof w !== 'number' || w <= 0) return UI_TEXT.tables.widthPercentInvalid;
    if (typeof h !== 'number' || h <= 0) return UI_TEXT.tables.heightPercentInvalid;
    if (typeof rot !== 'number' || rot < -180 || rot > 180) return UI_TEXT.tables.rotationInvalid;
  }
  return null;
}

const AdminPanel: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [mode, setMode] = useState<'bookings' | 'layout'>('bookings');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [layoutUrl, setLayoutUrl] = useState('');
  const [eventPosterUrl, setEventPosterUrl] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [venue, setVenue] = useState('');
  const [eventPhone, setEventPhone] = useState('');
  const [eventPublished, setEventPublished] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [layoutAspectRatio, setLayoutAspectRatio] = useState<number | null>(null);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [resyncLoading, setResyncLoading] = useState(false);
  const [layoutUploadLoading, setLayoutUploadLoading] = useState(false);
  const [layoutUploadError, setLayoutUploadError] = useState<string | null>(null);
  const [layoutUploadVersion, setLayoutUploadVersion] = useState<number | null>(null);
  const [addingTable, setAddingTable] = useState(false);
  /** event_id -> tables (from event_tables); used to check if booking.table_id still exists */
  const [eventTablesMap, setEventTablesMap] = useState<Record<string, Table[]>>({});

  const [layoutPreviewRef, layoutPreviewWidth] = useContainerWidth<HTMLDivElement>();

  const statusStyle: Record<string, string> = {
    pending: 'bg-[#E7E3DB] text-[#6E6A64]',
    awaiting_confirmation: 'bg-[#E7E3DB] text-[#6E6A64]',
    paid: 'bg-[#E7E3DB] text-[#6E6A64]',
    cancelled: 'bg-[#E8CFCF] text-[#7A2E2E]',
    expired: 'bg-[#E7E3DB] text-[#6E6A64]',
    reserved: 'bg-[#E7E3DB] text-[#6E6A64]',
  };

  useEffect(() => {
    if (!layoutUrl?.trim()) {
      setLayoutAspectRatio(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      setLayoutAspectRatio(w / h);
    };
    img.onerror = () => setLayoutAspectRatio(null);
    img.src = layoutUrl.trim();
  }, [layoutUrl]);

  const toFriendlyError = (e: unknown) => {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw === 'Forbidden') return UI_TEXT.common.errors.forbidden;
    if (raw.toLowerCase().includes('not found')) return UI_TEXT.common.errors.notFound;
    if (raw.toLowerCase().includes('expired')) return UI_TEXT.common.errors.expired;
    if (raw.toLowerCase().includes('only reserved')) return UI_TEXT.common.errors.onlyReserved;
    if (raw.includes('Cannot delete table') || raw.includes('it has bookings')) return UI_TEXT.common.errors.deleteTableWithBookings;
    if (raw.includes('Cannot deactivate table with active bookings')) return UI_TEXT.common.errors.cannotDeactivateTableWithBookings;
    return UI_TEXT.common.errors.default;
  };
  const isExpired = (expiresAt?: string | number) => {
    if (!expiresAt) return false;
    const ts = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : Number(expiresAt);
    if (!Number.isFinite(ts)) return false;
    return Date.now() > ts;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const data = await StorageService.getAdminBookings();
      setBookings(Array.isArray(data) ? data : []);

      const eventIds = [...new Set((data as AdminBooking[]).map((b) => b.event_id ?? b.event?.id).filter(Boolean))] as string[];
      const map: Record<string, Table[]> = {};
      for (const eventId of eventIds) {
        try {
          const ev = await StorageService.getAdminEvent(eventId);
          map[eventId] = Array.isArray(ev?.tables) ? ev.tables : [];
        } catch {
          map[eventId] = [];
        }
      }
      setEventTablesMap(map);
    } catch (e) {
      setError(toFriendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const data = await StorageService.getAdminEvents();
      setEvents(Array.isArray(data) ? (data as EventData[]) : []);
    } catch (e) {
      setError(toFriendlyError(e));
    } finally {
      setEventsLoading(false);
    }
  };

  const handleResyncSeats = async () => {
    setResyncLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await StorageService.resyncSeats();
      setSuccessMessage(UI_TEXT.admin.resyncSeatsSuccess);
      await loadEvents();
      await load();
    } catch {
      alert(UI_TEXT.admin.resyncSeatsError);
    } finally {
      setResyncLoading(false);
    }
  };

  /** Sync all event-related state from a fresh backend response. Use after successful mutations. */
  const syncEventFromFresh = (fresh: EventData) => {
    const mapped = fresh ? { ...fresh, tables: (fresh.tables ?? []).map(mapTableFromDb) } : fresh;
    setSelectedEvent(mapped);
    setLayoutUrl(fresh?.layoutImageUrl || '');
    setEventPosterUrl(fresh?.imageUrl ?? '');
    setEventTitle(fresh?.title || '');
    setEventDescription(fresh?.description || '');
    setEventDate(fresh?.event_date ?? '');
    setEventTime(fresh?.event_time ? String(fresh.event_time).slice(0, 5) : '');
    setVenue(fresh?.venue ?? '');
    setEventPhone(fresh?.paymentPhone || '');
    setEventPublished(fresh?.published === true);
    setEvents((prev) => prev.map((e) => (e.id === fresh?.id ? { ...e, title: fresh.title } : e)));
  };

  const loadEvent = async (eventId: string) => {
    if (!eventId) return;
    setEventsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const ev = await StorageService.getAdminEvent(eventId);
      if (ev) syncEventFromFresh(ev);
      setLayoutUploadVersion(null);
    } catch (e) {
      console.error('[AdminPanel] Failed to load event', e);
      if (e instanceof Error && e.message) {
        console.error('[AdminPanel] Backend message:', e.message);
      }
      setError(toFriendlyError(e));
    } finally {
      setEventsLoading(false);
    }
  };

  const createEvent = async () => {
    setCreatingEvent(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const created = await StorageService.createAdminEvent({ title: UI_TEXT.event.newEventTitle, status: 'draft' } as any);
      await loadEvents();
      if (created?.id) {
        setSelectedEventId(created.id);
        await loadEvent(created.id);
      }
      setError(null);
      setSuccessMessage(UI_TEXT.admin.eventCreated);
    } catch (e) {
      console.error('[AdminPanel] Failed to create event', e);
      if (e instanceof Error && e.message) {
        console.error('[AdminPanel] Backend message:', e.message);
      }
      setError(toFriendlyError(e));
    } finally {
      setCreatingEvent(false);
    }
  };

  const saveLayout = async () => {
    if (!selectedEvent?.id) return;
    const rawTables = selectedEvent?.tables ?? [];
    const numErr = validateTableNumbers(rawTables);
    if (numErr) { setError(numErr); return; }
    const rectErr = validateRectTables(rawTables);
    if (rectErr) { setError(rectErr); return; }
    setSavingLayout(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload: Partial<EventData> = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        event_date: eventDate.trim() || null,
        event_time: eventTime.trim() || null,
        venue: venue.trim() || null,
        paymentPhone: eventPhone.trim(),
        imageUrl: eventPosterUrl.trim() || (selectedEvent?.imageUrl ?? null),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : (selectedEvent?.layoutImageUrl ?? null),
        published: eventPublished,
        tables: rawTables.map((t, idx) => tableForBackend(t, idx)),
      };
      await StorageService.updateAdminEvent(selectedEvent.id, payload);
      const fresh = await StorageService.getAdminEvent(selectedEvent.id);
      syncEventFromFresh(fresh);
      setError(null);
      setSuccessMessage(UI_TEXT.admin.eventUpdated);
    } catch (e) {
      console.error('[AdminPanel] Failed to save event', e);
      if (e instanceof Error && e.message) {
        console.error('[AdminPanel] Backend message:', e.message);
      }
      const msg = e instanceof Error ? e.message : String(e);
      const isForbidden =
        msg === 'Forbidden' ||
        msg.toLowerCase().includes('forbidden') ||
        msg.toLowerCase().includes('published') ||
        msg.toLowerCase().includes('cannot be modified');
      setError(
        isForbidden ? UI_TEXT.event.publishedWarning : toFriendlyError(e),
      );
    } finally {
      setSavingLayout(false);
    }
  };

  useEffect(() => {
    load();
    loadEvents();
  }, []);

  const formatSeats = (b: AdminBooking) => {
    if (Array.isArray(b.tableBookings) && b.tableBookings.length > 0) {
      return b.tableBookings.map((tb) => `Стол ${tb.tableId}: ${tb.seats} ${tb.seats === 1 ? 'место' : 'мест'}`).join('; ');
    }
    if (Array.isArray(b.seatIds) && b.seatIds.length > 0) {
      return b.seatIds.join(', ');
    }
    return '—';
  };

  const tableIdsWithBookings = useMemo(() => {
    const set = new Set<string>();
    if (!selectedEventId) return set;
    for (const b of bookings) {
      if (b.event?.id !== selectedEventId) continue;
      if (Array.isArray(b.tableBookings)) {
        for (const tb of b.tableBookings) {
          if (typeof tb?.tableId === 'string') set.add(tb.tableId);
        }
      }
    }
    return set;
  }, [bookings, selectedEventId]);

  const addTable = async () => {
    if (!selectedEvent?.id) return;
    const currentTables = selectedEvent?.tables ?? [];
    const nextId = `tbl-${Date.now()}`;
    const newTable: Table = {
      id: nextId,
      number: currentTables.length + 1,
      seatsTotal: 4,
      seatsAvailable: 4,
      x: 50,
      y: 50,
      centerX: 50,
      centerY: 50,
      sizePercent: 6,
      shape: 'circle',
      color: 'Standard',
      isAvailable: true,
    };
    const newTables = [...currentTables, newTable];
    const numErr = validateTableNumbers(newTables);
    if (numErr) { setError(numErr); return; }
    const rectErr = validateRectTables(newTables);
    if (rectErr) { setError(rectErr); return; }
    setAddingTable(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload: Partial<EventData> = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        event_date: eventDate.trim() || null,
        event_time: eventTime.trim() || null,
        venue: venue.trim() || null,
        paymentPhone: eventPhone.trim(),
        imageUrl: eventPosterUrl.trim() || (selectedEvent?.imageUrl ?? null),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : (selectedEvent?.layoutImageUrl ?? null),
        published: eventPublished,
        tables: newTables.map((t, idx) => tableForBackend(t, idx)),
      };
      await StorageService.updateAdminEvent(selectedEvent.id, payload);
      const fresh = await StorageService.getAdminEvent(selectedEvent.id);
      syncEventFromFresh(fresh);
      setSuccessMessage(UI_TEXT.tables.tableAdded);
    } catch (e) {
      console.error('[AdminPanel] Failed to add table', e);
      setError(toFriendlyError(e));
    } finally {
      setAddingTable(false);
    }
  };

  const deleteTable = async (tableId: string) => {
    if (!selectedEvent?.id) return;
    const newTables = (selectedEvent.tables ?? []).filter((it) => it.id !== tableId);
    const numErr = validateTableNumbers(newTables);
    if (numErr) { setError(numErr); return; }
    const rectErr = validateRectTables(newTables);
    if (rectErr) { setError(rectErr); return; }
    setSavingLayout(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload: Partial<EventData> = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        event_date: eventDate.trim() || null,
        event_time: eventTime.trim() || null,
        venue: venue.trim() || null,
        paymentPhone: eventPhone.trim(),
        imageUrl: eventPosterUrl.trim() || (selectedEvent?.imageUrl ?? null),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : (selectedEvent?.layoutImageUrl ?? null),
        published: eventPublished,
        tables: newTables.map((t, idx) => tableForBackend(t, idx)),
      };
      await StorageService.updateAdminEvent(selectedEvent.id, payload);
      const fresh = await StorageService.getAdminEvent(selectedEvent.id);
      syncEventFromFresh(fresh);
      setSuccessMessage(UI_TEXT.tables.tableDeleted);
    } catch (e) {
      console.error('[AdminPanel] Failed to delete table', e);
      setError(toFriendlyError(e));
      if (selectedEventId) {
        try {
          const fresh = await StorageService.getAdminEvent(selectedEventId);
          syncEventFromFresh(fresh);
        } catch {
          /* ignore reload failure */
        }
      }
    } finally {
      setSavingLayout(false);
    }
  };

  const confirmBooking = async (bookingId: string) => {
    setConfirmingId(bookingId);
    setError(null);
    setSuccessMessage(null);
    try {
      await StorageService.confirmBookingPayment(bookingId);
      setError(null);
      setSuccessMessage(UI_TEXT.booking.paymentConfirmed);
      await load();
    } catch (e) {
      console.error('[AdminPanel] Failed to confirm payment', e);
      if (e instanceof Error && e.message) {
        console.error('[AdminPanel] Backend message:', e.message);
      }
      setError(toFriendlyError(e));
    } finally {
      setConfirmingId(null);
    }
  };

  const cancelBookingAction = async (bookingId: string) => {
    setCancellingId(bookingId);
    setError(null);
    setSuccessMessage(null);
    try {
      await StorageService.cancelBooking(bookingId);
      setError(null);
      setSuccessMessage('Бронирование отменено');
      await load();
    } catch (e) {
      console.error('[AdminPanel] Failed to cancel booking', e);
      setError(toFriendlyError(e));
    } finally {
      setCancellingId(null);
    }
  };

  const hasBookings = useMemo(() => bookings.length > 0, [bookings.length]);
  const filteredBookings = useMemo(() => {
    if (!statusFilter) return bookings;
    return bookings.filter((b) => String(b.status ?? '') === statusFilter);
  }, [bookings, statusFilter]);
  const hasEvents = useMemo(() => events.length > 0, [events.length]);
  const tables: Table[] = selectedEvent?.tables ?? [];

  return (
    <div className="admin-root bg-[#F6F3EE] min-h-screen p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{UI_TEXT.admin.title}</h1>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              disabled={loading || eventsLoading || savingLayout || addingTable || confirmingId !== null || cancellingId !== null}
              className="text-sm text-gray-600"
            >
              {UI_TEXT.admin.exit}
            </button>
          )}
          <PrimaryButton
            onClick={() => {
              if (mode === 'bookings') load();
              if (mode === 'layout') loadEvents();
            }}
            disabled={loading || eventsLoading}
            className="px-3 py-2 text-sm"
          >
            {UI_TEXT.admin.reload}
          </PrimaryButton>
          <SecondaryButton
            onClick={handleResyncSeats}
            disabled={resyncLoading || loading || eventsLoading}
            className="px-3 py-2 text-sm"
          >
            {resyncLoading ? UI_TEXT.common.loading : UI_TEXT.admin.resyncSeats}
          </SecondaryButton>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('bookings')}
          className={`px-3 py-2 rounded text-sm ${mode === 'bookings' ? 'bg-gray-900 text-white' : 'bg-card border text-gray-700'}`}
        >
          {UI_TEXT.admin.bookings}
        </button>
        <button
          onClick={() => setMode('layout')}
          className={`px-3 py-2 rounded text-sm ${mode === 'layout' ? 'bg-gray-900 text-white' : 'bg-card border text-gray-700'}`}
        >
          {UI_TEXT.admin.venueLayout}
        </button>
      </div>

      {loading && <div className="text-sm text-muted">{UI_TEXT.admin.loadingBookings}</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
      {successMessage && <div className="text-sm text-green-700 mb-4">{successMessage}</div>}

      {mode === 'bookings' && (
        <>
          {!loading && hasBookings && (
            <div className="mb-4">
              <label className="text-xs text-muted block mb-1">{UI_TEXT.booking.status}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border rounded px-3 py-2 text-sm min-w-[180px]"
              >
                <option value="">{UI_TEXT.booking.statusFilterAll}</option>
                <option value="pending">{UI_TEXT.booking.statusLabels.pending}</option>
                <option value="awaiting_confirmation">{UI_TEXT.booking.statusLabels.awaiting_confirmation}</option>
                <option value="paid">{UI_TEXT.booking.statusLabels.paid}</option>
                <option value="cancelled">{UI_TEXT.booking.statusLabels.cancelled}</option>
                <option value="expired">{UI_TEXT.booking.statusLabels.expired}</option>
                <option value="reserved">{UI_TEXT.booking.statusLabels.reserved}</option>
              </select>
            </div>
          )}

          {!loading && !hasBookings && (
            <div className="text-sm text-gray-600">{UI_TEXT.admin.noBookings}</div>
          )}

          {!loading && hasBookings && filteredBookings.length === 0 && (
            <div className="text-sm text-gray-600">{UI_TEXT.booking.noBookingsForFilter}</div>
          )}

          {!loading && hasBookings && filteredBookings.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              {filteredBookings.map((b) => {
                const status = String(b.status ?? '');
                const canConfirm = status === 'reserved' || status === 'awaiting_confirmation';
                const seatIndicesStr = Array.isArray(b.seat_indices) ? b.seat_indices.join(', ') : formatSeats(b);
                const telegramId = b.user_telegram_id ?? b.userTelegramId;
                const userPhone = b.user_phone ?? b.userPhone;

                return (
                  <div key={b.id} className="bg-card p-4 rounded shadow-sm border flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold">{b.event?.title || b.event_id || UI_TEXT.event.eventFallback}</div>
                      <div className="text-xs text-muted mt-1">
                        Event ID: {b.event_id ?? b.event?.id ?? '—'}
                      </div>
                      <div className="text-xs text-muted">
                        Table:{' '}
                        {(() => {
                          const eventId = b.event_id ?? b.event?.id ?? '';
                          const eventTables = eventTablesMap[eventId] ?? [];
                          const existingTableIds = new Set(eventTables.map((t) => t.id));
                          if (!b.table_id) return '—';
                          if (!existingTableIds.has(b.table_id)) {
                            return (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#E7E3DB] text-[#6E6A64]">
                                ⚠ Table deleted
                              </span>
                            );
                          }
                          const table = eventTables.find((t) => t.id === b.table_id);
                          return table ? `Table ${table.number}` : b.table_id;
                        })()}
                      </div>
                      <div className="text-xs text-muted">
                        Seat indices: {seatIndicesStr || '—'}
                      </div>
                      <div className="text-xs text-muted">
                        Seats booked: {b.seats_booked ?? (Array.isArray(b.seat_indices) ? b.seat_indices.length : '—')}
                      </div>
                      <div className="text-xs text-muted">
                        Telegram ID: {typeof telegramId === 'number' ? telegramId : '—'}
                      </div>
                      <div className="text-xs text-muted">
                        {UI_TEXT.booking.phone} {userPhone || '—'}
                      </div>
                      <div className="text-sm text-gray-700 mt-1">
                        Status:{' '}
                        {status === 'paid' && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#E7E3DB] text-[#6E6A64]">PAID</span>
                        )}
                        {status === 'cancelled' && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#E8CFCF] text-[#7A2E2E]">CANCELLED</span>
                        )}
                        {status !== 'paid' && status !== 'cancelled' && (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusStyle[status] ?? 'bg-surface text-gray-700'}`}>
                            {UI_TEXT.booking.statusLabels[status] ?? status ?? '—'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-1">
                        Created at: {b.created_at ?? '—'}
                      </div>
                      <div className="text-xs text-muted">
                        {UI_TEXT.booking.bookingId} {b.id}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {status === 'paid' && (
                        <span className="text-xs text-[#6E6A64] font-medium">PAID</span>
                      )}
                      {status === 'cancelled' && (
                        <span className="text-xs text-[#7A2E2E] font-medium">CANCELLED</span>
                      )}
                      {canConfirm && (
                        <>
                          <button
                            onClick={() => confirmBooking(b.id)}
                            disabled={confirmingId !== null || cancellingId !== null || isExpired(b.expiresAt ?? b.expires_at)}
                            className={`px-3 py-1 rounded text-sm ${
                              confirmingId !== null || cancellingId !== null || isExpired(b.expiresAt ?? b.expires_at)
                                ? 'bg-gray-300 text-gray-700'
                                : 'bg-[#C6A75E] text-white'
                            }`}
                          >
                            {confirmingId === b.id ? UI_TEXT.booking.confirming : isExpired(b.expiresAt ?? b.expires_at) ? UI_TEXT.booking.expired : 'Confirm Payment'}
                          </button>
                          <button
                            onClick={() => cancelBookingAction(b.id)}
                            disabled={confirmingId !== null || cancellingId !== null}
                            className={`px-3 py-1 rounded text-sm ${
                              confirmingId !== null || cancellingId !== null
                                ? 'bg-gray-300 text-gray-700'
                                : 'bg-[#E8CFCF] text-[#7A2E2E]'
                            }`}
                          >
                            {cancellingId === b.id ? 'Отмена…' : 'Cancel'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {mode === 'layout' && (
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-card p-4 rounded border">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                onClick={loadEvents}
                disabled={eventsLoading || creatingEvent}
                className="px-3 py-2 text-sm border rounded"
              >
                {UI_TEXT.admin.refresh}
              </button>
              <button
                onClick={createEvent}
                disabled={eventsLoading || creatingEvent}
                className="px-3 py-2 text-sm border rounded"
              >
                {creatingEvent ? UI_TEXT.admin.creatingEvent : UI_TEXT.admin.createEvent}
              </button>
            </div>
            {eventsLoading && (
              <div className="space-y-3 mt-2" aria-label={UI_TEXT.admin.loadingEvents}>
                <EventCardSkeleton />
                <EventCardSkeleton />
                <EventCardSkeleton />
                <EventCardSkeleton />
              </div>
            )}
            {!eventsLoading && !hasEvents && (
              <div className="py-8 text-center">
                <p className="text-base text-gray-600 mb-4">{UI_TEXT.admin.emptyEventsList}</p>
                <SecondaryButton
                  type="button"
                  onClick={createEvent}
                  disabled={creatingEvent}
                  className="px-4 py-2.5 text-sm min-h-[44px]"
                >
                  {creatingEvent ? UI_TEXT.admin.creatingEvent : UI_TEXT.admin.createEvent}
                </SecondaryButton>
              </div>
            )}
            {!eventsLoading && hasEvents && (
              <div className="space-y-3">
                {events.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    mode="admin"
                    selected={ev.id === selectedEventId}
                    onClick={() => {
                      setSelectedEventId(ev.id);
                      setSelectedEvent(null);
                      setError(null);
                      setSuccessMessage(null);
                      loadEvent(ev.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {selectedEvent && (
            <>
              <AdminCard>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.title}</div>
                    <input
                      type="text"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder={UI_TEXT.event.titlePlaceholder}
                      className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.description}</div>
                    <textarea
                      value={eventDescription}
                      onChange={(e) => setEventDescription(e.target.value)}
                      placeholder={UI_TEXT.event.descriptionPlaceholder}
                      className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-semibold mb-1">{UI_TEXT.event.eventDate}</div>
                      <input
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        placeholder={UI_TEXT.event.eventDatePlaceholder}
                        className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-1">{UI_TEXT.event.eventTime}</div>
                      <input
                        type="time"
                        value={eventTime}
                        onChange={(e) => setEventTime(e.target.value)}
                        placeholder={UI_TEXT.event.eventTimePlaceholder}
                        className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.venue}</div>
                    <input
                      type="text"
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                      placeholder={UI_TEXT.event.venuePlaceholder}
                      className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.organizerPhone}</div>
                    <input
                      type="text"
                      value={eventPhone}
                      onChange={(e) => setEventPhone(e.target.value)}
                      placeholder={UI_TEXT.event.phonePlaceholder}
                      className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                    />
                  </div>
                </div>
              </AdminCard>
              <AdminCard>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-600">{UI_TEXT.admin.statusLabel}</span>
                  <span className="admin-status-badge">
                    {selectedEvent?.status === 'published' ? UI_TEXT.admin.published : selectedEvent?.status === 'archived' ? UI_TEXT.admin.archived : UI_TEXT.admin.draft}
                  </span>
                  {selectedEvent?.status === 'draft' && (
                    <PrimaryButton
                      type="button"
                      onClick={async () => {
                        if (!selectedEventId || !selectedEvent) return;
                        const rawTables = selectedEvent?.tables ?? [];
                        const numErr = validateTableNumbers(rawTables);
                        if (numErr) { setError(numErr); return; }
                        const rectErr = validateRectTables(rawTables);
                        if (rectErr) { setError(rectErr); return; }
                        setStatusActionLoading(true);
                        setError(null);
                        setSuccessMessage(null);
                        try {
                          const payload = {
                            status: 'published' as const,
                            tables: rawTables.map((t, idx) => tableForBackend(t, idx)),
                          };
                          await StorageService.updateAdminEvent(selectedEvent.id, payload);
                          setSuccessMessage(UI_TEXT.admin.eventPublished);
                          await loadEvent(selectedEventId);
                        } catch (e) {
                          console.error('[AdminPanel] Publish failed', e);
                          setError(toFriendlyError(e));
                        } finally {
                          setStatusActionLoading(false);
                        }
                      }}
                      disabled={statusActionLoading}
                      className="px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      {statusActionLoading ? '…' : UI_TEXT.admin.publishEvent}
                    </PrimaryButton>
                  )}
                  {selectedEvent?.status === 'published' && (
                    <DangerButton
                      type="button"
                      onClick={async () => {
                        if (!selectedEventId) return;
                        setStatusActionLoading(true);
                        setError(null);
                        setSuccessMessage(null);
                        try {
                          await StorageService.archiveAdminEvent(selectedEventId);
                          setSuccessMessage(UI_TEXT.admin.eventArchived);
                          await loadEvent(selectedEventId);
                        } catch (e) {
                          console.error('[AdminPanel] Archive failed', e);
                          setError(toFriendlyError(e));
                        } finally {
                          setStatusActionLoading(false);
                        }
                      }}
                      disabled={statusActionLoading}
                      className="px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      {statusActionLoading ? '…' : UI_TEXT.admin.archiveEvent}
                    </DangerButton>
                )}
                  {selectedEvent?.status === 'archived' && (
                    <PrimaryButton
                      type="button"
                      onClick={async () => {
                        if (!selectedEventId || !selectedEvent) return;
                        const rawTables = selectedEvent?.tables ?? [];
                        const numErr = validateTableNumbers(rawTables);
                        if (numErr) { setError(numErr); return; }
                        const rectErr = validateRectTables(rawTables);
                        if (rectErr) { setError(rectErr); return; }
                        setStatusActionLoading(true);
                        setError(null);
                        setSuccessMessage(null);
                        try {
                          const payload = {
                            status: 'published' as const,
                            tables: rawTables.map((t, idx) => tableForBackend(t, idx)),
                          };
                          await StorageService.updateAdminEvent(selectedEvent.id, payload);
                          setSuccessMessage(UI_TEXT.admin.eventPublishedAgain);
                          await loadEvent(selectedEventId);
                        } catch (e) {
                          console.error('[AdminPanel] Publish again failed', e);
                          setError(toFriendlyError(e));
                        } finally {
                          setStatusActionLoading(false);
                        }
                      }}
                      disabled={statusActionLoading}
                      className="px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      {statusActionLoading ? '…' : UI_TEXT.admin.publishAgain}
                    </PrimaryButton>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm mt-3">
                  <input
                    type="checkbox"
                    checked={eventPublished}
                    onChange={(e) => setEventPublished(e.target.checked)}
                  />
                  {UI_TEXT.admin.publishedCheckbox}
                </label>
              </AdminCard>
              <AdminCard>
                <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{UI_TEXT.tables.tables}</div>
                  <PrimaryButton
                    onClick={addTable}
                    disabled={addingTable || savingLayout}
                    className="text-sm"
                  >
                    {addingTable ? UI_TEXT.common.loading : UI_TEXT.tables.addTable}
                  </PrimaryButton>
                </div>
                {tables.length === 0 && (
                  <div className="text-xs text-muted">{UI_TEXT.tables.noTablesYet}</div>
                )}
                {tables.map((t, idx) => (
                  <div key={t.id} className="flex flex-wrap gap-2 items-center">
                    <div className="text-xs text-muted">#{idx + 1}</div>
                    <label className="text-xs text-gray-600">
                      {UI_TEXT.tables.tableNumber}
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={t.number ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, number: 1 } : it) } : null);
                            return;
                          }
                          const parsed = parseInt(raw, 10);
                          const val = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, number: val } : it) } : null);
                        }}
                        className="ml-1 w-16 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={t.isAvailable === true}
                        onChange={() => {
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, isAvailable: !it.isAvailable } : it) } : null);
                        }}
                        className="rounded"
                      />
                      {UI_TEXT.tables.available}
                    </label>
                    <label className="text-xs text-gray-600">
                      X
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={t.x ?? t.centerX ?? 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, x: val, centerX: val } : it) } : null);
                        }}
                        className="ml-1 w-20 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Y
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={t.y ?? t.centerY ?? 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, y: val, centerY: val } : it) } : null);
                        }}
                        className="ml-1 w-20 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      {UI_TEXT.tables.sizePercent}
                      <input
                        type="number"
                        min={1}
                        max={20}
                        step={1}
                        value={t.sizePercent ?? 6}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(20, Number(e.target.value) || 6));
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, sizePercent: val } : it) } : null);
                        }}
                        className="ml-1 w-14 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      {UI_TEXT.tables.seats}
                      <input
                        type="number"
                        min={0}
                        value={t.seatsTotal}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, seatsTotal: val, seatsAvailable: val } : it) } : null);
                        }}
                        className="ml-1 w-20 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      {UI_TEXT.tables.shape}
                      <select
                        value={t.shape ?? 'circle'}
                        onChange={(e) => {
                          const val = e.target.value === 'rect' ? 'rect' : 'circle';
                          const defaults = val === 'rect'
                            ? { widthPercent: (t as { widthPercent?: number }).widthPercent ?? 8, heightPercent: (t as { heightPercent?: number }).heightPercent ?? 6, rotationDeg: (t as { rotationDeg?: number }).rotationDeg ?? 0 }
                            : {};
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, shape: val, ...defaults } : it) } : null);
                        }}
                        className="ml-1 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="circle">{UI_TEXT.tables.shapeCircle}</option>
                        <option value="rect">{UI_TEXT.tables.shapeRect}</option>
                      </select>
                    </label>
                    {(t.shape ?? 'circle') !== 'circle' && (
                      <>
                        <label className="text-xs text-gray-600">
                          {UI_TEXT.tables.widthPercent}
                          <input
                            type="number"
                            min={0.1}
                            step={0.5}
                            value={(t as { widthPercent?: number }).widthPercent ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw === '' ? undefined : Math.max(0.1, Number(raw));
                              setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, widthPercent: val } : it) } : null);
                            }}
                            className="ml-1 w-14 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </label>
                        <label className="text-xs text-gray-600">
                          {UI_TEXT.tables.heightPercent}
                          <input
                            type="number"
                            min={0.1}
                            step={0.5}
                            value={(t as { heightPercent?: number }).heightPercent ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw === '' ? undefined : Math.max(0.1, Number(raw));
                              setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, heightPercent: val } : it) } : null);
                            }}
                            className="ml-1 w-14 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </label>
                        <label className="text-xs text-gray-600">
                          {UI_TEXT.tables.rotationDeg}
                          <input
                            type="number"
                            min={-180}
                            max={180}
                            step={1}
                            value={(t as { rotationDeg?: number }).rotationDeg ?? 0}
                            onChange={(e) => {
                              const val = Math.max(-180, Math.min(180, Number(e.target.value) || 0));
                              setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, rotationDeg: val } : it) } : null);
                            }}
                            className="ml-1 w-14 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </label>
                      </>
                    )}
                    <label className="text-xs text-gray-600">
                      {UI_TEXT.tables.tableCategory}
                      <select
                        value={/^(VIP|Premium|Standard)$/.test(t.color ?? '') ? t.color! : 'Standard'}
                        onChange={(e) => {
                          const val = e.target.value as 'VIP' | 'Premium' | 'Standard';
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, color: val } : it) } : null);
                        }}
                        className="ml-1 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="Standard">{UI_TEXT.tables.tableCategoryStandard}</option>
                        <option value="Premium">{UI_TEXT.tables.tableCategoryPremium}</option>
                        <option value="VIP">{UI_TEXT.tables.tableCategoryVIP}</option>
                      </select>
                    </label>
                    <label className="text-xs text-gray-600" title={UI_TEXT.tables.visibleFromPlaceholder}>
                      {UI_TEXT.tables.visibleFrom}
                      <input
                        type="datetime-local"
                        value={toDatetimeLocal(t.visibleFrom ?? undefined)}
                        onChange={(e) => {
                          const val = e.target.value ? new Date(e.target.value).toISOString() : '';
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, visibleFrom: val || null } : it) } : null);
                        }}
                        className="ml-1 w-36 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-gray-600" title={UI_TEXT.tables.visibleUntilPlaceholder}>
                      {UI_TEXT.tables.visibleUntil}
                      <input
                        type="datetime-local"
                        value={toDatetimeLocal(t.visibleUntil ?? undefined)}
                        onChange={(e) => {
                          const val = e.target.value ? new Date(e.target.value).toISOString() : '';
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, visibleUntil: val || null } : it) } : null);
                        }}
                        className="ml-1 w-36 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    {(() => {
                      const hasBookings = tableIdsWithBookings.has(t.id);
                      return (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(UI_TEXT.tables.deleteConfirm)) return;
                            await deleteTable(t.id);
                          }}
                          disabled={savingLayout}
                          title={hasBookings ? UI_TEXT.tables.deleteWithBookingsTooltip : undefined}
                          className="px-2 py-1 text-xs border rounded text-red-700 border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          🗑 {UI_TEXT.tables.delete}
                        </button>
                      );
                    })()}
                  </div>
                ))}
                </div>
              </AdminCard>
              <div>
                <div className="text-sm font-semibold mb-1">{UI_TEXT.event.posterLabel}</div>
                <input
                  type="text"
                  value={eventPosterUrl}
                  onChange={(e) => setEventPosterUrl(e.target.value)}
                  placeholder={UI_TEXT.event.posterPlaceholder}
                  className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                />
                <div className="text-xs text-muted mt-1">
                  URL изображения афиши (обложка события).
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">{UI_TEXT.tables.layoutImageUrl}</div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !selectedEvent?.id) return;
                    setLayoutUploadLoading(true);
                    setLayoutUploadError(null);
                    try {
                      const { url, version } = await StorageService.uploadLayoutImage(selectedEvent.id, file);
                      setLayoutUrl(url);
                      setLayoutUploadVersion(version ?? null);
                    } catch (err) {
                      setLayoutUploadError(err instanceof Error ? err.message : 'Upload failed');
                    } finally {
                      setLayoutUploadLoading(false);
                      e.target.value = '';
                    }
                  }}
                  disabled={layoutUploadLoading || !selectedEvent?.id}
                  className="w-full max-w-full border rounded px-3 py-2 text-sm box-border file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-surface file:cursor-pointer"
                />
                {layoutUploadLoading && <div className="text-xs text-muted mt-1">{UI_TEXT.common.loading}</div>}
                {layoutUploadError && <div className="text-xs text-red-600 mt-1">{layoutUploadError}</div>}
                <input
                  type="text"
                  value={layoutUrl}
                  onChange={(e) => { setLayoutUrl(e.target.value); setLayoutUploadError(null); setLayoutUploadVersion(null); }}
                  placeholder={UI_TEXT.tables.layoutImagePlaceholder}
                  className="w-full max-w-full border rounded px-3 py-2 text-sm box-border mt-2"
                />
                <div className="text-xs text-muted mt-1">
                  {UI_TEXT.tables.layoutImageHint}
                </div>
                {layoutUrl && (
                  <div className="mt-2">
                    <div className="rounded border overflow-hidden bg-surface max-h-32">
                      <img src={layoutUrl} alt="" className="w-full h-auto max-h-32 object-contain" onError={() => {}} />
                    </div>
                    {layoutUploadVersion != null && (
                      <div className="text-xs text-muted mt-1">v{layoutUploadVersion}</div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2 flex-col md:flex-row">
                  <PrimaryButton
                    onClick={saveLayout}
                    disabled={savingLayout}
                    className="px-3 py-2 text-sm w-full md:w-auto"
                  >
                    {savingLayout ? UI_TEXT.common.saving : UI_TEXT.common.save}
                  </PrimaryButton>
                  <SecondaryButton
                    onClick={() => { setLayoutUrl(selectedEvent?.layoutImageUrl || ''); setLayoutUploadVersion(null); }}
                    className="px-3 py-2 text-sm w-full md:w-auto"
                  >
                    {UI_TEXT.common.reset}
                  </SecondaryButton>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">{UI_TEXT.tables.layoutPreview}</div>
                {/* Layout container: same aspect ratio as image so admin and user coordinates match 1:1. */}
                <div
                  ref={layoutPreviewRef}
                  className="relative w-full border rounded bg-surface overflow-hidden"
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: layoutAspectRatio ?? 16 / 9,
                    minHeight: layoutAspectRatio == null ? '18rem' : undefined,
                    padding: 0,
                    backgroundImage: layoutUrl ? `url(${layoutUrl})` : 'none',
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'top left',
                  }}
                >
                  {!layoutUrl && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted pointer-events-none">
                      {UI_TEXT.tables.noLayoutImage}
                    </div>
                  )}
                  {layoutPreviewWidth > 0 && [...tables].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity)).map((raw) => {
                    const table = mapTableFromDb(raw);
                    const available = typeof table.seatsAvailable === 'number' ? table.seatsAvailable : table.seatsTotal ?? 0;
                    const total = typeof table.seatsTotal === 'number' ? table.seatsTotal : 4;
                    const categoryColor = getTableCategoryColor(table.category ?? table.color);
                    const sizes = computeTableSizes(layoutPreviewWidth, {
                      sizePercent: table.sizePercent,
                      widthPercent: table.widthPercent,
                      heightPercent: table.heightPercent,
                    });
                    const isRect = typeof sizes.borderRadius === 'number';
                    const shapeStyle = {
                      width: sizes.width,
                      height: sizes.height,
                      borderRadius: sizes.borderRadius,
                      backgroundColor: isRect ? '#F9F6F1' : categoryColor,
                    };
                    return (
                      <div
                        key={table.id}
                        className="table-wrapper"
                        style={{
                          position: 'absolute',
                          left: `${table.centerX}%`,
                          top: `${table.centerY}%`,
                          transform: `translate(-50%, -50%) rotate(${table.rotationDeg}deg)`,
                          transformOrigin: 'center',
                        }}
                      >
                        <div className="table-shape" style={shapeStyle} />
                        <div className="table-label">
                          <TableNumber number={table.number ?? 0} fontSize={`${sizes.fontNumber}px`} />
                          <SeatInfo available={available} total={total} fontSize={`${sizes.fontSub}px`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-muted mt-2">
                  {UI_TEXT.tables.layoutHint}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;