import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as StorageService from './services/storageService';
import AdminPanel from './components/AdminPanel';
import AuthService from './services/authService';
import SeatMap from './components/SeatMap';
import SeatPicker from './components/SeatPicker';
import EventCard, { EventCardSkeleton } from './components/EventCard';
import BookingSuccessView from './components/BookingSuccessView';
import MyTicketsPage from './components/MyTicketsPage';
import AppLayout from './src/layout/AppLayout';
import BottomNav, { type BottomNavTab } from './src/layout/BottomNav';
import type { Booking, EventData, Table } from './types';
import { UI_TEXT } from './constants/uiText';

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

function App() {
  const [tgAvailable, setTgAvailable] = useState(false);
  const [tgInitData, setTgInitData] = useState('');
  const [tgUser, setTgUser] = useState<TgUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRole, setAuthRole] = useState<string | null>(null);
  const [tokenRole, setTokenRole] = useState<string | null>(null);
  const [view, setView] = useState<'events' | 'layout' | 'seats' | 'my-bookings' | 'my-tickets' | 'booking-success' | 'admin'>('events');

  const [events, setEvents] = useState<EventData[]>([]);
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
  const [userComment, setUserComment] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccessMessage, setBookingSuccessMessage] = useState<string | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [myBookingsLoading, setMyBookingsLoading] = useState(false);
  const [myBookingsError, setMyBookingsError] = useState<string | null>(null);
  const [bookingsStale, setBookingsStale] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [lastCreatedBooking, setLastCreatedBooking] = useState<Booking | null>(null);
  const [lastCreatedEvent, setLastCreatedEvent] = useState<EventData | null>(null);
  /** Occupied seat indices per table — from GET /public/events/:eventId/occupied-seats */
  const [occupiedMap, setOccupiedMap] = useState<Record<string, Set<number>>>({});

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
    document.title = UI_TEXT.app.appTitle;
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      if (window.location.hash === '#/my-tickets') setView('my-tickets');
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    if (view === 'my-tickets') {
      window.location.hash = '#/my-tickets';
    }
  }, [view]);

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
        setAuthError(UI_TEXT.common.errors.unableToVerifyAccess);
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
      const list = Array.isArray(data) ? data : [];
      setEvents(list);
      setHasLoaded(true);
    } catch (e) {
      setError(UI_TEXT.common.errors.loadEventsFailed);
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
          setMyBookingsError(UI_TEXT.common.errors.pleaseLogInToViewBookings);
        } else {
          setMyBookingsError(UI_TEXT.common.errors.couldNotLoadBookings);
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

      try {
        const occupied = await StorageService.getOccupiedSeats(eventId);
        if (reqId !== eventRequestRef.current) return;
        const map: Record<string, Set<number>> = {};
        for (const row of occupied) {
          if (row.table_id && Array.isArray(row.seat_indices)) {
            map[row.table_id] = new Set(row.seat_indices.map(Number));
          }
        }
        setOccupiedMap(map);
      } catch {
        setOccupiedMap({});
      }
    } catch (e) {
      setEventError(UI_TEXT.common.errors.couldNotLoadEvent);
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
    const visibleTables = (selectedEvent.tables ?? []).filter((t) => t.is_active !== false);
    return visibleTables.find((t) => t.id === selectedTableId) ?? null;
  }, [selectedEvent, selectedTableId]);

  const publishedEvents = useMemo(() => {
    return events.filter(
      (e) => e.status !== 'archived' && (e.published === true || e.status === 'published' || !e.status)
    );
  }, [events]);

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
    setOccupiedMap({});
    setBookingError(null);
    setView('layout');
    await loadEvent(eventId);
  };

  const bottomNavActiveTab: BottomNavTab =
    view === 'my-tickets' ? 'my-tickets' :
    view === 'my-bookings' ? 'profile' : 'events';

  const wrapWithLayout = (children: React.ReactNode) => (
    <AppLayout>
      {children}
      <BottomNav
        activeTab={bottomNavActiveTab}
        onEventsClick={() => { setView('events'); setSelectedEventId(null); setSelectedEvent(null); setSelectedTableId(null); }}
        onMyTicketsClick={() => { setView('my-tickets'); window.location.hash = ''; }}
        onProfileClick={() => setView('my-bookings')}
      />
    </AppLayout>
  );

  if (isAdmin && view === 'admin') {
    return wrapWithLayout(<AdminPanel onBack={() => setView('events')} />);
  }

  if (view === 'my-tickets') {
    return wrapWithLayout(<MyTicketsPage onBack={() => { setView('events'); window.location.hash = ''; }} />);
  }

  if (view === 'layout' && selectedEventId) {
    return wrapWithLayout(
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
              {UI_TEXT.app.back}
            </button>
            <div className="text-xs text-gray-500">{selectedEvent?.title || UI_TEXT.app.event}</div>
            <button onClick={() => selectedEventId && loadEvent(selectedEventId)} className="text-xs px-2 py-1 rounded border">
              {UI_TEXT.app.refresh}
            </button>
          </div>

          {eventLoading && <div className="text-xs text-gray-500">{UI_TEXT.app.loadingLayout}</div>}
          {eventError && <div className="text-xs text-red-600 mb-3">{eventError}</div>}

          {!selectedEvent && (
            <div className="text-xs text-gray-500">{UI_TEXT.app.loadingEvent}</div>
          )}

          {selectedEvent && (
            <>
              {/* Порядок: 1. Название 2. Афиша 3. Рассадка 4. Описание 5. Контакт организатора */}
              <h1 className="text-xl font-semibold text-gray-900 mb-3">
                {selectedEvent.title?.trim() || UI_TEXT.event.eventFallback}
              </h1>
              {selectedEvent.imageUrl?.trim() && (
                <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 mb-4">
                  <img
                    src={selectedEvent.imageUrl.trim()}
                    alt={selectedEvent.title?.trim() || UI_TEXT.event.eventFallback}
                    className="w-full h-auto max-h-48 object-cover object-center"
                  />
                </div>
              )}
              <SeatMap
                event={selectedEvent}
                selectedSeatsByTable={selectedSeatsByTable}
                onTableSelect={(tableId) => {
                  setSelectedTableId(tableId);
                  setView('seats');
                  if (selectedEventId) loadEvent(selectedEventId, true);
                }}
              />
              {/* Описание и контакт — после рассадки */}
              {selectedEvent.description != null && selectedEvent.description.trim() !== '' && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap mt-4 mb-4">
                  {selectedEvent.description.trim()}
                </p>
              )}
              {/* Блок контакта: только если есть adminTelegramId или заглушка; без пустых ссылок */}
              {(() => {
                const placeholder = 'eventseatbot_support'; // TODO: set to null when backend sends adminTelegramId
                const raw = selectedEvent.adminTelegramId ?? placeholder;
                const contactTarget = typeof raw === 'string' ? raw.trim() : '';
                if (!contactTarget) return null;
                const username = contactTarget.replace(/^@/, '');
                const href = /^\d+$/.test(username)
                  ? `https://t.me/+${username}`
                  : `https://t.me/${username}`;
                return (
                  <div className="mt-4 mb-4 p-3 rounded-lg border border-gray-200 bg-white space-y-2">
                    <p className="text-sm text-gray-700">{UI_TEXT.event.contactOrganizerPrompt}</p>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-[#0088cc] rounded-lg hover:opacity-90"
                    >
                      {UI_TEXT.event.contactOrganizerButton}
                    </a>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    );
  }

  if (view === 'seats' && (!selectedEvent || !selectedTableId || !selectedTable)) {
    return wrapWithLayout(
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
        <div className="p-4">
          <div className="text-xs text-gray-500">{UI_TEXT.app.returningToLayout}</div>
        </div>
      </div>
    );
  }

  if (view === 'seats' && selectedEvent) {
    return wrapWithLayout(
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
              {UI_TEXT.app.back}
            </button>
            <div className="text-xs text-gray-500">{selectedEvent.title || UI_TEXT.app.event}</div>
            <button
              onClick={() => selectedEventId && loadEvent(selectedEventId)}
              disabled={bookingLoading}
              className="text-xs px-2 py-1 rounded border"
            >
              {UI_TEXT.app.refresh}
            </button>
          </div>

          {eventLoading && <div className="text-xs text-gray-500">{UI_TEXT.app.loadingSeats}</div>}
          {eventError && <div className="text-xs text-red-600 mb-3">{eventError}</div>}

          {selectedTable ? (
            <div className="space-y-4">
              <div className="bg-white rounded border p-4">
                <div className="text-sm font-semibold">{UI_TEXT.tables.table} {selectedTable.number}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {UI_TEXT.app.freeSeats} {selectedTable.seatsAvailable} / {selectedTable.seatsTotal}
                </div>
                {selectedTable.isAvailable !== true && (
                  <div className="text-xs text-amber-600 mt-2">
                    {UI_TEXT.app.tableNotAvailableForSale}
                  </div>
                )}
              </div>

              <div className="bg-white rounded border p-4">
                <div className="text-sm font-semibold mb-2">{UI_TEXT.app.selectSeats}</div>
                <SeatPicker
                  table={selectedTable}
                  selectedIndices={selectedSeatsByTable[selectedTableId!] ?? []}
                  tableDisabled={selectedTable.isAvailable !== true}
                  occupiedIndices={occupiedMap[selectedTableId!] ?? new Set()}
                  onToggleSeat={(seatIndex) => {
                    if (!selectedTableId) return;
                    const occupied = occupiedMap[selectedTableId] ?? new Set();
                    if (occupied.has(seatIndex)) return;
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
                <div className="text-sm font-semibold mb-2">{UI_TEXT.app.numberOfSeats}</div>
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
                    disabled={(selectedSeatsByTable[selectedTableId] ?? []).length === 0 || selectedTable.isAvailable !== true}
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
                    aria-label={UI_TEXT.app.selectedSeatCount}
                  />
                  <button
                    type="button"
                    className="px-3 py-2 rounded border text-sm"
                    onClick={() => {
                      if (!selectedTableId) return;
                      const selected = selectedSeatsByTable[selectedTableId] ?? [];
                      const total = selectedTable.seatsTotal;
                      const occupied = occupiedMap[selectedTableId] ?? new Set();
                      const set = new Set(selected);
                      let freeIndex = 0;
                      while ((set.has(freeIndex) || occupied.has(freeIndex)) && freeIndex < total) freeIndex++;
                      if (freeIndex >= total) return;
                      setSelectedSeatsByTable((prev) => ({
                        ...prev,
                        [selectedTableId]: [...selected, freeIndex].sort((a, b) => a - b),
                      }));
                    }}
                    disabled={
                      (selectedSeatsByTable[selectedTableId] ?? []).length >= selectedTable.seatsTotal ||
                      selectedTable.seatsAvailable === 0 ||
                      selectedTable.isAvailable !== true ||
                      (() => {
                        const total = selectedTable.seatsTotal;
                        const occupied = occupiedMap[selectedTableId] ?? new Set();
                        const selected = selectedSeatsByTable[selectedTableId] ?? [];
                        const set = new Set(selected);
                        for (let i = 0; i < total; i++) {
                          if (!set.has(i) && !occupied.has(i)) return false;
                        }
                        return true;
                      })()
                    }
                  >
                    +
                  </button>
                  <span className="text-xs text-gray-500">/ {selectedTable.seatsTotal}</span>
                </div>
                {selectedTable.seatsAvailable === 0 && (
                  <div className="text-xs text-gray-600 mt-2">
                    {UI_TEXT.app.tableFullyBooked}
                  </div>
                )}
                {selectionAdjusted && (
                  <div className="text-xs text-amber-600 mt-2">
                    {UI_TEXT.app.selectionAdjusted}
                  </div>
                )}
              </div>

              <div className="bg-white rounded border p-4">
                <div className="text-sm font-semibold mb-2">{UI_TEXT.app.contactPhone} <span className="text-red-500">*</span></div>
                <input
                  type="tel"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder={UI_TEXT.app.phonePlaceholder}
                  className="w-full border rounded px-3 py-2 text-sm"
                  disabled={bookingLoading}
                />
              </div>

              <div className="bg-white rounded border p-4">
                <div className="text-sm font-semibold mb-2">{UI_TEXT.app.commentLabel}</div>
                <textarea
                  value={userComment}
                  onChange={(e) => setUserComment(e.target.value)}
                  placeholder={UI_TEXT.app.commentPlaceholder}
                  rows={3}
                  className="w-full border rounded px-3 py-2 text-sm resize-y"
                  disabled={bookingLoading}
                />
              </div>

              {bookingError && (
                <div className="text-xs text-red-600">{bookingError}</div>
              )}

              <div className="bg-white rounded border p-4">
                <div className="text-xs text-gray-500">
                  {UI_TEXT.app.availabilityRefreshes}
                </div>
              </div>

              <button
                className="w-full bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={
                  selectedTable.isAvailable !== true ||
                  selectedTable.seatsAvailable === 0 ||
                  bookingLoading ||
                  (selectedSeatsByTable[selectedTableId] ?? []).length === 0
                }
                onClick={async () => {
                  setBookingError(null);
                  if (!selectedEventId || !selectedTableId || !selectedEvent) return;
                  if (selectedTable.isAvailable !== true) return;
                  const normalizedPhone = userPhone.trim();
                  if (!normalizedPhone) {
                    setBookingError(UI_TEXT.app.addPhoneToContinue);
                    return;
                  }
                  const seats = selectedSeatsByTable[selectedTableId] ?? [];
                  if (seats.length === 0) {
                    setBookingError(UI_TEXT.app.selectAtLeastOneSeat);
                    return;
                  }
                  const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null;
                  if (telegramId == null) {
                    setBookingError('Telegram ID not found');
                    return;
                  }
                  setBookingLoading(true);
                  try {
                    const res = await StorageService.createSeatsBooking({
                      eventId: selectedEventId,
                      tableId: selectedTableId,
                      seatIndices: seats,
                      userPhone: normalizedPhone,
                      telegramId,
                    });
                    const raw = res as Record<string, unknown>;
                    const booking: Booking = {
                      id: String(raw.id ?? ''),
                      eventId: String(raw.event_id ?? raw.eventId ?? ''),
                      userPhone: String(raw.user_phone ?? raw.userPhone ?? normalizedPhone),
                      seatIds: seats.map((idx) => `${selectedTableId}-${idx}`),
                      status: (raw.status as Booking['status']) ?? 'reserved',
                      totalAmount: Number(raw.totalAmount) || 0,
                      createdAt: typeof raw.created_at === 'string' ? new Date(raw.created_at).getTime() : Number(raw.createdAt) || Date.now(),
                      expiresAt: (raw.expires_at ?? raw.expiresAt) as string | number | undefined,
                      tableId: String(raw.table_id ?? raw.tableId ?? selectedTableId),
                      tableBookings: [{ tableId: selectedTableId, seats: seats.length }],
                      event: { id: selectedEvent.id, title: selectedEvent.title, date: selectedEvent.date },
                    };
                    setLastCreatedBooking(booking);
                    setLastCreatedEvent(selectedEvent);
                    setSelectedSeatsByTable((prev) => {
                      const next = { ...prev };
                      delete next[selectedTableId];
                      return next;
                    });
                    setSelectedTableId(null);
                    setSelectedEvent(null);
                    try {
                      const occupied = await StorageService.getOccupiedSeats(selectedEventId);
                      const map: Record<string, Set<number>> = {};
                      for (const row of occupied) {
                        if (row.table_id && Array.isArray(row.seat_indices)) {
                          map[row.table_id] = new Set(row.seat_indices.map(Number));
                        }
                      }
                      setOccupiedMap(map);
                    } catch {}
                    setView('booking-success');
                  } catch (e) {
                    const err = e as Error & { status?: number };
                    if (err.status === 409) {
                      alert('Некоторые места уже заняты. Обновите страницу.');
                      setBookingError('Некоторые места уже заняты. Обновите страницу.');
                    } else {
                      setBookingError(e instanceof Error ? e.message : UI_TEXT.common.errors.default);
                    }
                  } finally {
                    setBookingLoading(false);
                  }
                }}
              >
                {bookingLoading ? UI_TEXT.app.booking : UI_TEXT.app.continueBook}
              </button>
              {bookingLoading && (
                <div className="text-xs text-gray-500 mt-2">{UI_TEXT.app.submitting}</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-600">{UI_TEXT.app.tableNotFound}</div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'booking-success') {
    if (!lastCreatedEvent || !lastCreatedBooking) {
      return wrapWithLayout(
        <div className="max-w-md mx-auto min-h-screen bg-gray-50 p-4">
          <button onClick={() => setView('events')} className="text-sm border rounded px-3 py-2">
            {UI_TEXT.app.backToEvents}
          </button>
        </div>
      );
    }
    return wrapWithLayout(
      <div className="max-w-md mx-auto min-h-screen bg-gray-50">
        <BookingSuccessView
          event={lastCreatedEvent}
          booking={lastCreatedBooking}
          onStatusUpdate={(updated) => setLastCreatedBooking((prev) => (prev ? { ...prev, ...updated } : prev))}
          onBackToEvents={() => {
            setView('events');
            setSelectedEventId(null);
            setSelectedEvent(null);
            setLastCreatedBooking(null);
            setLastCreatedEvent(null);
          }}
        />
      </div>
    );
  }

  if (view === 'my-bookings') {
    return wrapWithLayout(
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
            <div className="text-xs text-gray-500">{UI_TEXT.app.myBookings}</div>
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
          {myBookingsLoading && <div className="text-xs text-gray-500">{UI_TEXT.app.loadingBookings}</div>}
          {myBookingsError && (
            <div className="text-xs text-red-600 mb-3">
              {myBookingsError}
              {(myBookingsError.includes('log in') || myBookingsError.includes('Войдите')) && (
                <div className="mt-2">
                  <button
                    onClick={() => setView('events')}
                    className="text-xs px-2 py-1 rounded border"
                  >
                    {UI_TEXT.app.backToEvents}
                  </button>
                </div>
              )}
            </div>
          )}
          {!myBookingsError && bookingsStale && (
            <div className="text-xs text-gray-500 mb-3">
              {UI_TEXT.app.couldNotRefresh}
            </div>
          )}

          {!myBookingsLoading && !myBookingsError && myBookings.length === 0 && (
            <div className="text-sm text-gray-600">
              {UI_TEXT.app.noBookingsYet}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {myBookings.map((b) => (
              <div key={b.id} className="bg-white p-3 rounded border">
                <div className="text-sm font-semibold">
                  {b.event?.title ? b.event.title : `${UI_TEXT.app.bookingNumber}${b.id}`}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {UI_TEXT.app.status} {UI_TEXT.booking.statusLabels[b.status] ?? b.status ?? '—'}
                </div>
                {b.status === 'reserved' && formatCountdown(b.expiresAt) && (
                  <div className="text-xs text-amber-600">
                    {UI_TEXT.app.expiresIn} {formatCountdown(b.expiresAt)}
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  {UI_TEXT.app.seats} {typeof b.seatsCount === 'number'
                    ? b.seatsCount
                    : Array.isArray(b.seatIds) && b.seatIds.length > 0
                      ? b.seatIds.length
                      : '—'}
                </div>
                <div className="text-xs text-gray-500">{UI_TEXT.app.total} {b.totalAmount ?? '—'}</div>
                {b.status === 'paid' && Array.isArray(b.tickets) && b.tickets.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {b.tickets.map((t) => {
                      const img = t.imageUrl || t.ticketImagePath;
                      if (!img) return null;
                      return (
                        <img
                          key={t.id}
                          src={img}
                          alt={UI_TEXT.app.ticket}
                          className="w-full h-24 object-cover rounded border"
                        />
                      );
                    })}
                  </div>
                )}
                {b.status === 'paid' && (!Array.isArray(b.tickets) || b.tickets.length === 0) && (
                  <div className="text-xs text-gray-600 mt-2">
                    {UI_TEXT.app.ticketsAfterPayment}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return wrapWithLayout(
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">{UI_TEXT.app.appTitle}</h1>
          {isAdmin && (
            <button onClick={() => setView('admin')} className="text-xs px-2 py-1 rounded border">
              {UI_TEXT.app.admin}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600 mb-4">{UI_TEXT.app.publishedEventsList}</p>
        {isAdmin && (
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-600">
            <span>{UI_TEXT.app.adminAccessActive}</span>
            <button onClick={() => setView('admin')} className="text-xs px-2 py-1 rounded border">
              {UI_TEXT.app.openAdmin}
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
              <div>{UI_TEXT.app.debugAdmin}</div>
              <div>{UI_TEXT.app.telegramUserId} {tgUser?.id ?? '—'}</div>
              <div>{UI_TEXT.app.isAdminLabel} {String(isAdmin)}</div>
              <div>{UI_TEXT.app.roleLoginLabel} {authRole ?? '—'}</div>
              <div>{UI_TEXT.app.roleTokenLabel} {tokenRole ?? '—'}</div>
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
            {UI_TEXT.app.user} {tgUser.username || tgUser.first_name || tgUser.id}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={loadEvents}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold"
            disabled={loading}
          >
            {loading ? UI_TEXT.app.loadingEvents : UI_TEXT.app.events}
          </button>
          <button
            onClick={() => setView('my-tickets')}
            className="px-4 py-2 rounded text-sm font-semibold border"
          >
            Мои билеты
          </button>
        </div>

        {error && <div className="text-sm text-red-600 mt-4">{error}</div>}

        <div className="mt-6 space-y-4">
          {loading && (
            <>
              <EventCardSkeleton />
              <EventCardSkeleton />
              <EventCardSkeleton />
            </>
          )}
          {!loading && hasLoaded && publishedEvents.length === 0 && !error && (
            <div className="py-8 text-center">
              <p className="text-base text-gray-600 mb-4">{UI_TEXT.admin.emptyEventsList}</p>
              <p className="text-sm text-gray-500">{UI_TEXT.app.noPublishedEvents}</p>
            </div>
          )}
          {!loading && publishedEvents.map((evt) => (
            <EventCard
              key={evt.id}
              event={evt}
              mode="user"
              onClick={() => handleEventSelect(evt.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;