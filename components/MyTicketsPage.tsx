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
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load bookings');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

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
                  <div>Table ID: {b.table_id ?? '—'}</div>
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
