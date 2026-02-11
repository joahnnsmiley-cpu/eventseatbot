import React, { useEffect, useState } from 'react';
import * as StorageService from '../services/storageService';
import NeonTicketCard from '../src/ui/NeonTicketCard';
import TicketModal from '../src/ui/TicketModal';

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
  const [modalTicketUrl, setModalTicketUrl] = useState<string | null>(null);

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
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="text-xs px-2 py-1 rounded border"
          >
            Back
          </button>
          <div className="text-xs text-gray-500">Мои билеты</div>
          <div style={{ width: 40 }} />
        </div>

        {loading && <div className="text-xs text-gray-500">Загрузка…</div>}
        {error && <div className="text-xs text-red-600 mb-3">{error}</div>}

        {!loading && !error && bookings.length === 0 && (
          <div className="text-sm text-gray-600">Нет бронирований</div>
        )}

        {!loading && !error && bookings.length > 0 && (
          <div className="space-y-4">
            {bookings.map((b) => {
              const info = eventInfoMap[b.event_id];
              const { date, time } = parseDateAndTime(info?.date ?? b.created_at);
              const seatLabel = Array.isArray(b.seat_indices) && b.seat_indices.length > 0
                ? `Места: ${b.seat_indices.join(', ')}`
                : `${b.seats_booked} ${b.seats_booked === 1 ? 'место' : 'мест'}`;
              return (
                <NeonTicketCard
                  key={b.id}
                  eventTitle={info?.title ?? 'Событие'}
                  date={date}
                  time={time}
                  tableLabel={getTableDisplay(b)}
                  seatLabel={seatLabel}
                  status={getStatusType(b.status)}
                  ticketImageUrl={getTicketImageUrl(b)}
                  onClick={() => setModalTicketUrl(getTicketImageUrl(b))}
                />
              );
            })}
          </div>
        )}
      </div>

      {modalTicketUrl !== undefined && (
        <TicketModal
          ticketImageUrl={modalTicketUrl}
          onClose={() => setModalTicketUrl(undefined)}
        />
      )}
    </div>
  );
};

export default MyTicketsPage;
