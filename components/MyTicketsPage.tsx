import React, { useEffect, useState } from 'react';
import * as StorageService from '../services/storageService';

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

const MyTicketsPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** event_id -> Set of table ids that exist in event */
  const [eventTablesMap, setEventTablesMap] = useState<Record<string, Set<string>>>({});

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
        const map: Record<string, Set<string>> = {};
        for (const eventId of eventIds) {
          try {
            const ev = await StorageService.getEvent(eventId);
            const tables = ev?.tables ?? [];
            const tableIds = new Set(tables.map((t: { id?: string }) => t?.id).filter(Boolean) as string[]);
            map[eventId] = tableIds;
          } catch {
            map[eventId] = new Set();
          }
        }
        setEventTablesMap(map);
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
    return tableIds.has(b.table_id) ? b.table_id : 'Стол удалён';
  };

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleString();
    } catch {
      return s;
    }
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
          <div className="space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="bg-white p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">ID: {b.id.slice(0, 8)}…</span>
                  {b.status === 'paid' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">Оплачено</span>
                  )}
                  {b.status === 'reserved' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">Ожидает оплаты</span>
                  )}
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Event ID: {b.event_id}</div>
                  <div>Table ID: {getTableDisplay(b)}</div>
                  <div>Seat indices: {Array.isArray(b.seat_indices) ? b.seat_indices.join(', ') : '—'}</div>
                  <div>Status: {b.status}</div>
                  <div>Created: {formatDate(b.created_at)}</div>
                  <div>Expires: {formatDate(b.expires_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyTicketsPage;
