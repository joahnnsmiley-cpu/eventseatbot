import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as StorageService from './services/storageService';
import AdminPanel from './components/AdminPanel';
import AuthService from './services/authService';
import SeatMap from './components/SeatMap';
import SeatPicker from './components/SeatPicker';
import BookingSuccessView from './components/BookingSuccessView';
import EventPage from './components/EventPage';
import MyTicketsPage from './components/MyTicketsPage';
import AppLayout from './src/layout/AppLayout';
import BottomNav, { type BottomNavTab } from './src/layout/BottomNav';
import Card from './src/ui/Card';
import SectionTitle from './src/ui/SectionTitle';
import PrimaryButton from './src/ui/PrimaryButton';
import type { Booking, EventData, Table } from './types';
import { getPriceForTable } from './src/utils/getTablePrice';
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

function formatEventDate(dateStr?: string): { day: number; date: string; time: string } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
  const time = hasTime ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
  return { day, date, time };
}

const getEventDisplayDate = (event: EventData): { day: number; date: string; time: string } | null => {
  if (event.event_date) {
    const dateObj = new Date(event.event_date);
    const day = dateObj.getDate();
    const date = dateObj.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const time = event.event_time ? event.event_time.slice(0, 5) : '';
    return { day, date, time };
  }
  return formatEventDate(event.date);
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
  const [featuredEvent, setFeaturedEvent] = useState<EventData | null>(null);
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
    const syncFromRoute = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname || '/';

      if (hash === '#/my-tickets') {
        setView('my-tickets');
        return;
      }

      const eventMatch =
        hash.match(/^#\/event\/([a-zA-Z0-9_-]+)$/) ||
        pathname.match(/^\/event\/([a-zA-Z0-9_-]+)$/);
      if (eventMatch) {
        const eventId = eventMatch[1];
        setSelectedEventId(eventId);
        setView('layout');
        loadEvent(eventId);
      }
    };
    syncFromRoute();
    window.addEventListener('hashchange', syncFromRoute);
    window.addEventListener('popstate', syncFromRoute);
    return () => {
      window.removeEventListener('hashchange', syncFromRoute);
      window.removeEventListener('popstate', syncFromRoute);
    };
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
      const { featured, events: evts } = await StorageService.getEvents();
      setFeaturedEvent(featured ?? null);
      setEvents(evts ?? []);
      setHasLoaded(true);
    } catch (e) {
      setError(UI_TEXT.common.errors.loadEventsFailed);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'events') void loadEvents();
  }, [view]);

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
      console.log('[USER EVENT FETCH TABLES]', ev.tables);
      console.log('[USER EVENT FETCH RAW]', ev);
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

  const hasAnyEvents = featuredEvent != null || events.length > 0;

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
    if (!selectedEvent) {
      return wrapWithLayout(
        <div className="max-w-md mx-auto min-h-screen relative">
          <div className="px-4 pt-6 space-y-8">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setView('events');
                  setSelectedTableId(null);
                  setSelectedEventId(null);
                  setSelectedEvent(null);
                }}
                className="text-xs px-2 py-1 rounded border border-white/20 text-muted-light"
              >
                {UI_TEXT.app.back}
              </button>
              <button onClick={() => selectedEventId && loadEvent(selectedEventId)} className="text-xs px-2 py-1 rounded border border-white/20 text-muted-light">
                {UI_TEXT.app.refresh}
              </button>
            </div>
            {eventLoading && <div className="text-xs text-muted">{UI_TEXT.app.loadingLayout}</div>}
            {eventError && <div className="text-sm text-red-400">{eventError}</div>}
            <div className="text-xs text-muted">{UI_TEXT.app.loadingEvent}</div>
          </div>
        </div>
      );
    }
    return wrapWithLayout(
      <EventPage
        event={selectedEvent}
        selectedSeatsByTable={selectedSeatsByTable}
        onClearSelection={() => setSelectedSeatsByTable({})}
        onBack={() => {
          setView('events');
          setSelectedTableId(null);
          setSelectedEventId(null);
          setSelectedEvent(null);
        }}
        onRefresh={() => selectedEventId && loadEvent(selectedEventId)}
        onTableSelect={(tableId) => {
          setSelectedTableId(tableId);
          setView('seats');
          if (selectedEventId) loadEvent(selectedEventId, true);
        }}
        eventLoading={eventLoading}
        eventError={eventError}
      />
    );
  }

  if (view === 'seats' && (!selectedEvent || !selectedTableId || !selectedTable)) {
    return wrapWithLayout(
      <div className="max-w-md mx-auto min-h-screen bg-surface shadow-2xl relative">
        <div className="p-4">
          <div className="text-xs text-muted">{UI_TEXT.app.returningToLayout}</div>
        </div>
      </div>
    );
  }

  if (view === 'seats' && selectedEvent) {
    return wrapWithLayout(
      <div className="max-w-[420px] mx-auto overflow-x-hidden bg-black min-h-screen">
        <div className="px-4 pt-6 space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setView('layout');
                setSelectedTableId(null);
                if (selectedEventId) loadEvent(selectedEventId, true);
              }}
              disabled={bookingLoading}
              className="text-xs px-2 py-1 rounded border border-white/20 text-muted-light"
            >
              {UI_TEXT.app.back}
            </button>
            <div className="text-xs text-muted-light">{selectedEvent.title || UI_TEXT.app.event}</div>
            <button
              onClick={() => selectedEventId && loadEvent(selectedEventId)}
              disabled={bookingLoading}
              className="text-xs px-2 py-1 rounded border border-white/20 text-muted-light"
            >
              {UI_TEXT.app.refresh}
            </button>
          </div>

          {eventLoading && <div className="text-xs text-muted">{UI_TEXT.app.loadingSeats}</div>}
          {eventError && <div className="text-sm text-red-400 mb-3">{eventError}</div>}

          {selectedTable ? (
            <div className="space-y-6">
              <Card>
                <div className="text-sm font-semibold text-white">{UI_TEXT.tables.table} {selectedTable.number}</div>
                <div className="text-xs text-muted-light mt-1">
                  {UI_TEXT.app.freeSeats} {selectedTable.seatsAvailable} / {selectedTable.seatsTotal}
                </div>
                {selectedTable.isAvailable !== true && (
                  <div className="text-xs text-amber-400 mt-2">
                    {UI_TEXT.app.tableNotAvailableForSale}
                  </div>
                )}
              </Card>

              <Card>
                <div className="text-sm font-semibold text-white mb-2">{UI_TEXT.app.selectSeats}</div>
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
              </Card>

              <Card>
                <div className="text-sm uppercase tracking-widest text-muted-light">
                  {UI_TEXT.app.numberOfSeats}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded border border-white/20 text-white text-sm"
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
                    className="w-20 text-center border border-white/20 rounded px-2 py-2 text-sm bg-[#111] text-white"
                    tabIndex={-1}
                    aria-label={UI_TEXT.app.selectedSeatCount}
                  />
                  <button
                    type="button"
                    className="px-3 py-2 rounded border border-white/20 text-white text-sm"
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
                  <span className="text-xs text-muted-light">/ {selectedTable.seatsTotal}</span>
                </div>
                {selectedTable.seatsAvailable === 0 && (
                  <div className="text-xs text-muted-light mt-2">
                    {UI_TEXT.app.tableFullyBooked}
                  </div>
                )}
                {selectionAdjusted && (
                  <div className="text-xs text-amber-400 mt-2">
                    {UI_TEXT.app.selectionAdjusted}
                  </div>
                )}
              </Card>

              <Card>
                <div className="text-sm font-semibold text-white mb-2">{UI_TEXT.app.contactPhone} <span className="text-red-400">*</span></div>
                <input
                  type="tel"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder={UI_TEXT.app.phonePlaceholder}
                  className="w-full border border-white/20 rounded-xl px-3 py-2 text-sm bg-[#111] text-white placeholder-gray-500"
                  disabled={bookingLoading}
                />
              </Card>

              <Card>
                <div className="text-sm font-semibold text-white mb-2">{UI_TEXT.app.commentLabel}</div>
                <textarea
                  value={userComment}
                  onChange={(e) => setUserComment(e.target.value)}
                  placeholder={UI_TEXT.app.commentPlaceholder}
                  rows={3}
                  className="w-full border border-white/20 rounded-xl px-3 py-2 text-sm resize-y bg-[#111] text-white placeholder-gray-500"
                  disabled={bookingLoading}
                />
              </Card>

              {bookingError && (
                <div className="text-sm text-red-400">{bookingError}</div>
              )}

              {(() => {
                const seatCount = (selectedSeatsByTable[selectedTableId!] ?? []).length;
                const seatPriceFallback = selectedEvent?.ticketCategories?.find((c) => c.isActive)?.price ?? 0;
                const price = getPriceForTable(selectedEvent, selectedTable, seatPriceFallback);
                const total = seatCount * price;
                return seatCount > 0 ? (
                  <Card>
                    <div className="text-sm font-semibold text-white">
                      {UI_TEXT.app.total} {total.toLocaleString('ru-RU')} ₽
                    </div>
                    <div className="text-xs text-muted-light mt-1">
                      {seatCount} × {price.toLocaleString('ru-RU')} ₽
                    </div>
                  </Card>
                ) : null;
              })()}

              <Card>
                <div className="text-xs text-muted-light">
                  {UI_TEXT.app.availabilityRefreshes}
                </div>
              </Card>

              <PrimaryButton
                className="w-full disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={
                  selectedTable.isAvailable !== true ||
                  selectedTable.seatsAvailable === 0 ||
                  bookingLoading ||
                  (selectedSeatsByTable[selectedTableId] ?? []).length === 0
                }
                onClick={async () => {
                  console.log('[CONFIRM CLICKED]');
                  setBookingError(null);
                  const seats = selectedSeatsByTable[selectedTableId] ?? [];
                  console.log('[BOOKING CHECK]', {
                    selectedEventId,
                    selectedTableId,
                    selectedTable: !!selectedTable,
                    eventId: selectedEvent?.id,
                    seatsLength: seats.length,
                  });
                  if (!selectedEventId || !selectedTableId || !selectedEvent) return;
                  if (selectedTable.isAvailable !== true) return;
                  const normalizedPhone = userPhone.trim();
                  if (!normalizedPhone) {
                    setBookingError(UI_TEXT.app.addPhoneToContinue);
                    return;
                  }
                  if (seats.length === 0) {
                    setBookingError(UI_TEXT.app.selectAtLeastOneSeat);
                    return;
                  }
                  const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null;
                  if (telegramId == null) {
                    setBookingError('Telegram ID not found');
                    return;
                  }
                  console.log('[BOOKING FUNCTION START]');
                  setBookingLoading(true);
                  try {
                    const seatPriceFallback = selectedEvent?.ticketCategories?.find((c) => c.isActive)?.price ?? 0;
                    const price = getPriceForTable(selectedEvent, selectedTable, seatPriceFallback);
                    const total = seats.length * price;
                    const res = await StorageService.createSeatsBooking({
                      eventId: selectedEventId,
                      tableId: selectedTableId,
                      seatIndices: seats,
                      userPhone: normalizedPhone,
                      telegramId,
                      totalAmount: total,
                      userComment: userComment.trim() || undefined,
                    });
                    const raw = res as Record<string, unknown>;
                    const booking: Booking = {
                      id: String(raw.id ?? ''),
                      eventId: String(raw.event_id ?? raw.eventId ?? ''),
                      userPhone: String(raw.user_phone ?? raw.userPhone ?? normalizedPhone),
                      seatIds: seats.map((idx) => `${selectedTableId}-${idx}`),
                      status: (raw.status as Booking['status']) ?? 'reserved',
                      totalAmount: Number(raw.totalAmount) || total,
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
              </PrimaryButton>
              {bookingLoading && (
                <div className="text-xs text-muted-light mt-2">{UI_TEXT.app.submitting}</div>
              )}
            </div>
          ) : (
            <Card>
              <div className="text-sm text-muted-light">{UI_TEXT.app.tableNotFound}</div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (view === 'booking-success') {
    if (!lastCreatedEvent || !lastCreatedBooking) {
      return wrapWithLayout(
        <div className="max-w-md mx-auto min-h-screen p-4">
          <button onClick={() => setView('events')} className="text-sm border border-white/20 rounded px-3 py-2 text-muted-light">
            {UI_TEXT.app.backToEvents}
          </button>
        </div>
      );
    }
    return wrapWithLayout(
      <div className="max-w-md mx-auto min-h-screen">
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
          onGoToTickets={() => {
            setView('my-tickets');
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
      <div className="max-w-md mx-auto min-h-screen bg-surface shadow-2xl relative">
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
            <div className="text-xs text-muted">{UI_TEXT.app.myBookings}</div>
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
          {myBookingsLoading && <div className="text-xs text-muted">{UI_TEXT.app.loadingBookings}</div>}
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
            <div className="text-xs text-muted mb-3">
              {UI_TEXT.app.couldNotRefresh}
            </div>
          )}

          {!myBookingsLoading && !myBookingsError && myBookings.length === 0 && (
            <div className="text-sm text-muted">
              {UI_TEXT.app.noBookingsYet}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {myBookings.map((b) => (
              <div key={b.id} className="bg-card p-3 rounded border">
                <div className="text-sm font-semibold">
                  {b.event?.title ? b.event.title : `${UI_TEXT.app.bookingNumber}${b.id}`}
                </div>
                <div className="text-xs text-muted mt-1">
                  {UI_TEXT.app.status} {UI_TEXT.booking.statusLabels[b.status] ?? b.status ?? '—'}
                </div>
                {b.status === 'reserved' && formatCountdown(b.expiresAt) && (
                  <div className="text-xs text-amber-600">
                    {UI_TEXT.app.expiresIn} {formatCountdown(b.expiresAt)}
                  </div>
                )}
                <div className="text-xs text-muted">
                  {UI_TEXT.app.seats} {typeof b.seatsCount === 'number'
                    ? b.seatsCount
                    : Array.isArray(b.seatIds) && b.seatIds.length > 0
                      ? b.seatIds.length
                      : '—'}
                </div>
                <div className="text-xs text-muted">{UI_TEXT.app.total} {b.totalAmount ?? '—'}</div>
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
                  <div className="text-xs text-muted mt-2">
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
    <div className="max-w-md mx-auto min-h-screen relative">
      <motion.div
        className="px-4 pt-8 space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="relative w-full text-center pt-10 pb-6 space-y-4 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <span className="text-[90px] sm:text-[140px] font-extrabold text-white opacity-[0.03] tracking-tight">
              #НИКТО
            </span>
          </div>
          <div className="relative z-10 space-y-4">
            <h1 className="text-[34px] sm:text-[48px] font-extrabold tracking-tight text-white">
              #НИКТОНЕКРУЧЕ
            </h1>
            <div className="w-16 h-[2px] bg-[#FFC107] mx-auto" />
            <p className="text-[#FFC107] text-sm tracking-[6px] uppercase">
              КАССА
            </p>
            <p className="text-muted-light text-sm">
              Выберите ваше эксклюзивное событие
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setView('admin')}
              className="absolute top-4 right-0 z-10 text-xs uppercase tracking-widest text-[#FFC107] opacity-70 hover:opacity-100 transition"
            >
              АДМИНКА
            </button>
          )}
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}

        <div className="space-y-6">
          {loading && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[#0b0b0b] border border-white/10 p-8 h-40 animate-pulse" />
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#111] h-20 animate-pulse" />
              <div className="rounded-xl overflow-hidden border border-white/10 bg-[#111] h-20 animate-pulse" />
            </div>
          )}
          {!loading && hasLoaded && !hasAnyEvents && !error && (
            <div className="py-8 text-center">
              <p className="text-base text-muted-light mb-2">{UI_TEXT.admin.emptyEventsList}</p>
              <p className="text-sm text-muted">{UI_TEXT.app.noPublishedEvents}</p>
            </div>
          )}
          {!loading && hasAnyEvents && (() => {
            const featured = featuredEvent;
            const fmt = featured ? getEventDisplayDate(featured) : null;
            return (
              <>
                {featured && (
                  <div>
                    <p className="text-[#C6A75E] text-xs font-bold tracking-widest uppercase mb-2">
                      ГЛАВНОЕ СОБЫТИЕ
                    </p>
                    <div className="relative min-h-[320px]">
                      <motion.div
                        className="relative rounded-3xl overflow-hidden border-2 border-[#C6A75E]/40 shadow-[0_0_40px_rgba(198,167,94,0.25)]"
                        role="button"
                        tabIndex={0}
                        onClick={() => handleEventSelect(featured.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleEventSelect(featured.id)}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div
                          className="absolute inset-0 bg-center bg-cover"
                          style={{
                            backgroundImage: (featured?.imageUrl || (featured as { image_url?: string })?.image_url)?.trim()
                              ? `url(${(featured?.imageUrl || (featured as { image_url?: string })?.image_url)?.trim()})`
                              : undefined,
                            filter: 'brightness(1.25) contrast(1.12) saturate(1.1)',
                            transform: 'scale(1.05)',
                          }}
                        />
                        <div
                          className="absolute inset-0"
                          style={{
                            backdropFilter: 'blur(4px)',
                            background: 'radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.65) 100%)',
                          }}
                        />
                        <div
                          className="absolute z-[5] pointer-events-none"
                          style={{
                            width: '260px',
                            height: '260px',
                            background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                          }}
                        />
                        <div className="relative z-10 flex flex-col items-center justify-center text-center py-16 px-6 space-y-4">
                          <h2 className="text-3xl md:text-4xl font-extrabold uppercase tracking-wide text-white">
                            {featured?.title ?? UI_TEXT.event.eventFallback}
                          </h2>
                          <p className="text-[#FFC107] text-2xl font-bold tracking-wide">
                            {fmt?.date ?? featured?.date}
                          </p>
                          <p className="text-white text-lg">
                            {fmt?.time ?? ''}
                          </p>
                          <p className="text-muted-light text-sm uppercase tracking-widest">
                            {(featured as { venue?: string })?.venue ?? ''}
                          </p>
                        </div>
                      </motion.div>
                    </div>
                  </div>
                )}

                {events.length > 0 && (
                  <div>
                    <p className="text-muted text-xs tracking-widest uppercase mb-2">
                      ВСЕ СОБЫТИЯ
                    </p>
                    <div className="space-y-3">
                      {events.map((evt) => {
                        const evtFmt = getEventDisplayDate(evt);
                        return (
                          <motion.div
                            key={evt.id}
                            className="flex rounded-xl overflow-hidden border border-white/10 bg-[#111]"
                            role="button"
                            tabIndex={0}
                            onClick={() => handleEventSelect(evt.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleEventSelect(evt.id)}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            transition={{ duration: 0.2 }}
                          >
                            <div className="w-[70px] shrink-0 bg-[#FFC107] text-black flex flex-col items-center justify-center font-bold">
                              {evtFmt ? evtFmt.day : '—'}
                            </div>
                            <div className="flex-1 p-4 flex items-center justify-between">
                              <div>
                                <p className="font-bold text-white">{evt.title?.trim() || UI_TEXT.event.eventFallback}</p>
                                <p className="text-muted-light text-sm">Площадка</p>
                              </div>
                              <svg className="w-5 h-5 text-muted shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </motion.div>
    </div>
  );
}

export default App;