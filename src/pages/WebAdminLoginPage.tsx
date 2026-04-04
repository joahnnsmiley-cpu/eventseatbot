import React, { useState } from 'react';
import { getApiBaseUrl } from '../../config/api';
import AuthService from '../../services/authService';

type Props = {
  onLogin: (token: string) => void;
};

export default function WebAdminLoginPage({ onLogin }: Props) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/auth/web-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError((data as any).error || 'Ошибка входа');
        return;
      }

      const token = (data as any).token as string;
      if (!token) {
        setError('Сервер не вернул токен');
        return;
      }

      AuthService.setToken(token);
      onLogin(token);
    } catch {
      setError('Нет связи с сервером');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">#НиктоНеКруче</h1>
          <p className="text-white/50 text-sm">Панель управления</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#141414] border border-white/10 rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Логин</label>
            <input
              type="text"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
              disabled={loading}
              className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-[#C6A75E]/60 transition-colors"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5">Пароль</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-[#C6A75E]/60 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !login || !password}
            className="w-full py-3 rounded-xl font-semibold text-black transition-all disabled:opacity-40"
            style={{ background: '#C6A75E' }}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
