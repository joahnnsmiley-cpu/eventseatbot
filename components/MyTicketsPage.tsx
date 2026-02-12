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
};

const MyTicketsPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** event_id -> Set of table ids that exist in event */
  const [eventTablesMap, setEventTablesMap] = useState<Record<string, Set<string>>>({});
  /** event_id -> event info (title, date, table number by id) */
  const [eventInfoMap, setEventInfoMap] = useState<Record<string, EventInfo & { tableIdToNumber?: Record<string, number> }>>({});
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);

  useEffect(() => {
    const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!telegramId) {
      setError('Telegram ID not found');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await StorageService.getMyBookingsPublic(telegramId);
        setBookings(data);

        const eventIds = [...new Set(data.map((b) => b.event_id).filter(Boolean))];
        const tableMap: Record<string, Set<string>> = {};
        const infoMap: Record<string, EventInfo & { tableIdToNumber?: Record<string, number> }> = {};
        for (const eventId of eventIds) {
          try {
            const ev = await StorageService.getEvent(eventId);
            const tables = ev?.tables ?? [];
            const tableIds = new Set(tables.map((t: { id?: string }) => t?.id).filter(Boolean) as string[]);
            tableMap[eventId] = tableIds;
            const tableIdToNumber: Record<string, number> = {};
            for (const t of tables as { id?: string; number?: number }[]) {
              if (t?.id) tableIdToNumber[t.id] = t.number ?? 0;
            }
            infoMap[eventId] = {
              title: ev?.title ?? 'Событие',
              date: ev?.date ?? '',
              tableIdToNumber,
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
    };

    load();
  }, []);

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

  return (
    <div className="max-w-[420px] mx-auto min-h-screen relative overflow-x-hidden">
      <div className="px-4 pt-6 pb-24 space-y-8">
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

        {!loading && !error && bookings.length > 0 && (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {bookings.map((b) => {
              const info = eventInfoMap[b.event_id];
              const { date, time } = parseDateAndTime(info?.date ?? b.created_at);
              const seatLabel = Array.isArray(b.seat_indices) && b.seat_indices.length > 0
                ? `Места: ${b.seat_indices.join(', ')}`
                : `${b.seats_booked} ${b.seats_booked === 1 ? 'место' : 'мест'}`;
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
                    onClick={() => setSelectedTicket(getTicketImageUrl(b))}
                  />
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
    </div>
  );
};

export default MyTicketsPage;
