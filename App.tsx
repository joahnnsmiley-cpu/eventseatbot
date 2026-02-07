import React, { useEffect, useState } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
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

const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as any).env &&
    (import.meta as any).env.VITE_API_BASE_URL) ||
  'http://localhost:4000';

type PublicEvent = {
  id: string;
  title?: string;
  date?: string;
};

function App() {
  const [tgAvailable, setTgAvailable] = useState(false);
  const [tgInitData, setTgInitData] = useState('');
  const [tgUser, setTgUser] = useState<TgUser | null>(null);

  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/public/events`);
      if (!res.ok) throw new Error('Failed to load events');
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-2">EventSeatBot</h1>
        <p className="text-sm text-gray-600 mb-4">Список опубликованных событий</p>

        {!tgAvailable && (
          <div className="text-xs text-gray-500 mb-4">
            Telegram WebApp не обнаружен. Локальный режим.
          </div>
        )}

        {!!tgInitData && (
          <div className="text-xs text-gray-500 mb-4">
            Telegram initData получен.
          </div>
        )}

        {tgUser && (
          <div className="text-xs text-gray-500 mb-4">
            Пользователь: {tgUser.username || tgUser.first_name || tgUser.id}
          </div>
        )}

        <button
          onClick={loadEvents}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold"
          disabled={loading}
        >
          {loading ? 'Загрузка…' : 'События'}
        </button>

        {error && <div className="text-sm text-red-600 mt-4">{error}</div>}

        <div className="mt-6 space-y-3">
          {events.map((evt) => (
            <div key={evt.id} className="bg-white p-3 rounded border">
              <div className="font-semibold">{evt.title || 'Без названия'}</div>
              <div className="text-xs text-gray-500">{evt.date || ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;