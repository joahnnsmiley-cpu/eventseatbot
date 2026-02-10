import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as StorageService from './services/storageService';
import AdminPanel from './components/AdminPanel';
import AuthService from './services/authService';
import SeatMap from './components/SeatMap';
import SeatPicker from './components/SeatPicker';
import type { Booking, EventData, Table } from './types';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        sendData?: (data: string) => void;
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id?: number;
            username?: string;
            first_name?: string;
            last_name?: string;
          };
        };
      };
    };
  }
}

type TgUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type PublicEvent = {
  id: string;
  title?: string;
  date?: string;
};

function App() {
  const [tgAvailable, setTgAvailable] = useState(false);
  const [tgInitData, setTgInitData] = useState('');
  const [tgUser, setTgUser] = useState<TgUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRole, setAuthRole] = useState<string | null>(null);
  const [tokenRole, setTokenRole] = useState<string | null>(null);
  const [view, setView] = useState<'events' | 'layout' | 'seats' | 'my-bookings' | 'admin'>('events');

  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  /** UI-only: selected seat indices per table. Source of truth for seat count; SeatPicker and +/- sync to this. */
  const [selectedSeatsByTable, setSelectedSeatsByTable] = useState<Record<string, number[]>>({});
  const eventRequestRef = useRef(0);
  const [selectionAdjusted, setSelectionAdjusted] = useState(false);
  const selectionAdjustedTimerRef = useRef<number | null>(null);
  const [userPhone, setUserPhone] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccessMessage, setBookingSuccessMessage] = useState<string | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [myBookingsLoading, setMyBookingsLoading] = useState(false);
  const [myBookingsError, setMyBookingsError] = useState<string | null>(null);
  const [bookingsStale, setBookingsStale] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      setTgAvailable(true);
      try {
        tg.ready?.();
      } catch {}
      setTgInitData(tg.initData || '');
      setTgUser(tg.initDataUnsafe?.user || null);
    } else {
      setTgAvailable(false);
    }
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    const applyTheme = () => {
      const isDark = tg.colorScheme === 'dark';
      document.body.classList.toggle('tg-dark', isDark);
      document.body.classList.toggle('tg-light', !isDark);
      const params = tg.themeParams || {};
      const root = document.documentElement;
      if (params.bg_color) root.style.setProperty('--tg-theme-bg-color', params.bg_color);
      if (params.text_color) root.style.setProperty('--tg-theme-text-color', params.text_color);
      if (params.hint_color) root.style.setProperty('--tg-theme-hint-color', params.hint_color);
      if (params.button_color) root.style.setProperty('--tg-theme-button-color', params.button_color);
      if (params.button_text_color) root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
      if (params.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', params.secondary_bg_color);
    };

    applyTheme();
    try {
      tg.onEvent?.('themeChanged', applyTheme);
    } catch {}

    return () => {
      try {
        tg.offEvent?.('themeChanged', applyTheme);
      } catch {}
    };
  }, []);

  useEffect(() => {
    const updateRole = (t: string | null) => {
      const payload = AuthService.decodeToken(t);
      setIsAdmin(payload?.role === 'admin');
      setTokenRole(payload?.role ?? null);
    };

    updateRole(AuthService.getToken());

    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { token?: string | null } | undefined;
      updateRole(detail?.token ?? null);
    };

    window.addEventListener('auth:changed', handler as EventListener);
    return () => window.removeEventListener('auth:changed', handler as EventListener);
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!tgUser?.id) return;
      if (AuthService.getToken()) return;
      if (!tgInitData) return;
      setAuthLoading(true);
      setAuthError(null);
      try {
        const data = await AuthService.loginWithTelegram(tgUser.id, tgInitData);
        setIsAdmin(data?.role === 'admin');
        setAuthRole(data?.role ?? null);
      } catch {
        setAuthError('Unable to verify access. Please open the app from Telegram.');
      } finally {
        setAuthLoading(false);
      }
    };
    void run();
  }, [tgUser?.id, tgInitData]);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await StorageService.getEvents();
      setEvents(Array.isArray(data) ? data : []);
      setHasLoaded(true);
    } catch (e) {
      setError('Не удалось загрузить события. Попробуйте ещё раз.');
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const loadMyBookings = async (silent = false) => {
    if (!silent) {
      setMyBookingsLoading(true);
      setMyBookingsError(null);
    }
    try {
      const data = await StorageService.getMyBookings();
      setMyBookings(Array.isArray(data) ? data : []);
      if (silent) setBookingsStale(false);
    } catch (e) {
      if (!silent) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'Forbidden') {
          setMyBookingsError('Please log in to view your bookings.');
        } else {
          setMyBookingsError('Could not load bookings. Please retry.');
        }
      } else {
        setBookingsStale(true);
      }
    } finally {
      if (!silent) setMyBookingsLoading(false);
    }
  };

  const loadEvent = async (eventId: string, silent = false) => {
    if (!eventId) return;
    const reqId = ++eventRequestRef.current;
    if (!silent) {
      setEventLoading(true);
      setEventError(null);
    }
    try {
      const ev = await StorageService.getEvent(eventId);
      console.log('[USER EVENT FETCH]', ev);
      if (reqId !== eventRequestRef.current) return;
      setSelectedEvent(ev);
    } catch (e) {
      setEventError('Could not load event. Tap Refresh to try again.');
    } finally {
      if (!silent) setEventLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedEventId) return;
    if (view !== 'layout' && view !== 'seats') return;
    loadEvent(selectedEventId, true);
    const id = window.setInterval(() => {
      loadEvent(selectedEventId, true);
    }, 8000);
    return () => window.clearInterval(id);
  }, [selectedEventId, view]);

  const selectedTable: Table | null = useMemo(() => {
    if (!selectedEvent || !selectedTableId) return null;
    return selectedEvent.tables?.find((t) => t.id === selectedTableId) ?? null;
  }, [selectedEvent, selectedTableId]);

  useEffect(() => {
    if (!selectedTable || !selectedTableId) return;
    const max = Math.max(0, selectedTable.seatsAvailable);
    const sel = selectedSeatsByTable[selectedTableId] ?? [];
    if (sel.length <= max) return;
    setSelectionAdjusted(true);
    if (selectionAdjustedTimerRef.current) {
      window.clearTimeout(selectionAdjustedTimerRef.current);
    }
    selectionAdjustedTimerRef.current = window.setTimeout(() => {
      setSelectionAdjusted(false);
      selectionAdjustedTimerRef.current = null;
    }, 2500);
    setSelectedSeatsByTable((prev) => ({
      ...prev,
      [selectedTableId]: (prev[selectedTableId] ?? []).slice(0, max),
    }));
  }, [selectedTable?.id, selectedTable?.seatsAvailable, selectedTableId, selectedSeatsByTable]);

  useEffect(() => {
    if (view !== 'seats') return;
    if (!selectedEvent || !selectedTableId || !selectedTable) {
      setView('layout');
      setSelectedTableId(null);
    }
  }, [view, selectedEvent, selectedTableId, selectedTable]);

  useEffect(() => {
    if (view !== 'my-bookings') return;
    loadMyBookings();
  }, [view]);

  useEffect(() => {
    if (view !== 'my-bookings') return;
    const id = window.setInterval(() => {
      loadMyBookings(true);
    }, 8000);
    return () => window.clearInterval(id);
  }, [view]);

  useEffect(() => {
    if (view !== 'my-bookings') return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [view]);

  const formatCountdown = (expiresAt?: string | number) => {
    if (!expiresAt) return null;
    const target = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : Number(expiresAt);
    if (!Number.isFinite(target)) return null;
    const diffMs = Math.max(0, target - nowTick);
    const totalSeconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      if (selectionAdjustedTimerRef.current) {
        window.clearTimeout(selectionAdjustedTimerRef.current);
      }
    };
  }, []);

  const handleEventSelect = async (eventId: string) => {
    setSelectedEvent(null);
    setSelectedEventId(eventId);
    setSelectedTableId(null);
    setBookingError(null);
    setView('layout');
    await loadEvent(eventId);
  };

  if (isAdmin && view === 'admin') {
    return (
      <AdminPanel onBack={() => setView('events')} />
    );
  }

  if (view === 'layout' && selectedEventId) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => {
                setView('events');
                setSelectedTableId(null);
                setSelectedEventId(null);
                setSelectedEvent(null);
              }}
              className="text-xs px-2 py-1 rounded border"
            >
              Back
            </button>
            <div className="text-xs text-gray-500">{selectedEvent?.title || 'Event'}</div>
            <button onClick={() => selectedEventId && loadEvent(selectedEventId)} className="text-xs px-2 py-1 rounded border">
              Refresh
            </button>
          </div>

          {eventLoading && <div className="text-xs text-gray-500">Loading layout…</div>}
          {eventError && <div className="text-xs text-red-600 mb-3">{eventError}</div>}

          {!selectedEvent && (
            <div className="text-xs text-gray-500">Loading event…</div>
          )}

          {selectedEvent && (
            <SeatMap
              event={selectedEvent}
              selectedSeatsByTable={selectedSeatsByTable}
              onTableSelect={(tableId) => {
                setSelectedTableId(tableId);
                setView('seats');
                if (selectedEventId) loadEvent(selectedEventId, true);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (view === 'seats' && (!selectedEvent || !selectedTableId || !selectedTable)) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
        <div className="p-4">
          <div className="text-xs text-gray-500">Returning to layout…</div>
        </div>
      </div>
    );
  }

  if (view === 'seats' && selectedEvent) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => {
                setView('layout');
                setSelectedTableId(null);
              }}
              disabled={bookingLoading}
              className="text-xs px-2 py-1 rounded border"
            >
              Back
            </button>
            <div className="text-xs text-gray-500">{selectedEvent.title || 'Event'}</div>
            <button
              onClick={() => selectedEventId && loadEvent(selectedEventId)}
              disabled={bookingLoading}
              className="text-xs px-2 py-1 rounded border"
            >
              Refresh
            </button>
          </div>

          {eventLoading && <div className="text-xs text-gray-500">Loading seats…</div>}
          {eventError && <div className="text-xs text-red-600 mb-3">{eventError}</div>}

          {selectedTable ? (
            <div className="space-y-4">
              <div className="bg-white rounded border p-4">
                <div className="text-sm font-semibold">Table {selectedTable.number}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Free seats: {selectedTable.seatsAvailable} / {selectedTable.seatsTotal}
                </div>
              </div>

              <div className="bg-white rounded border p-4">
                <div className="text-sm font-semibold mb-2">Select seats</div>
                <SeatPicker
                  table={selectedTable}
                  selectedIndices={selectedSeatsByTable[selectedTableId!] ?? []}
                  onToggleSeat={(seatIndex) => {
                    if (!selectedTableId) return;
                    setSelectedSeatsByTable((prev) => {
                      const arr = prev[selectedTableId] ?? [];
                      const set = new Set(arr);
                      if (set.has(seatIndex)) set.delete(seatIndex);
                      else set.add(seatIndex);
                      return { ...prev, [selectedTableId]: [...set].sort((a, b) => a - b) };
                    });
                  }}
                />
              </div>

              <div className="bg-white rounded border p-4">
                <div className="text-sm font-semibold mb-2">Number of seats</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded border text-sm"
                    onClick={() => {
                      if (!selectedTableId) return;
                      const selected = selectedSeatsByTable[selectedTableId] ?? [];
                      if (selected.length === 0) return;
                      const sorted = [...selected].sort((a, b) => a - b);
                      setSelectedSeatsByTable((prev) => ({
                        ...prev,
                        [selectedTableId]: sorted.slice(0, -1),
                      }));
                    }}
                    disabled={(selectedSeatsByTable[selectedTableId] ?? []).length === 0}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    readOnly
                    min={0}
                    max={selectedTable.seatsTotal}
                    value={(selectedSeatsByTable[selectedTableId] ?? []).length}
                    className="w-20 text-center border rounded px-2 py-2 text-sm bg-gray-50"
                    tabIndex={-1}
                    aria-label="Selected seat count"
                  />
                  <button
                    type="button"
                    className="px-3 py-2 rounded border text-sm"
                    onClick={() => {
                      if (!selectedTableId) return;
                      const selected = selectedSeatsByTable[selectedTableId] ?? [];
                      const total = selectedTable.seatsTotal;
                      if (selected.length >= total) return;
                      const set = new Set(selected);
                      let freeIndex = 0;
                      while (set.has(freeIndex) && freeIndex < total) freeIndex++;
                      if (freeIndex >= total) return;
                      setSelectedSeatsByTable((prev) => ({
                        ...prev,
                        [selectedTableId]: [...selected, freeIndex].sort((a, b) => a - b),
                      }));
                    }}
                    disabled={
                      (selectedSeatsByTable[selectedTableId] ?? []).length >= selectedTable.seatsTotal ||
                      selectedTable.seatsAvailable === 0
                    }
                  >
                    +
                  </button>
                  <span className="text-xs text-gray-500">/ {selectedTable.seatsTotal}</span>
                </div>
                {selectedTable.seatsAvailable === 0 && (
                  <div className="text-xs text-gray-600 mt-2">
                    This table is fully booked. Go back and choose another.
                  </div>
                )}
                {selectionAdjusted && (
                  <div className="text-xs text-amber-600 mt-2">
                    Availability updated. Your selection was adjusted.
                  </div>
                )}
              </div>

              <div className="bg-white rounded border p-4">
                <div className="text-sm font-semibold mb-2">Contact phone</div>
                <input
                  type="tel"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="+7 999 000-00-00"
                  className="w-full border rounded px-3 py-2 text-sm"
                  disabled={bookingLoading}
                />
                {bookingError && (
                  <div className="text-xs text-red-600 mt-2">{bookingError}</div>
                )}
              </div>

              <div className="bg-white rounded border p-4">
                <div className="text-xs text-gray-500">
                  Availability refreshes automatically while you are here.
                </div>
              </div>

              <button
                className="w-full bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={
                  selectedTable.seatsAvailable === 0 ||
                  bookingLoading ||
                  (selectedSeatsByTable[selectedTableId] ?? []).length === 0
                }
                onClick={() => {
                  setBookingError(null);
                  if (!selectedEventId || !selectedTableId) return;
                  const normalizedPhone = userPhone.trim();
                  if (!normalizedPhone) {
                    setBookingError('Add a phone number to continue.');
                    return;
                  }
                  const seats = selectedSeatsByTable[selectedTableId] ?? [];
                  if (seats.length === 0) {
                    setBookingError('Select at least one seat.');
                    return;
                  }
                  const tg = window.Telegram?.WebApp;
                  if (!tg?.sendData) {
                    setBookingError('Open in Telegram to book.');
                    return;
                  }
                  const payload = {
                    eventId: selectedEventId,
                    tableId: selectedTableId,
                    seats: [...seats],
                    phone: normalizedPhone,
                  };
                  tg.sendData(JSON.stringify(payload));
                  setSelectedSeatsByTable((prev) => {
                    const next = { ...prev };
                    delete next[selectedTableId];
                    return next;
                  });
                  setSelectedTableId(null);
                  setSelectedEvent(null);
                  setBookingSuccessMessage('Booking sent. Check Telegram.');
                  setView('my-bookings');
                }}
              >
                {bookingLoading ? 'Booking…' : 'Continue / Book'}
              </button>
              {bookingLoading && (
                <div className="text-xs text-gray-500 mt-2">Submitting…</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-600">Table not found. Go back and choose another.</div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'my-bookings') {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => {
                setView('events');
                setSelectedEventId(null);
                setSelectedEvent(null);
                setSelectedTableId(null);
                setBookingSuccessMessage(null);
              }}
              disabled={myBookingsLoading}
              className="text-xs px-2 py-1 rounded border"
            >
              Back
            </button>
            <div className="text-xs text-gray-500">My bookings</div>
            <button
              onClick={() => loadMyBookings()}
              disabled={myBookingsLoading}
              className="text-xs px-2 py-1 rounded border"
            >
              Refresh
            </button>
          </div>

          {bookingSuccessMessage && (
            <div className="text-sm text-green-700 mb-4">{bookingSuccessMessage}</div>
          )}
          {myBookingsLoading && <div className="text-xs text-gray-500">Loading bookings…</div>}
          {myBookingsError && (
            <div className="text-xs text-red-600 mb-3">
              {myBookingsError}
              {myBookingsError.includes('log in') && (
                <div className="mt-2">
                  <button
                    onClick={() => setView('events')}
                    className="text-xs px-2 py-1 rounded border"
                  >
                    Back to events
                  </button>
                </div>
              )}
            </div>
          )}
          {!myBookingsError && bookingsStale && (
            <div className="text-xs text-gray-500 mb-3">
              Couldn’t refresh data. Tap Refresh to update.
            </div>
          )}

          {!myBookingsLoading && !myBookingsError && myBookings.length === 0 && (
            <div className="text-sm text-gray-600">
              You have no bookings yet. Go back to events to reserve seats.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {myBookings.map((b) => (
              <div key={b.id} className="bg-white p-3 rounded border">
                <div className="text-sm font-semibold">
                  {b.event?.title ? b.event.title : `Booking #${b.id}`}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Status: {b.status}
                </div>
                {b.status === 'reserved' && formatCountdown(b.expiresAt) && (
                  <div className="text-xs text-amber-600">
                    Expires in: {formatCountdown(b.expiresAt)}
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  Seats: {typeof b.seatsCount === 'number'
                    ? b.seatsCount
                    : Array.isArray(b.seatIds) && b.seatIds.length > 0
                      ? b.seatIds.length
                      : '—'}
                </div>
                <div className="text-xs text-gray-500">Total: {b.totalAmount ?? '—'}</div>
                {b.status === 'paid' && Array.isArray(b.tickets) && b.tickets.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {b.tickets.map((t) => {
                      const img = t.imageUrl || t.ticketImagePath;
                      if (!img) return null;
                      return (
                        <img
                          key={t.id}
                          src={img}
                          alt="Ticket"
                          className="w-full h-24 object-cover rounded border"
                        />
                      );
                    })}
                  </div>
                )}
                {b.status === 'paid' && (!Array.isArray(b.tickets) || b.tickets.length === 0) && (
                  <div className="text-xs text-gray-600 mt-2">
                    Tickets will appear here after payment is confirmed.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">EventSeatBot</h1>
          {isAdmin && (
            <button onClick={() => setView('admin')} className="text-xs px-2 py-1 rounded border">
              Admin
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600 mb-4">Список опубликованных событий</p>
        {isAdmin && (
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-600">
            <span>Админ доступ активен.</span>
            <button onClick={() => setView('admin')} className="text-xs px-2 py-1 rounded border">
              Открыть админку
            </button>
          </div>
        )}
        {(() => {
          const debugFlag = (() => {
            try {
              return localStorage.getItem('debugAdmin') === 'true';
            } catch {
              return false;
            }
          })();
          if (import.meta.env.MODE === 'production' && !debugFlag) return null;
          return (
            <div className="mb-4 rounded border bg-white p-3 text-xs text-gray-600">
              <div>Debug admin</div>
              <div>Telegram user id: {tgUser?.id ?? '—'}</div>
              <div>isAdmin: {String(isAdmin)}</div>
              <div>role (login): {authRole ?? '—'}</div>
              <div>role (token): {tokenRole ?? '—'}</div>
            </div>
          );
        })()}

        {!tgAvailable && (
          <div className="text-xs text-gray-500 mb-4">
            Telegram WebApp не обнаружен. Локальный режим.
          </div>
        )}

        {!!tgInitData && (
          <div className="text-xs text-gray-500 mb-4">
            Telegram initData получен.
          </div>
        )}

        {authLoading && (
          <div className="text-xs text-gray-500 mb-4">
            Авторизация Telegram…
          </div>
        )}
        {authError && (
          <div className="text-xs text-gray-500 mb-4">
            {authError}
          </div>
        )}

        {tgUser && (
          <div className="text-xs text-gray-500 mb-4">
            Пользователь: {tgUser.username || tgUser.first_name || tgUser.id}
          </div>
        )}

        <button
          onClick={loadEvents}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold"
          disabled={loading}
        >
          {loading ? 'Загружаем события…' : 'События'}
        </button>

        {error && <div className="text-sm text-red-600 mt-4">{error}</div>}

        <div className="mt-6 space-y-3">
          {hasLoaded && events.length === 0 && !error && (
            <div className="text-sm text-gray-600">
              Пока нет опубликованных событий. Попробуйте снова позже.
            </div>
          )}
          {events.map((evt) => (
            <button
              key={evt.id}
              onClick={() => handleEventSelect(evt.id)}
              className="w-full text-left bg-white p-3 rounded border active:scale-[0.99]"
            >
              <div className="font-semibold">{evt.title || 'Без названия'}</div>
              <div className="text-xs text-gray-500">{evt.date || ''}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;