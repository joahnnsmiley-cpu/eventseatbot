import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
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
      return sum + (seats as number[]).length * price;
    }, 0);
  }, [selectedSeatsByTable, event]);

  const totalSeats = useMemo(
    () => Object.values(selectedSeatsByTable).reduce((n: number, arr: any) => n + (arr as number[]).length, 0),
    [selectedSeatsByTable]
  );

  const selectedTablesTotalSeats = useMemo(() => {
    if (!event || !event.tables) return 0;
    const selectedTableIds = Object.keys(selectedSeatsByTable);
    return selectedTableIds.reduce((sum, tid) => {
      const tb = event.tables!.find(t => t.id === tid);
      return sum + (tb?.seatsTotal ?? tb?.seatsAvailable ?? 0);
    }, 0);
  }, [selectedSeatsByTable, event]);

  const breakdown = useMemo(() => {
    if (!event) return [];
    return Object.entries(selectedSeatsByTable)
      .map(([tableId, seats]) => {
        const table = event.tables?.find((t) => t.id === tableId);
        if (!table || (seats as number[]).length === 0) return null;
        const price = getPriceForTable(event, table, 0);
        return {
          tableId,
          tableNumber: table.number,
          count: (seats as number[]).length,
          price,
          total: (seats as number[]).length * price,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [selectedSeatsByTable, event]);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactProblemText, setContactProblemText] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const heroImgRef = useRef<HTMLImageElement>(null);

  // Subtle hero parallax: translate img only, scroll-based, disabled on small screens
  useEffect(() => {
    const scrollEl = document.querySelector('[data-app-scroll]');
    if (!scrollEl || typeof window === 'undefined') return;
    let rafId: number;
    const onScroll = () => {
      rafId = requestAnimationFrame(() => {
        if (window.innerWidth < 768 || !heroImgRef.current) return;
        const scrollY = (scrollEl as HTMLElement).scrollTop;
        const move = Math.min(scrollY * 0.15, 40);
        heroImgRef.current.style.transform = `translateY(${move}px)`;
      });
    };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
      if (heroImgRef.current) heroImgRef.current.style.transform = '';
    };
  }, []);

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

  if (mode === 'preview') {
    return (
      <div className="event-details-premium relative w-full overflow-hidden -mx-4" style={{ minHeight: '100dvh', width: 'calc(100% + 2rem)', background: '#080808' }}>

        {/* ── Full-bleed hero ── */}
        <div className="absolute inset-0">
          {imgUrl?.trim() ? (
            <>
              {/* Blurred ambient background */}
              <div
                className="absolute inset-0 bg-cover bg-center scale-110"
                style={{ backgroundImage: `url(${imgUrl.trim()})`, filter: 'blur(40px) brightness(0.35)', transform: 'scale(1.15)' }}
              />
              {/* Sharp poster — object-cover so it fills the screen nicely */}
              <img
                ref={heroImgRef}
                src={imgUrl.trim()}
                alt=""
                className="absolute inset-0 w-full h-full z-10 will-change-transform"
                style={{ objectFit: 'cover', objectPosition: 'top center' }}
              />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-purple-950/40 to-black" />
          )}
          {/* Strong gradient vignette — fade to black toward bottom */}
          <div
            className="absolute inset-0 z-20 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.8) 68%, rgba(0,0,0,0.97) 82%, #080808 100%)',
            }}
          />
        </div>

        {/* ── Floating top nav ── */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-3 pb-2">
          <motion.button
            type="button"
            onClick={onBack}
            whileTap={{ scale: 0.93 }}
            className="flex items-center gap-1.5 text-sm font-medium text-white/80 hover:text-white transition"
            style={{
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              padding: '6px 14px',
            }}
          >
            ← {UI_TEXT.app.back}
          </motion.button>
          <motion.button
            type="button"
            onClick={onRefresh}
            whileTap={{ scale: 0.93 }}
            aria-label={UI_TEXT.app.refresh}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white transition"
            style={{
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <RefreshCw size={16} strokeWidth={2} />
          </motion.button>
        </div>

        {/* ── Info panel — pinned to bottom over the gradient ── */}
        <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-8 space-y-4">
          {eventLoading && <div className="text-xs text-white/40">{UI_TEXT.app.loadingLayout}</div>}
          {eventError && <div className="text-xs text-red-400">{eventError}</div>}

          {!eventLoading && !eventError && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-3"
            >
              {/* Title */}
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-white">
                {event.title?.trim() || UI_TEXT.event.eventFallback}
              </h1>

              {/* Date + venue pills in one row */}
              {(showDateTime || showVenue) && (
                <div className="flex flex-wrap gap-2">
                  {showDateTime && (
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 rounded-full px-3 py-1.5"
                      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                    >
                      <Calendar size={11} strokeWidth={2.5} />
                      {dateShort}
                    </span>
                  )}
                  {showVenue && (
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 rounded-full px-3 py-1.5"
                      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                    >
                      <MapPin size={11} strokeWidth={2.5} />
                      {venue?.trim()}
                    </span>
                  )}
                </div>
              )}

              {/* Description — collapsible */}
              {event.description?.trim() && (() => {
                const desc = event.description.trim();
                const isLong = desc.length > 150 || desc.split(/\n/).length > 2;
                return (
                  <div>
                    <p
                      className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap break-words"
                      style={isLong && !descriptionExpanded ? {
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      } : undefined}
                    >
                      {desc}
                    </p>
                    {isLong && !descriptionExpanded && (
                      <button
                        type="button"
                        onClick={() => setDescriptionExpanded(true)}
                        className="text-xs font-semibold mt-1"
                        style={{ color: '#D4AF37', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        Читать далее
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Ticket categories */}
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <span
                      key={cat.id}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5"
                      style={{
                        background: `${getCategoryColorFromCategory(cat).base}1A`,
                        border: `1px solid ${getCategoryColorFromCategory(cat).base}40`,
                        color: getCategoryColorFromCategory(cat).base,
                      }}
                    >
                      <span
                        style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: getCategoryColorFromCategory(cat).base,
                          flexShrink: 0,
                          display: 'inline-block',
                        }}
                      />
                      {cat.name} · {cat.price.toLocaleString('ru-RU')} ₽
                    </span>
                  ))}
                </div>
              )}

              {/* CTA */}
              <motion.button
                type="button"
                onClick={() => setMode('seatmap')}
                whileTap={{ scale: 0.97 }}
                className="w-full py-4 rounded-2xl text-base font-semibold text-black transition-all"
                style={{
                  background: 'linear-gradient(135deg, #D4AF37 0%, #F5D76E 50%, #C9A227 100%)',
                  boxShadow: '0 4px 28px rgba(212,175,55,0.35)',
                  letterSpacing: '0.01em',
                }}
              >
                Выбрать место
              </motion.button>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  // ─── SEATMAP MODE (legend top, layout, contact below) ─────────────────────
  return (
    <div className="max-w-md mx-auto min-h-screen relative flex flex-col w-full">
      <div className="px-4 pt-4 pb-2 space-y-4 flex-1 flex flex-col w-full">
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
            className="flex items-center justify-between rounded-2xl px-5 py-4"
            style={{
              background: 'linear-gradient(135deg, rgba(28,28,30,0.65) 0%, rgba(18,18,20,0.85) 100%)',
              border: '1px solid rgba(198, 167, 94, 0.25)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted tracking-wide">
                Выбрано {totalSeats} из {selectedTablesTotalSeats}
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
              className="lux-button font-semibold px-5 py-2 shrink-0 ml-4 whitespace-nowrap"
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
