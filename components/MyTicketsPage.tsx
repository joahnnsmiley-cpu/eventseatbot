import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as StorageService from '../services/storageService';
import NeonTicketCard from '../src/ui/NeonTicketCard';
import TicketModal from '../src/ui/TicketModal';
import Card from '../src/ui/Card';
import SectionTitle from '../src/ui/SectionTitle';
import PrimaryButton from '../src/ui/PrimaryButton';
import { getEventDisplayParts, getEventDisplayPartsFromIso } from '../src/utils/formatDate';
import { RefreshCw } from 'lucide-react';
import { UI_TEXT } from '../constants/uiText';
import { useToast } from '../src/ui/ToastContext';

type BookingItem = {
  id: string;
  event_id: string;
  table_id: string | null;
  seat_indices: number[];
  seats_booked: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  ticket_file_url?: string | null;
};

type EventInfo = {
  title: string;
  date: string;
  event_date?: string | null;
  event_time?: string | null;
  timezoneOffsetMinutes?: number;
  tableNumber?: number;
  imageUrl?: string | null;
  tableIdToNumber?: Record<string, number>;
  categoryByTableId?: Record<string, { id: string; name: string }>;
};

const PAYABLE_STATUSES = ['pending', 'reserved', 'awaiting_payment'];

/** Real backend status → Russian label. Keys must match DB booking.status. */
const STATUS_LABELS: Record<string, string> = {
  reserved: 'Забронировано',
  pending: 'Ожидает оплаты',
  awaiting_confirmation: 'Ждет подтверждения',
  paid: 'Оплачено',
  cancelled: 'Отменено',
  expired: 'Истекло',
};

const MyTicketsPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  /** event_id -> Set of table ids that exist in event */
  const [eventTablesMap, setEventTablesMap] = useState<Record<string, Set<string>>>({});
  /** event_id -> event info (title, date, table number by id) */
  const [eventInfoMap, setEventInfoMap] = useState<Record<string, EventInfo>>({});
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [contactModal, setContactModal] = useState<{ eventId: string; bookingId: string } | null>(null);
  const [contactText, setContactText] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
    };

    const onMouseLeave = () => {
      isDown = false;
      el.style.cursor = 'grab';
    };

    const onMouseUp = () => {
      isDown = false;
      el.style.cursor = 'grab';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      el.scrollLeft = scrollLeft - walk;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('wheel', onWheel);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const load = React.useCallback(async () => {
    const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!telegramId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await StorageService.getMyBookingsPublic(telegramId);
      setBookings(data);

      const eventIds = [...new Set(data.map((b) => b.event_id).filter(Boolean))];
      const tableMap: Record<string, Set<string>> = {};
      const infoMap: Record<string, EventInfo> = {};
      const ticketCats = (ev: { ticketCategories?: Array<{ id?: string; name?: string }> }) =>
        ev?.ticketCategories ?? [];
      for (const eventId of eventIds) {
        try {
          const ev = await StorageService.getEvent(eventId);
          const tables = ev?.tables ?? [];
          const tableIds = new Set(tables.map((t: { id?: string }) => t?.id).filter(Boolean) as string[]);
          tableMap[eventId] = tableIds;
          const tableIdToNumber: Record<string, number> = {};
          const categoryByTableId: Record<string, { id: string; name: string }> = {};
          const cats = ticketCats(ev);
          for (const t of tables as { id?: string; number?: number; ticketCategoryId?: string }[]) {
            if (t?.id) tableIdToNumber[t.id] = t.number ?? 0;
            if (t?.id && t.ticketCategoryId) {
              const cat = cats.find((c: { id?: string }) => c.id === t.ticketCategoryId);
              if (cat?.id) categoryByTableId[t.id] = { id: cat.id, name: cat.name ?? cat.id };
            }
          }
          infoMap[eventId] = {
            title: ev?.title ?? 'Событие',
            date: ev?.date ?? '',
            event_date: (ev as any)?.event_date ?? null,
            event_time: (ev as any)?.event_time ?? null,
            timezoneOffsetMinutes: (ev as any)?.timezoneOffsetMinutes ?? 180,
            tableIdToNumber,
            categoryByTableId,
            imageUrl: ev?.imageUrl ?? ev?.coverImageUrl ?? null,
          };
        } catch {
          tableMap[eventId] = new Set();
          infoMap[eventId] = { title: 'Событие', date: '' };
        }
      }
      setEventTablesMap(tableMap);
      setEventInfoMap(infoMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!telegramId) {
      setError('Telegram ID not found');
      setLoading(false);
      return;
    }
    load();
  }, [load]);

  // Auto-refresh for non-paid tickets (poll every 30s when there are awaiting/pending)
  const hasPendingPayments = bookings.some(
    (b) => ['reserved', 'pending', 'awaiting_confirmation'].includes(b.status)
  );
  useEffect(() => {
    if (!hasPendingPayments) return;
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [hasPendingPayments, load]);

  const handleIPaid = async (b: BookingItem) => {
    if (!PAYABLE_STATUSES.includes(b.status)) return;
    const expiresAt = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
    if (Date.now() > expiresAt) return;
    setSubmittingId(b.id);
    setError(null);
    try {
      await StorageService.updateBookingStatus(b.id, 'awaiting_confirmation');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обновить статус');
    } finally {
      setSubmittingId(null);
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() < Date.now();
  };

  const getTableDisplay = (b: BookingItem): string => {
    if (!b.table_id) return '—';
    const tableIds = eventTablesMap[b.event_id];
    if (!tableIds) return b.table_id;
    if (!tableIds.has(b.table_id)) return 'Стол удалён';
    const info = eventInfoMap[b.event_id];
    const num = info?.tableIdToNumber?.[b.table_id];
    return typeof num === 'number' ? `Стол ${num}` : b.table_id;
  };

  /** Format event date and time as "22 марта 2026 г., 17:00" */
  const formatEventDateTime = (info: EventInfo | undefined): { date: string; time: string } => {
    if (!info) return { date: '—', time: '' };
    const offset = (info as any).timezoneOffsetMinutes ?? 180;
    if (info.event_date) {
      const parts = getEventDisplayParts(info.event_date, info.event_time ?? undefined, offset);
      return parts ? { date: parts.date, time: parts.time } : { date: '—', time: '' };
    }
    if (info.date) {
      const parts = getEventDisplayPartsFromIso(info.date, offset);
      return parts ? { date: parts.date, time: parts.time } : { date: '—', time: '' };
    }
    return { date: '—', time: '' };
  };

  const getStatusType = (status: string): 'paid' | 'reserved' | 'cancelled' => {
    if (status === 'paid') return 'paid';
    if (status === 'cancelled' || status === 'expired') return 'cancelled';
    return 'reserved';
  };

  const getTicketImageUrl = (b: BookingItem): string => {
    return b.ticket_file_url ?? '';
  };

  const formatSeatLabel = (seat_indices: number[], seats_booked: number): string => {
    if (!Array.isArray(seat_indices) || seat_indices.length === 0) {
      return `${seats_booked} ${seats_booked === 1 ? 'место' : 'мест'}`;
    }
    const sorted = [...seat_indices].sort((a, b) => a - b);
    const human = sorted.map((i) => i + 1);
    return `Места: ${human.join(', ')}`;
  };

  const rawStatuses = React.useMemo(() => {
    const values = bookings.map((b) => b.status).filter(Boolean);
    return Array.from(new Set(values));
  }, [bookings]);

  const filteredBookings = React.useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter === 'all') return true;
      return b.status === statusFilter;
    });
  }, [bookings, statusFilter]);

  const hasActiveFilters = statusFilter !== 'all';

  return (
    <div className="max-w-[420px] mx-auto h-full relative overflow-x-hidden">
      <div className="px-4 pt-4 pb-2 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle title="Мои билеты" />
          <button
            onClick={() => load()}
            disabled={loading}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#C6A75E]/70 hover:text-[#C6A75E] hover:bg-white/5 transition shrink-0"
            aria-label={UI_TEXT.common.refresh}
          >
            <RefreshCw size={18} strokeWidth={2} />
          </button>
        </div>

        {loading && <div className="text-xs text-muted">Загрузка…</div>}
        {error && <div className="text-sm text-red-400">{error}</div>}

        {!loading && !error && bookings.length > 0 && bookings.some((b) => PAYABLE_STATUSES.includes(b.status) && !isExpired(b.expires_at)) && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 mb-4">
            <p className="text-amber-300 text-xs font-semibold uppercase tracking-wide">{UI_TEXT.booking.paymentPromptCaps}</p>
            <p className="text-muted-light text-xs mt-1">{UI_TEXT.booking.paymentPromptOrder}</p>
          </div>
        )}

        {!loading && !error && bookings.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 min-w-0 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-1">
              <div
                ref={scrollRef}
                className="flex flex-nowrap overflow-x-auto gap-2 py-2 no-scrollbar scroll-smooth cursor-grab select-none"
              >
                {['all', ...rawStatuses].map((status) => {
                  const label = status === 'all' ? 'Все' : STATUS_LABELS[status] ?? status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-all duration-300 ${
                        statusFilter === status
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-md shadow-yellow-500/30'
                          : 'bg-white/5 text-white/60 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="text-xs text-yellow-400 shrink-0"
              >
                Сбросить
              </button>
            )}
          </div>
        )}

        {!loading && !error && bookings.length === 0 && (
          <Card>
            <div className="text-center space-y-3">
              <p className="text-muted-light">
                У вас пока нет билетов
              </p>
              <PrimaryButton onClick={onBack}>
                Перейти к событиям
              </PrimaryButton>
            </div>
          </Card>
        )}

        {!loading && !error && bookings.length > 0 && filteredBookings.length === 0 && (
          <Card>
            <p className="text-muted-light text-center text-sm">Нет билетов по выбранным фильтрам</p>
          </Card>
        )}

        {!loading && !error && bookings.length > 0 && filteredBookings.length > 0 && (
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {filteredBookings.map((b) => {
              const info = eventInfoMap[b.event_id];
              const { date, time } = formatEventDateTime(info);
              const seatLabel = formatSeatLabel(b.seat_indices, b.seats_booked);
              const canPay = PAYABLE_STATUSES.includes(b.status) && !isExpired(b.expires_at);
              const isNotPaid = b.status !== 'paid';
              return (
                <div key={b.id} className="space-y-3 relative">
                  {isNotPaid && (
                    <div className="absolute top-2 right-2 z-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContactModal({ eventId: b.event_id, bookingId: b.id });
                        }}
                        className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-amber-300 hover:bg-white/20 transition"
                      >
                        {UI_TEXT.booking.contactAdminButton}
                      </button>
                    </div>
                  )}
                  <NeonTicketCard
                    eventTitle={info?.title ?? 'Событие'}
                    date={date}
                    time={time}
                    tableLabel={getTableDisplay(b)}
                    seatLabel={seatLabel}
                    status={getStatusType(b.status)}
                    ticketImageUrl={getTicketImageUrl(b)}
                    posterImageUrl={info?.imageUrl ?? undefined}
                    onClick={() => {
                      const url = getTicketImageUrl(b);
                      if (url) setSelectedTicket(url);
                    }}
                  />
                  {canPay && (
                    <PrimaryButton
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIPaid(b);
                      }}
                      disabled={submittingId !== null}
                      className="w-full"
                    >
                      {submittingId === b.id ? 'Отправка…' : UI_TEXT.booking.paidButtonCaps}
                    </PrimaryButton>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </div>

      {selectedTicket !== null && (
        <TicketModal
          ticketImageUrl={selectedTicket}
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}

      {contactModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={() => !contactSubmitting && setContactModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">{UI_TEXT.booking.contactAdminButton}</h3>
            <p className="text-sm text-muted-light">{UI_TEXT.event.contactOrganizerDescribeProblem}</p>
            <textarea
              value={contactText}
              onChange={(e) => setContactText(e.target.value)}
              placeholder={UI_TEXT.event.contactOrganizerDescribePlaceholder}
              rows={4}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-[#C6A75E]/50"
              disabled={contactSubmitting}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => !contactSubmitting && setContactModal(null)}
                className="flex-1 py-3 rounded-xl border border-white/20 text-muted-light hover:bg-white/5 transition"
              >
                {UI_TEXT.common.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const text = contactText.trim();
                  if (!text || !contactModal) return;
                  setContactSubmitting(true);
                  try {
                    const tg = window.Telegram?.WebApp?.initDataUnsafe?.user;
                    await StorageService.contactOrganizer({
                      eventId: contactModal.eventId,
                      problemText: text,
                      bookingId: contactModal.bookingId,
                      userTelegramId: tg?.id,
                      userFirstName: tg?.first_name,
                      userLastName: tg?.last_name,
                      userUsername: tg?.username,
                    });
                    setContactModal(null);
                    setContactText('');
                    showToast(UI_TEXT.event.contactOrganizerSuccess);
                  } catch {
                    showToast(UI_TEXT.event.contactOrganizerError, 'error');
                  } finally {
                    setContactSubmitting(false);
                  }
                }}
                disabled={!contactText.trim() || contactSubmitting}
                className="flex-1 py-3 rounded-xl bg-[#C6A75E] text-black font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {contactSubmitting ? '…' : UI_TEXT.event.contactOrganizerSend}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyTicketsPage;
