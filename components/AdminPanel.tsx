import React, { useEffect, useMemo, useState } from 'react';
import * as StorageService from '../services/storageService';
import { EventData } from '../types';

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

type AdminEventSummary = {
  id: string;
  title?: string;
  date?: string;
  description?: string;
};

const AdminPanel: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [mode, setMode] = useState<'bookings' | 'layout'>('bookings');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [layoutUrl, setLayoutUrl] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventPhone, setEventPhone] = useState('');
  const [savingLayout, setSavingLayout] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);

  const toFriendlyError = (e: unknown) => {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw === 'Forbidden') return 'Access denied. Please sign in again.';
    if (raw.toLowerCase().includes('not found')) return 'Not found. Please refresh and try again.';
    if (raw.toLowerCase().includes('expired')) return 'Booking expired. It can no longer be confirmed.';
    if (raw.toLowerCase().includes('only reserved')) return 'Only reserved bookings can be confirmed.';
    return 'Something went wrong. Please retry.';
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
      setEvents(Array.isArray(data) ? (data as AdminEventSummary[]) : []);
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
      const created = await StorageService.createAdminEvent({ title: 'New event', status: 'draft' } as any);
      await loadEvents();
      if (created?.id) {
        setSelectedEventId(created.id);
        await loadEvent(created.id);
      }
      setError(null);
      setSuccessMessage('Event created.');
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
      const payload: Partial<EventData> = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        paymentPhone: eventPhone.trim(),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : null,
      };
      const updated = await StorageService.updateAdminEvent(selectedEvent.id, payload);
      const merged = { ...selectedEvent, ...updated, ...payload };
      setSelectedEvent(merged);
      setLayoutUrl(merged.layoutImageUrl || '');
      setEvents((prev) => prev.map((e) => (e.id === merged.id ? { ...e, title: merged.title } : e)));
      setError(null);
      setSuccessMessage('Event updated.');
    } catch (e) {
      console.error('[AdminPanel] Failed to save event', e);
      if (e instanceof Error && e.message) {
        console.error('[AdminPanel] Backend message:', e.message);
      }
      setError(toFriendlyError(e));
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

  const confirmBooking = async (bookingId: string) => {
    setConfirmingId(bookingId);
    setError(null);
    setSuccessMessage(null);
    try {
      await StorageService.confirmBooking(bookingId);
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: 'paid' } : b)));
      setError(null);
      setSuccessMessage('Payment confirmed.');
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
  const previewUrl = (selectedEvent?.layoutImageUrl || selectedEvent?.imageUrl || '').trim();
  const tables = Array.isArray(selectedEvent?.tables) ? selectedEvent?.tables : [];

  return (
    <div className="p-4 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              disabled={loading || eventsLoading || savingLayout || confirmingId !== null}
              className="text-sm text-gray-600"
            >
              Exit
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
            Reload
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('bookings')}
          className={`px-3 py-2 rounded text-sm ${mode === 'bookings' ? 'bg-gray-900 text-white' : 'bg-white border text-gray-700'}`}
        >
          Bookings
        </button>
        <button
          onClick={() => setMode('layout')}
          className={`px-3 py-2 rounded text-sm ${mode === 'layout' ? 'bg-gray-900 text-white' : 'bg-white border text-gray-700'}`}
        >
          Venue layout
        </button>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading bookings…</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
      {successMessage && <div className="text-sm text-green-700 mb-4">{successMessage}</div>}

      {mode === 'bookings' && (
        <>
          {!loading && !hasBookings && (
            <div className="text-sm text-gray-600">No bookings yet.</div>
          )}

          {!loading && hasBookings && (
            <div className="grid grid-cols-1 gap-4">
              {bookings.map((b) => (
                <div key={b.id} className="bg-white p-4 rounded shadow-sm border flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold">{b.event?.title || 'Event'}</div>
                    <div className="text-xs text-gray-500">{b.event?.date || ''}</div>
                    <div className="text-sm text-gray-700 mt-2">
                      Seats: <span className="font-medium">{formatSeats(b)}</span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      Phone: <span className="font-medium">{b.userPhone || '—'}</span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      Status: <span className="font-medium">{b.status || '—'}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Booking ID: {b.id}
                    </div>
                    <div className="text-xs text-gray-500">
                      Telegram ID: {typeof b.userTelegramId === 'number' ? b.userTelegramId : '—'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Expires: {b.expiresAt ? String(b.expiresAt) : '—'}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {b.status === 'paid' && (
                      <div className="text-xs text-green-700">Payment confirmed</div>
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
                          {confirmingId === b.id ? 'Confirming…' : isExpired(b.expiresAt) ? 'Expired' : 'Confirm payment'}
                        </button>
                        {confirmingId !== null && confirmingId !== b.id && !isExpired(b.expiresAt) && (
                          <div className="text-xs text-gray-500">Another confirmation is in progress</div>
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
            <div className="text-sm font-semibold mb-2">Select event</div>
            <div className="flex items-center gap-2">
              <select
                value={selectedEventId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedEventId(nextId);
                  setSelectedEvent(null);
                  setError(null);
                  setSuccessMessage(null);
                  if (nextId) loadEvent(nextId);
                }}
                className="border rounded px-2 py-2 text-sm w-full"
              >
                <option value="">— Choose event —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title || ev.id}
                  </option>
                ))}
              </select>
              <button
                onClick={loadEvents}
                disabled={eventsLoading || creatingEvent}
                className="px-3 py-2 text-sm border rounded"
              >
                Refresh
              </button>
              <button
                onClick={createEvent}
                disabled={eventsLoading || creatingEvent}
                className="px-3 py-2 text-sm border rounded"
              >
                {creatingEvent ? 'Creating…' : 'Create event'}
              </button>
            </div>
            {eventsLoading && (
              <div className="text-xs text-gray-500 mt-2">Loading events…</div>
            )}
            {!eventsLoading && !hasEvents && (
              <div className="text-xs text-gray-500 mt-2">No events found.</div>
            )}
          </div>

          {selectedEvent && (
            <div className="bg-white p-4 rounded border space-y-4">
              <div>
                <div className="text-sm font-semibold mb-1">Title</div>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Event title"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Description</div>
                <textarea
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Organizer phone</div>
                <input
                  type="text"
                  value={eventPhone}
                  onChange={(e) => setEventPhone(e.target.value)}
                  placeholder="Phone for payments"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Layout image URL</div>
                <input
                  type="text"
                  value={layoutUrl}
                  onChange={(e) => setLayoutUrl(e.target.value)}
                  placeholder="https://example.com/layout.jpg"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Use this image as the table layout background.
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={saveLayout}
                    disabled={savingLayout}
                    className="bg-blue-600 text-white px-3 py-2 rounded text-sm"
                  >
                    {savingLayout ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setLayoutUrl(selectedEvent?.layoutImageUrl || '')}
                    className="px-3 py-2 text-sm border rounded"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">Layout preview</div>
                <div className="relative w-full h-80 border rounded bg-gray-100 overflow-hidden">
                  {previewUrl ? (
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url(${previewUrl})`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        backgroundSize: '100% 100%',
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                      No layout image URL
                    </div>
                  )}

                  {tables.map((table) => {
                    const x = typeof table.x === 'number' ? table.x : table.centerX;
                    const y = typeof table.y === 'number' ? table.y : table.centerY;
                    return (
                      <div
                        key={table.id}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${x}%`, top: `${y}%` }}
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center shadow">
                          {table.number}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Tables are positioned using percentage coordinates (0–100).
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