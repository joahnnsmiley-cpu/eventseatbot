import React, { useMemo, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, RefreshCw, Calendar, MapPin } from 'lucide-react';
import type { EventData } from '../types';
import { getPriceForTable } from '../src/utils/getTablePrice';
import { getCategoryColorFromCategory } from '../src/config/categoryColors';
import Card from '../src/ui/Card';
import SectionTitle from '../src/ui/SectionTitle';
import PrimaryButton from '../src/ui/PrimaryButton';
import SeatMap from './SeatMap';
import { formatEventDateTime } from '../src/utils/formatDate';
import { UI_TEXT } from '../constants/uiText';
import * as StorageService from '../services/storageService';
import { useToast } from '../src/ui/ToastContext';

type TgUser = { id?: number; first_name?: string; last_name?: string; username?: string };

export interface EventPageProps {
  event: EventData;
  selectedSeatsByTable: Record<string, number[]>;
  initialMode?: 'preview' | 'seatmap';
  onBack: () => void;
  onRefresh: () => void;
  onTableSelect: (tableId: string) => void;
  onClearSelection?: () => void;
  eventLoading?: boolean;
  eventError?: string | null;
  tgUser?: TgUser | null;
  bookingId?: string;
}

const EventPage: React.FC<EventPageProps> = ({
  event,
  selectedSeatsByTable,
  initialMode = 'preview',
  onBack,
  onRefresh,
  onTableSelect,
  onClearSelection,
  eventLoading = false,
  eventError = null,
  tgUser = null,
  bookingId,
}) => {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'preview' | 'seatmap'>(initialMode);
  const imgUrl = event.imageUrl ?? (event as { image_url?: string }).image_url ?? '';
  const eventDate = event.event_date ?? null;
  const eventTime = event.event_time ?? null;
  const venue = event.venue ?? null;
  const offset = (event as any).timezoneOffsetMinutes ?? 180;
  const displayDateTime = formatEventDateTime(eventDate ?? undefined, eventTime ?? undefined, offset);
  const dateShort = displayDateTime.replace(' · ', ' в ').replace(/ \d{4} г\./, '');
  const showDateTime = Boolean(eventDate && eventTime);
  const showVenue = Boolean(venue && String(venue).trim());

  const totalAmount = useMemo(() => {
    if (!event) return 0;
    return Object.entries(selectedSeatsByTable).reduce((sum, [tableId, seats]) => {
      const table = event.tables?.find((t) => t.id === tableId);
      if (!table) return sum;
      const price = getPriceForTable(event, table, 0);
      return sum + seats.length * price;
    }, 0);
  }, [selectedSeatsByTable, event]);

  const totalSeats = useMemo(
    () => Object.values(selectedSeatsByTable).reduce((n, arr) => n + arr.length, 0),
    [selectedSeatsByTable]
  );

  const totalSeatsAvailable = useMemo(() => {
    if (!event) return 0;
    return event.tables?.reduce((sum, t) => sum + (t.seatsAvailable ?? 0), 0) ?? 0;
  }, [event]);

  const breakdown = useMemo(() => {
    if (!event) return [];
    return Object.entries(selectedSeatsByTable)
      .map(([tableId, seats]) => {
        const table = event.tables?.find((t) => t.id === tableId);
        if (!table || seats.length === 0) return null;
        const price = getPriceForTable(event, table, 0);
        return {
          tableId,
          tableNumber: table.number,
          count: seats.length,
          price,
          total: seats.length * price,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [selectedSeatsByTable, event]);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactProblemText, setContactProblemText] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const handleBooking = useCallback(() => {
    const tableId = Object.keys(selectedSeatsByTable)[0];
    const table = tableId
      ? event.tables?.find((t) => t.id === tableId)
      : event.tables?.find((t) => t.is_active !== false);
    if (table) onTableSelect(table.id);
  }, [selectedSeatsByTable, event.tables, onTableSelect]);

  const handleContactSubmit = useCallback(async () => {
    const text = contactProblemText.trim();
    if (!text) return;
    setContactSubmitting(true);
    setContactError(null);
    try {
      await StorageService.contactOrganizer({
        eventId: event.id,
        problemText: text,
        bookingId,
        userTelegramId: typeof tgUser?.id === 'number' ? tgUser.id : undefined,
        userFirstName: tgUser?.first_name,
        userLastName: tgUser?.last_name,
        userUsername: tgUser?.username,
      });
      setContactModalOpen(false);
      setContactProblemText('');
      showToast(UI_TEXT.event.contactOrganizerSuccess);
    } catch (e) {
      setContactError(UI_TEXT.event.contactOrganizerError);
    } finally {
      setContactSubmitting(false);
    }
  }, [contactProblemText, event.id, bookingId, tgUser, showToast]);

  const categories = event?.ticketCategories?.filter((c) => c.isActive) ?? [];

  // ─── PREVIEW MODE (Premium black luxury) ──────────────────────────────────
  if (mode === 'preview') {
    return (
      <div className="event-details-premium min-h-full relative overflow-hidden">
        {/* Animated purple gradient background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 85% 15%, rgba(88,28,135,0.15) 0%, transparent 60%)',
            animation: 'event-details-bg-pulse 8s ease-in-out infinite',
          }}
        />
        <div className="absolute inset-0 bg-[#0a0a0a]" style={{ zIndex: -1 }} />

        <div className="relative">
          <div className="flex items-center justify-between h-12 px-4 pt-2 absolute top-0 left-0 right-0 z-20">
            <button
              onClick={onBack}
              className="text-[15px] text-white/60 hover:text-white transition"
            >
              {UI_TEXT.app.back}
            </button>
            <button
              onClick={onRefresh}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/5 transition"
              aria-label={UI_TEXT.app.refresh}
            >
              <RefreshCw size={18} strokeWidth={2} />
            </button>
          </div>

          {eventLoading && <div className="text-xs text-muted py-4 px-4">{UI_TEXT.app.loadingLayout}</div>}
          {eventError && <div className="text-sm text-red-400 py-4 px-4">{eventError}</div>}

          {!eventLoading && !eventError && (
            <>
              {/* Hero — full width, edge-to-edge, no radius */}
              <div className="relative -mx-4 w-[calc(100%+2rem)]">
                {/* Ambient light behind hero */}
                <div
                  className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-[120%] h-32 pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(88,28,135,0.25) 0%, transparent 70%)',
                    filter: 'blur(24px)',
                  }}
                />
                <div className="relative aspect-[4/5] max-h-[55vh] overflow-hidden">
                  {imgUrl?.trim() ? (
                    <img
                      src={imgUrl.trim()}
                      alt=""
                      className="w-full h-full object-cover object-top block"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/5" />
                  )}
                  {/* Bottom dark gradient overlay */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(180deg, transparent 0%, transparent 40%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.7) 100%)',
                    }}
                  />
                </div>
              </div>

              <div className="px-4 -mt-8 relative z-10 space-y-4">
                <motion.h1
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="font-luxury-event-title text-5xl sm:text-6xl font-bold uppercase leading-tight text-center tracking-tight"
                >
                  {event.title?.trim() || UI_TEXT.event.eventFallback}
                </motion.h1>

                {showDateTime && (
                  <p className="text-center text-white/60 text-sm sm:text-base">
                    {dateShort}
                  </p>
                )}

                {event.description != null && event.description.trim() !== '' && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                  >
                    <p className="text-[14px] text-white/85 leading-snug line-clamp-2">
                      {event.description.trim()}
                    </p>
                  </motion.div>
                )}

                <button
                  type="button"
                  onClick={() => setMode('seatmap')}
                  className="event-details-cta w-full py-4 text-base font-semibold text-black rounded-xl transition-all hover:opacity-95 active:scale-[0.98]"
                >
                  Купить билеты
                </button>

                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 py-4 pb-24 text-sm">
                  {showDateTime && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Calendar size={16} strokeWidth={2} />
                      <span>{dateShort}</span>
                    </div>
                  )}
                  {showVenue && (
                    <div className="flex items-center gap-2 text-white/70">
                      <MapPin size={16} strokeWidth={2} />
                      <span>{venue?.trim()}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── SEATMAP MODE (legend top, layout, contact below) ─────────────────────
  return (
    <div className="max-w-md mx-auto h-full relative">
      <div className="px-4 pt-4 pb-2 space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMode('preview')}
            className="text-sm text-muted-light hover:text-white transition -ml-1"
          >
            {UI_TEXT.app.back}
          </button>
          <button
            onClick={onRefresh}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#C6A75E]/70 hover:text-[#C6A75E] hover:bg-white/5 transition"
            aria-label={UI_TEXT.app.refresh}
          >
            <RefreshCw size={16} strokeWidth={2} />
          </button>
        </div>

        {eventLoading && <div className="text-xs text-muted">{UI_TEXT.app.loadingLayout}</div>}
        {eventError && <div className="text-sm text-red-400">{eventError}</div>}

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: `${getCategoryColorFromCategory(cat).base}22` }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: getCategoryColorFromCategory(cat).base }}
                />
                <span className="text-sm font-medium text-white">{cat.name}</span>
                <span className="text-sm font-semibold text-[#C6A75E]">
                  {cat.price.toLocaleString('ru-RU')} ₽
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="relative w-full -mx-4">
          <SectionTitle title="Выбор столов" className="px-4" />
          <SeatMap
            key={`seatmap-${event?.id}-${(event?.tables ?? []).map((t) => t.id).join('-')}`}
            event={event}
            tables={event?.tables ?? []}
            selectedSeatsByTable={selectedSeatsByTable}
            onTableSelect={onTableSelect}
          />
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-white/5 space-y-3">
          <p className="text-base font-medium text-white">{UI_TEXT.event.contactOrganizer}</p>
          <p className="text-sm text-muted-light">{UI_TEXT.event.contactOrganizerPrompt}</p>
          <button
            type="button"
            onClick={() => setContactModalOpen(true)}
            className="w-full border border-[#C6A75E]/40 text-[#C6A75E] bg-transparent hover:bg-[#C6A75E]/10 rounded-xl py-3 text-sm font-medium inline-flex items-center justify-center transition"
          >
            {UI_TEXT.event.contactOrganizer}
          </button>
        </div>

        {totalAmount > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{
              background: 'rgba(20,20,20,0.95)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted tracking-wide">
                Выбрано {totalSeats} из {totalSeatsAvailable}
              </p>
              <motion.p
                key={totalAmount}
                initial={{ scale: 1.1, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="text-xl font-bold text-[#FFC107]"
              >
                {totalAmount.toLocaleString('ru-RU')} ₽
              </motion.p>
              {breakdown.length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-muted">
                  {breakdown.map((item) => (
                    <div key={item.tableId} className="flex justify-between">
                      <span>
                        Стол {item.tableNumber} — {item.count} × {item.price.toLocaleString('ru-RU')} ₽
                      </span>
                      <span className="text-white">{item.total.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  ))}
                </div>
              )}
              {onClearSelection && (
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="mt-2 text-xs text-muted hover:text-white transition"
                >
                  Очистить выбор
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleBooking}
              className="bg-[#FFC107] text-black font-semibold px-5 py-2 rounded-xl active:scale-95 transition shrink-0 ml-4"
            >
              Продолжить
            </button>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {contactModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            onClick={() => !contactSubmitting && setContactModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 space-y-4"
            >
              <h3 className="text-lg font-semibold text-white">{UI_TEXT.event.contactOrganizer}</h3>
              <p className="text-sm text-muted-light">{UI_TEXT.event.contactOrganizerDescribeProblem}</p>
              <textarea
                value={contactProblemText}
                onChange={(e) => setContactProblemText(e.target.value)}
                placeholder={UI_TEXT.event.contactOrganizerDescribePlaceholder}
                rows={4}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-[#C6A75E]/50"
                disabled={contactSubmitting}
              />
              {contactError && <p className="text-sm text-red-400">{contactError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => !contactSubmitting && setContactModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-white/20 text-muted-light hover:bg-white/5 transition"
                >
                  {UI_TEXT.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleContactSubmit}
                  disabled={!contactProblemText.trim() || contactSubmitting}
                  className="flex-1 py-3 rounded-xl bg-[#C6A75E] text-black font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {contactSubmitting ? '…' : UI_TEXT.event.contactOrganizerSend}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EventPage;
