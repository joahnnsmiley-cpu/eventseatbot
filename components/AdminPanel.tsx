import React, { useEffect, useMemo, useState } from 'react';
import * as StorageService from '../services/storageService';
import { EventData, Table } from '../types';
import { UI_TEXT } from '../constants/uiText';
import EventCard, { EventCardSkeleton } from './EventCard';

type AdminBooking = {
  id: string;
  event: { id: string; title?: string; date?: string };
  seatIds?: string[];
  tableBookings?: Array<{ tableId: string; seats: number }>;
  userTelegramId?: number;
  userPhone?: string;
  totalAmount?: number;
  status?: string;
  expiresAt?: string | number;
};

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
  };
}

const AdminPanel: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [mode, setMode] = useState<'bookings' | 'layout'>('bookings');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [layoutUrl, setLayoutUrl] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventPhone, setEventPhone] = useState('');
  const [eventPublished, setEventPublished] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [layoutAspectRatio, setLayoutAspectRatio] = useState<number | null>(null);
  const [statusActionLoading, setStatusActionLoading] = useState(false);

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

  const loadEvent = async (eventId: string) => {
    if (!eventId) return;
    setEventsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const ev = await StorageService.getAdminEvent(eventId);
      setSelectedEvent(ev);
      setLayoutUrl(ev?.layoutImageUrl || '');
      setEventTitle(ev?.title || '');
      setEventDescription(ev?.description || '');
      setEventPhone(ev?.paymentPhone || '');
      setEventPublished(ev?.published === true);
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
    setSavingLayout(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const rawTables = selectedEvent?.tables ?? [];
      const payload: Partial<EventData> = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        paymentPhone: eventPhone.trim(),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : (selectedEvent?.layoutImageUrl ?? null),
        published: eventPublished,
        tables: rawTables.map((t, idx) => tableForBackend(t, idx)),
      };
      await StorageService.updateAdminEvent(selectedEvent.id, payload);
      // Never use PUT response: it returns reduced shape (toEvent) without tables and would overwrite state.
      const refreshed = await StorageService.getAdminEvent(selectedEvent.id);
      setSelectedEvent(refreshed);
      setLayoutUrl(refreshed?.layoutImageUrl || '');
      setEventTitle(refreshed?.title || '');
      setEventDescription(refreshed?.description || '');
      setEventPhone(refreshed?.paymentPhone || '');
      setEventPublished(refreshed?.published === true);
      setEvents((prev) => prev.map((e) => (e.id === refreshed.id ? { ...e, title: refreshed.title } : e)));
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
    if (Array.isArray(b.seatIds) && b.seatIds.length > 0) {
      return b.seatIds.join(', ');
    }
    if (Array.isArray(b.tableBookings) && b.tableBookings.length > 0) {
      return b.tableBookings.map((tb) => `${tb.tableId} × ${tb.seats}`).join(', ');
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

  const deleteTable = async (tableId: string) => {
    if (!selectedEvent?.id) return;
    const newTables = (selectedEvent.tables ?? []).filter((it) => it.id !== tableId);
    setSelectedEvent((prev) => (prev ? { ...prev, tables: newTables } : null));
    setSavingLayout(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload: Partial<EventData> = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        paymentPhone: eventPhone.trim(),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : (selectedEvent?.layoutImageUrl ?? null),
        published: eventPublished,
        tables: newTables.map((t, idx) => tableForBackend(t, idx)),
      };
      await StorageService.updateAdminEvent(selectedEvent.id, payload);
      // Never use PUT response: it returns reduced shape (toEvent) without tables and would overwrite state.
      const refreshed = await StorageService.getAdminEvent(selectedEvent.id);
      setSelectedEvent(refreshed);
      setLayoutUrl(refreshed?.layoutImageUrl || '');
      setEventTitle(refreshed?.title || '');
      setEventDescription(refreshed?.description || '');
      setEventPhone(refreshed?.paymentPhone || '');
      setEventPublished(refreshed?.published === true);
      setSuccessMessage(UI_TEXT.tables.tableDeleted);
    } catch (e) {
      console.error('[AdminPanel] Failed to delete table', e);
      setError(toFriendlyError(e));
    } finally {
      setSavingLayout(false);
    }
  };

  const confirmBooking = async (bookingId: string) => {
    setConfirmingId(bookingId);
    setError(null);
    setSuccessMessage(null);
    try {
      await StorageService.confirmBooking(bookingId);
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: 'paid' } : b)));
      setError(null);
      setSuccessMessage(UI_TEXT.booking.paymentConfirmed);
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

  const hasBookings = useMemo(() => bookings.length > 0, [bookings.length]);
  const hasEvents = useMemo(() => events.length > 0, [events.length]);
  const tables: Table[] = selectedEvent?.tables ?? [];

  return (
    <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{UI_TEXT.admin.title}</h1>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              disabled={loading || eventsLoading || savingLayout || confirmingId !== null}
              className="text-sm text-gray-600"
            >
              {UI_TEXT.admin.exit}
            </button>
          )}
          <button
            onClick={() => {
              if (mode === 'bookings') load();
              if (mode === 'layout') loadEvents();
            }}
            disabled={loading || eventsLoading}
            className="bg-blue-600 text-white px-3 py-2 rounded"
          >
            {UI_TEXT.admin.reload}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('bookings')}
          className={`px-3 py-2 rounded text-sm ${mode === 'bookings' ? 'bg-gray-900 text-white' : 'bg-white border text-gray-700'}`}
        >
          {UI_TEXT.admin.bookings}
        </button>
        <button
          onClick={() => setMode('layout')}
          className={`px-3 py-2 rounded text-sm ${mode === 'layout' ? 'bg-gray-900 text-white' : 'bg-white border text-gray-700'}`}
        >
          {UI_TEXT.admin.venueLayout}
        </button>
      </div>

      {loading && <div className="text-sm text-gray-500">{UI_TEXT.admin.loadingBookings}</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
      {successMessage && <div className="text-sm text-green-700 mb-4">{successMessage}</div>}

      {mode === 'bookings' && (
        <>
          {!loading && !hasBookings && (
            <div className="text-sm text-gray-600">{UI_TEXT.admin.noBookings}</div>
          )}

          {!loading && hasBookings && (
            <div className="grid grid-cols-1 gap-4">
              {bookings.map((b) => (
                <div key={b.id} className="bg-white p-4 rounded shadow-sm border flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold">{b.event?.title || UI_TEXT.event.eventFallback}</div>
                    <div className="text-xs text-gray-500">{b.event?.date || ''}</div>
                    <div className="text-sm text-gray-700 mt-2">
                      {UI_TEXT.booking.seats} <span className="font-medium">{formatSeats(b)}</span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {UI_TEXT.booking.phone} <span className="font-medium">{b.userPhone || '—'}</span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {UI_TEXT.booking.status} <span className="font-medium">{UI_TEXT.booking.statusLabels[b.status ?? ''] ?? b.status ?? '—'}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {UI_TEXT.booking.bookingId} {b.id}
                    </div>
                    <div className="text-xs text-gray-500">
                      {UI_TEXT.booking.telegramId}: {typeof b.userTelegramId === 'number' ? b.userTelegramId : '—'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {UI_TEXT.booking.expires}: {b.expiresAt ? String(b.expiresAt) : '—'}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {b.status === 'paid' && (
                      <div className="text-xs text-green-700">{UI_TEXT.booking.paymentConfirmed}</div>
                    )}
                    {b.status === 'reserved' && (
                      <>
                        <button
                          onClick={() => confirmBooking(b.id)}
                          disabled={confirmingId === b.id || confirmingId !== null || isExpired(b.expiresAt)}
                          className={`px-3 py-1 rounded text-sm ${
                            confirmingId === b.id || confirmingId !== null || isExpired(b.expiresAt)
                              ? 'bg-gray-300 text-gray-700'
                              : 'bg-green-600 text-white'
                          }`}
                        >
                          {confirmingId === b.id ? UI_TEXT.booking.confirming : isExpired(b.expiresAt) ? UI_TEXT.booking.expired : UI_TEXT.booking.confirmPayment}
                        </button>
                        {confirmingId !== null && confirmingId !== b.id && !isExpired(b.expiresAt) && (
                          <div className="text-xs text-gray-500">{UI_TEXT.booking.anotherConfirmInProgress}</div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'layout' && (
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-white p-4 rounded border">
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
                <button
                  type="button"
                  onClick={createEvent}
                  disabled={creatingEvent}
                  className="px-4 py-2.5 text-sm font-medium rounded-lg border border-blue-500 text-blue-600 bg-blue-50 hover:bg-blue-100 active:scale-[0.98] transition-colors min-h-[44px]"
                >
                  {creatingEvent ? UI_TEXT.admin.creatingEvent : UI_TEXT.admin.createEvent}
                </button>
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
            <div className="bg-white p-4 rounded border space-y-4">
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600">{UI_TEXT.admin.statusLabel}</span>
                <span className="text-sm font-medium">
                  {selectedEvent?.status === 'published' ? UI_TEXT.admin.published : selectedEvent?.status === 'archived' ? UI_TEXT.admin.archived : UI_TEXT.admin.draft}
                </span>
                {selectedEvent?.status === 'draft' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!selectedEventId) return;
                      setStatusActionLoading(true);
                      setError(null);
                      setSuccessMessage(null);
                      try {
                        await StorageService.publishAdminEvent(selectedEventId);
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
                    className="px-3 py-1.5 text-sm border rounded bg-green-100 border-green-300 disabled:opacity-50"
                  >
                    {statusActionLoading ? '…' : UI_TEXT.admin.publishEvent}
                  </button>
                )}
                {selectedEvent?.status === 'published' && (
                  <button
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
                    className="px-3 py-1.5 text-sm border rounded bg-amber-100 border-amber-300 disabled:opacity-50"
                  >
                    {statusActionLoading ? '…' : UI_TEXT.admin.archiveEvent}
                  </button>
                )}
                {selectedEvent?.status === 'archived' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!selectedEventId) return;
                      setStatusActionLoading(true);
                      setError(null);
                      setSuccessMessage(null);
                      try {
                        await StorageService.publishAdminEvent(selectedEventId);
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
                    className="px-3 py-1.5 text-sm border rounded bg-green-100 border-green-300 disabled:opacity-50"
                  >
                    {statusActionLoading ? '…' : UI_TEXT.admin.publishAgain}
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={eventPublished}
                  onChange={(e) => setEventPublished(e.target.checked)}
                />
                {UI_TEXT.admin.publishedCheckbox}
              </label>
              <div className="border rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{UI_TEXT.tables.tables}</div>
                  <button
                    onClick={() => {
                      const nextId = `tbl-${Date.now()}`;
                      const count = tables?.length ?? 0;
                      const newTable: Table = {
                        id: nextId,
                        number: count + 1,
                        seatsTotal: 4,
                        seatsAvailable: 4,
                        x: 50,
                        y: 50,
                        centerX: 50,
                        centerY: 50,
                        sizePercent: 5,
                        shape: 'circle',
                        color: '#3b82f6',
                        isAvailable: true,
                      };
                      setSelectedEvent((prev) => (prev ? { ...prev, tables: [...(prev.tables ?? []), newTable] } : null));
                    }}
                    disabled={eventPublished}
                    className="px-2 py-1 text-xs border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {UI_TEXT.tables.addTable}
                  </button>
                </div>
                {tables.length === 0 && (
                  <div className="text-xs text-gray-500">{UI_TEXT.tables.noTablesYet}</div>
                )}
                {tables.map((t, idx) => (
                  <div key={t.id} className="flex flex-wrap gap-2 items-center">
                    <div className="text-xs text-gray-500">#{idx + 1}</div>
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
                        disabled={eventPublished}
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
                        disabled={eventPublished}
                        className="ml-1 w-20 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
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
                        disabled={eventPublished}
                        className="ml-1 w-20 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      {UI_TEXT.tables.sizePercent}
                      <input
                        type="range"
                        min={1}
                        max={20}
                        step={1}
                        value={t.sizePercent ?? 5}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, sizePercent: val } : it) } : null);
                        }}
                        disabled={eventPublished}
                        className="ml-2 align-middle disabled:opacity-60"
                      />
                      <span className="ml-1">{t.sizePercent ?? 5}</span>
                    </label>
                    <label className="text-xs text-gray-600">
                      {UI_TEXT.tables.shape}
                      <select
                        value={t.shape ?? 'circle'}
                        onChange={(e) => {
                          const val = e.target.value === 'rect' ? 'rect' : 'circle';
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, shape: val } : it) } : null);
                        }}
                        disabled={eventPublished}
                        className="ml-1 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="circle">{UI_TEXT.tables.shapeCircle}</option>
                        <option value="rect">{UI_TEXT.tables.shapeRect}</option>
                      </select>
                    </label>
                    <label className="text-xs text-gray-600">
                      {UI_TEXT.tables.tableColor}
                      <input
                        type="color"
                        value={t.color || '#3b82f6'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, color: val } : it) } : null);
                        }}
                        disabled={eventPublished}
                        className="ml-1 h-7 w-10 border rounded disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    {(() => {
                      const canDelete = selectedEvent?.status !== 'published' && !tableIdsWithBookings.has(t.id);
                      const hasBookings = tableIdsWithBookings.has(t.id);
                      return (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!canDelete) return;
                            if (!window.confirm(UI_TEXT.tables.deleteConfirm)) return;
                            await deleteTable(t.id);
                          }}
                          disabled={!canDelete || savingLayout}
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
              <div>
                <div className="text-sm font-semibold mb-1">{UI_TEXT.tables.layoutImageUrl}</div>
                <input
                  type="text"
                  value={layoutUrl}
                  onChange={(e) => setLayoutUrl(e.target.value)}
                  placeholder={UI_TEXT.tables.layoutImagePlaceholder}
                  className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {UI_TEXT.tables.layoutImageHint}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 flex-col md:flex-row">
                  <button
                    onClick={saveLayout}
                    disabled={savingLayout}
                    className="bg-blue-600 text-white px-3 py-2 rounded text-sm w-full md:w-auto"
                  >
                    {savingLayout ? UI_TEXT.common.saving : UI_TEXT.common.save}
                  </button>
                  <button
                    onClick={() => setLayoutUrl(selectedEvent?.layoutImageUrl || '')}
                    className="px-3 py-2 text-sm border rounded w-full md:w-auto"
                  >
                    {UI_TEXT.common.reset}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">{UI_TEXT.tables.layoutPreview}</div>
                {/* Layout container: same aspect ratio as image so admin and user coordinates match 1:1. */}
                <div
                  className="relative w-full border rounded bg-gray-100 overflow-hidden"
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: layoutAspectRatio ?? 16 / 9,
                    minHeight: layoutAspectRatio == null ? 300 : undefined,
                    padding: 0,
                    backgroundImage: layoutUrl ? `url(${layoutUrl})` : 'none',
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'top left',
                  }}
                >
                  {!layoutUrl && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 pointer-events-none">
                      {UI_TEXT.tables.noLayoutImage}
                    </div>
                  )}
                  {tables.map((t, idx) => {
                    const isRect = (t.shape ?? 'circle') === 'rect';
                    const bg = t.color || '#3b82f6';
                    const posX = t.x ?? t.centerX ?? 0;
                    const posY = t.y ?? t.centerY ?? 0;
                    return (
                      <div
                        key={t.id}
                        className={`table-wrapper ${isRect ? 'rect' : 'circle'}`}
                        style={{
                          position: 'absolute',
                          left: `${posX}%`,
                          top: `${posY}%`,
                          transform: 'translate(-50%, -50%)',
                          ['--size' as string]: Number(t.sizePercent) ?? 5,
                        }}
                      >
                        <div className={`table-shape ${isRect ? 'rect' : 'circle'}`} style={{ backgroundColor: bg }} />
                        <div className="table-label">{UI_TEXT.tables.tableLabel.replace('{number}', String(idx + 1)).replace('{seats}', String(t.seatsTotal))}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  {UI_TEXT.tables.layoutHint}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;