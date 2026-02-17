import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import * as StorageService from '../services/storageService';
import NeonTicketCard from '../src/ui/NeonTicketCard';
import TicketModal from '../src/ui/TicketModal';
import Card from '../src/ui/Card';
import SectionTitle from '../src/ui/SectionTitle';
import PrimaryButton from '../src/ui/PrimaryButton';
import { UI_TEXT } from '../constants/uiText';

type BookingItem = {
  id: string;
  event_id: string;
  table_id: string | null;
  seat_indices: number[];
  seats_booked: number;
  status: string;
  created_at: string;
  expires_at: string | null;
};

type EventInfo = {
  title: string;
  date: string;
  tableNumber?: number;
  imageUrl?: string | null;
  tableIdToNumber?: Record<string, number>;
  categoryByTableId?: Record<string, { id: string; name: string }>;
};

const PAYABLE_STATUSES = ['pending', 'reserved', 'awaiting_payment'];

/** Backend status → display label. Keys must match real backend values. */
const STATUS_LABELS: Record<string, string> = {
  reserved: 'Зарезервировано',
  pending: 'Ожидает оплаты',
  awaiting_confirmation: 'Ожидает подтверждения',
  paid: 'Оплачено',
  cancelled: 'Отменено',
  expired: 'Истекло',
};

const MyTicketsPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
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
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);

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

  const parseDateAndTime = (s: string | null) => {
    if (!s) return { date: '—', time: '' };
    try {
      const d = new Date(s);
      return {
        date: d.toLocaleDateString('ru-RU'),
        time: d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      };
    } catch {
      return { date: s, time: '' };
    }
  };

  const getStatusType = (status: string): 'paid' | 'reserved' | 'cancelled' => {
    if (status === 'paid') return 'paid';
    if (status === 'cancelled' || status === 'expired') return 'cancelled';
    return 'reserved';
  };

  const getTicketImageUrl = (_b: BookingItem): string => {
    return '';
  };

  const formatSeatLabel = (seat_indices: number[], seats_booked: number): string => {
    if (!Array.isArray(seat_indices) || seat_indices.length === 0) {
      return `${seats_booked} ${seats_booked === 1 ? 'место' : 'мест'}`;
    }
    const sorted = [...seat_indices].sort((a, b) => a - b);
    const human = sorted.map((i) => i + 1);
    if (human.length <= 5) {
      return `Места: ${human.join(', ')}`;
    }
    return `${human.length} мест`;
  };

  const uniqueStatuses = React.useMemo(
    () => [...new Set(bookings.map((b) => b.status).filter(Boolean))].sort(),
    [bookings]
  );

  const statusOptions = React.useMemo(
    () => [{ key: 'all', label: 'Все' }, ...uniqueStatuses.map((s) => ({ key: s, label: STATUS_LABELS[s] ?? s }))],
    [uniqueStatuses]
  );

  const filteredBookings = React.useMemo(() => {
    return bookings.filter((b) => {
      const statusMatch = statusFilter === 'all' || b.status === statusFilter;
      const categoryId = b.table_id ? eventInfoMap[b.event_id]?.categoryByTableId?.[b.table_id]?.id ?? null : null;
      const categoryMatch = !categoryFilter || categoryId === categoryFilter;
      return statusMatch && categoryMatch;
    });
  }, [bookings, statusFilter, categoryFilter, eventInfoMap]);

  const availableCategories = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of bookings) {
      if (!b.table_id) continue;
      const cat = eventInfoMap[b.event_id]?.categoryByTableId?.[b.table_id];
      if (cat && !seen.has(cat.id)) seen.set(cat.id, cat.name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [bookings, eventInfoMap]);

  const selectedCategoryName = categoryFilter
    ? availableCategories.find((c) => c.id === categoryFilter)?.name ?? null
    : null;

  const hasActiveFilters = statusFilter !== 'all' || categoryFilter !== null;

  return (
    <div className="max-w-[420px] mx-auto min-h-screen relative overflow-x-hidden">
      <div className="px-4 pt-6 space-y-8">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-xs px-2 py-1 rounded border border-white/20 text-muted-light"
          >
            {UI_TEXT.app.back}
          </button>
        </div>

        <SectionTitle title="Мои билеты" />

        {loading && <div className="text-xs text-muted">Загрузка…</div>}
        {error && <div className="text-sm text-red-400">{error}</div>}

        {!loading && !error && bookings.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 min-w-0 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-1">
              <div className="flex flex-nowrap overflow-x-auto gap-2 py-2 no-scrollbar scroll-smooth">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStatusFilter(opt.key)}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-all duration-300 ${
                      statusFilter === opt.key
                        ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-md shadow-yellow-500/30'
                        : 'bg-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsCategoryOpen(true)}
                  className="flex-shrink-0 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm whitespace-nowrap"
                >
                  {selectedCategoryName ?? 'Категория ▾'}
                </button>
              </div>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setStatusFilter('all'); setCategoryFilter(null); }}
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
            className="space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {filteredBookings.map((b) => {
              const info = eventInfoMap[b.event_id];
              const { date, time } = parseDateAndTime(info?.date ?? b.created_at);
              const seatLabel = formatSeatLabel(b.seat_indices, b.seats_booked);
              const canPay = PAYABLE_STATUSES.includes(b.status) && !isExpired(b.expires_at);
              return (
                <div key={b.id} className="space-y-4">
                  <NeonTicketCard
                    eventTitle={info?.title ?? 'Событие'}
                    date={date}
                    time={time}
                    tableLabel={getTableDisplay(b)}
                    seatLabel={seatLabel}
                    status={getStatusType(b.status)}
                    ticketImageUrl={getTicketImageUrl(b)}
                    posterImageUrl={info?.imageUrl ?? undefined}
                    onClick={() => setSelectedTicket(getTicketImageUrl(b))}
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
                      {submittingId === b.id ? 'Отправка…' : UI_TEXT.booking.paidButton}
                    </PrimaryButton>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </div>

      {isCategoryOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setIsCategoryOpen(false)}
            aria-hidden
          />
          <div
            className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto bg-[#111] rounded-t-3xl p-6 z-50 animate-slideUp"
            role="dialog"
            aria-label="Выбор категории"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Категория</h3>
              <button
                type="button"
                onClick={() => setIsCategoryOpen(false)}
                className="text-white/60 hover:text-white text-sm px-2 py-1"
              >
                Закрыть
              </button>
            </div>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => { setCategoryFilter(null); setIsCategoryOpen(false); }}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${
                  !categoryFilter ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5'
                }`}
              >
                Все категории
              </button>
              {availableCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCategoryFilter(c.id); setIsCategoryOpen(false); }}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${
                    categoryFilter === c.id ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {selectedTicket !== null && (
        <TicketModal
          ticketImageUrl={selectedTicket}
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
};

export default MyTicketsPage;
