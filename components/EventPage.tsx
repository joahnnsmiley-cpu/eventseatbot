import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { EventData } from '../types';
import { getPriceForTable } from '../src/utils/getTablePrice';
import { getCategoryColorFromCategory } from '../src/config/categoryColors';
import Card from '../src/ui/Card';
import SectionTitle from '../src/ui/SectionTitle';
import PrimaryButton from '../src/ui/PrimaryButton';
import SeatMap from './SeatMap';
import { UI_TEXT } from '../constants/uiText';

/** Format event_date + event_time as "11 февраля 2026 г. · 01:58" (ru-RU). Returns empty string if either missing. */
function formatEventDateTime(dateStr?: string | null, timeStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string' || !timeStr || typeof timeStr !== 'string') return '';
  const d = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const timePart = String(timeStr).slice(0, 5); // HH:mm
  return `${datePart} · ${timePart}`;
}

export interface EventPageProps {
  event: EventData;
  selectedSeatsByTable: Record<string, number[]>;
  onBack: () => void;
  onRefresh: () => void;
  onTableSelect: (tableId: string) => void;
  onClearSelection?: () => void;
  eventLoading?: boolean;
  eventError?: string | null;
}

const EventPage: React.FC<EventPageProps> = ({
  event,
  selectedSeatsByTable,
  onBack,
  onRefresh,
  onTableSelect,
  onClearSelection,
  eventLoading = false,
  eventError = null,
}) => {
  const imgUrl = event.imageUrl ?? (event as { image_url?: string }).image_url ?? '';
  const eventDate = event.event_date ?? null;
  const eventTime = event.event_time ?? null;
  const venue = event.venue ?? null;
  const displayDateTime = formatEventDateTime(eventDate, eventTime);
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

  const [hasAutoScrolled, setHasAutoScrolled] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  useEffect(() => {
    if (totalSeats === 0) {
      setHasAutoScrolled(false);
      return;
    }
    if (totalSeats > 0 && !hasAutoScrolled) {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth',
      });
      setHasAutoScrolled(true);
    }
  }, [totalSeats, hasAutoScrolled]);

  const handleBooking = useCallback(() => {
    const tableId = Object.keys(selectedSeatsByTable)[0];
    const table = tableId
      ? event.tables?.find((t) => t.id === tableId)
      : event.tables?.find((t) => t.is_active !== false);
    if (table) onTableSelect(table.id);
  }, [selectedSeatsByTable, event.tables, onTableSelect]);

  console.log('EVENT DATA:', event);

  return (
    <div className="max-w-md mx-auto min-h-screen relative">
      <div className="px-4 pt-6 space-y-8">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-xs px-2 py-1 rounded border border-white/20 text-muted-light"
          >
            {UI_TEXT.app.back}
          </button>
          <button onClick={onRefresh} className="text-xs px-2 py-1 rounded border border-white/20 text-muted-light">
            {UI_TEXT.app.refresh}
          </button>
        </div>

        {eventLoading && <div className="text-xs text-muted">{UI_TEXT.app.loadingLayout}</div>}
        {eventError && <div className="text-sm text-red-400">{eventError}</div>}

        <div className="relative rounded-3xl overflow-hidden min-h-[220px]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: imgUrl?.trim() ? `url(${imgUrl.trim()})` : undefined }}
          />
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 flex flex-col justify-end p-6 pb-6 min-h-[220px]">
            <h1 className="text-2xl font-bold text-white">
              {event.title?.trim() || UI_TEXT.event.eventFallback}
            </h1>
            {event.description != null && event.description.trim() !== '' && (
              <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">
                {event.description.trim()}
              </p>
            )}
          </div>
        </div>

        {(showDateTime || showVenue) && (
          <Card>
            <div className="space-y-2 text-sm">
              {showDateTime && (
                <p className="text-[#FFC107] font-semibold">
                  {displayDateTime}
                </p>
              )}
              {showVenue && (
                <p className="text-muted-light">
                  {venue?.trim()}
                </p>
              )}
            </div>
          </Card>
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

        {event?.ticketCategories?.filter((c) => c.isActive).length ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setLegendOpen(!legendOpen)}
              aria-expanded={legendOpen}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/10 transition-all duration-300 text-left"
            >
              <span className="text-sm font-medium text-white">Категории билетов</span>
              <motion.span
                animate={{ rotate: legendOpen ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                className="text-muted shrink-0"
              >
                <ChevronDown size={24} strokeWidth={2} />
              </motion.span>
            </button>
            <AnimatePresence>
              {legendOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden mt-2 space-y-2"
                >
                  {event.ticketCategories
                    .filter((c) => c.isActive)
                    .map((cat) => (
                      <div key={cat.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ background: getCategoryColorFromCategory(cat).base }}
                          />
                          <span className="text-white font-medium">{cat.name}</span>
                        </div>
                        <span className="text-[#FFC107] font-semibold">
                          {cat.price.toLocaleString('ru-RU')} ₽
                        </span>
                      </div>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : null}

        {totalAmount === 0 && (
          <PrimaryButton
            onClick={() => {
              const firstTable = event.tables?.find((t) => t.is_active !== false);
              if (firstTable) onTableSelect(firstTable.id);
            }}
            className="w-full"
          >
            Перейти к бронированию
          </PrimaryButton>
        )}

        {(() => {
          const placeholder = 'eventseatbot_support';
          const raw = event.adminTelegramId ?? placeholder;
          const contactTarget = typeof raw === 'string' ? raw.trim() : '';
          if (!contactTarget) return null;
          const username = contactTarget.replace(/^@/, '');
          const href = /^\d+$/.test(username)
            ? `https://t.me/+${username}`
            : `https://t.me/${username}`;
          return (
            <div className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 space-y-4">
              <div>
                <p className="text-base font-medium text-white">Связаться с организатором</p>
                <p className="text-sm text-muted-light mt-1">{UI_TEXT.event.contactOrganizerPrompt}</p>
              </div>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full border border-neutral-700 text-neutral-300 bg-transparent hover:bg-neutral-800 rounded-xl py-3 text-sm font-medium inline-flex items-center justify-center transition"
              >
                Связаться с организатором
              </a>
            </div>
          );
        })()}

        {totalAmount > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="mt-8 flex items-center justify-between rounded-2xl px-5 py-4"
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
                initial={{ scale: 1.1, opacity: 0.6, textShadow: '0 0 0px rgba(255,193,7,0)' }}
                animate={{ scale: 1, opacity: 1, textShadow: '0 0 12px rgba(255,193,7,0.5)' }}
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
                      <span className="text-white">
                        {item.total.toLocaleString('ru-RU')} ₽
                      </span>
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
    </div>
  );
};

export default EventPage;
