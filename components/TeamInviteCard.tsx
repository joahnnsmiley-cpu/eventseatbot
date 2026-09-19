import React, { useCallback, useEffect, useState } from 'react';
import * as StorageService from '../services/storageService';
import type { EventData } from '../types';

/**
 * Invite a person to the team with a one-time link instead of their numeric ID.
 * They tap it, the bot opens and adds them; the admin gets a message in Telegram.
 */
export default function TeamInviteCard({ events, onChanged }: { events: EventData[]; onChanged?: () => void }) {
  const [role, setRole] = useState<'controller' | 'organizer'>('controller');
  const [eventId, setEventId] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<StorageService.TeamInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<StorageService.TeamInvite[]>([]);

  const loadPending = useCallback(async () => {
    try {
      setPending(await StorageService.getTeamInvites());
    } catch {
      /* the list is a convenience; creating still works without it */
    }
  }, []);

  useEffect(() => { void loadPending(); }, [loadPending]);

  // Organizer invites need an event; offer the ones that are not deleted.
  const eventOptions = events.filter((e) => (e as { is_deleted?: boolean }).is_deleted !== true);

  const create = async () => {
    setError(null);
    setCopied(false);
    if (role === 'organizer' && !eventId) { setError('Выберите событие'); return; }
    setBusy(true);
    try {
      const inv = await StorageService.createTeamInvite(role, { eventId: role === 'organizer' ? eventId : undefined, label: label.trim() || undefined });
      if (!inv.link) throw new Error('no link');
      setCreated(inv);
      setLabel('');
      void loadPending();
      onChanged?.();
    } catch {
      setError('Не получилось создать ссылку. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt('Скопируйте ссылку', link);
    }
  };

  const share = (link: string) => {
    const text = role === 'controller' ? 'Приглашение в команду: проверка билетов на входе' : 'Приглашение в команду организаторов';
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    const tg = (window as { Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } } }).Telegram?.WebApp;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  };

  const revoke = async (token: string) => {
    try {
      await StorageService.revokeTeamInvite(token);
      if (created?.token === token) setCreated(null);
      void loadPending();
    } catch {
      setError('Не получилось отозвать ссылку.');
    }
  };

  const hoursLeft = (iso: string) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000));
  const eventTitle = (id: string | null) => (id ? events.find((e) => e.id === id)?.title ?? 'событие' : null);

  return (
    <section aria-label="Пригласить в команду" className="flex flex-col gap-3.5 p-4 mb-4 rounded-[20px] bg-[#161412] border border-[#C6A75E]/35">
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold text-white">Пригласить по ссылке</span>
        <span className="text-[12.5px] leading-snug text-[#8C8477]">
          Отправьте ссылку человеку — он откроет бота и сразу попадёт в команду. Никаких ID.
        </span>
      </div>

      <div role="radiogroup" aria-label="Роль" className="grid grid-cols-2 gap-1.5">
        {([
          ['controller', 'Контролёр на входе'],
          ['organizer', 'Организатор'],
        ] as const).map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={role === key}
            onClick={() => { setRole(key); setCreated(null); setError(null); }}
            className={`h-11 rounded-xl text-[13.5px] border ${role === key ? 'border-[#C6A75E] bg-[#C6A75E]/10 text-[#C6A75E] font-semibold' : 'border-[#2B2723] text-[#BDB5A8]'}`}
          >
            {text}
          </button>
        ))}
      </div>

      {role === 'organizer' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-event" className="text-[12.5px] text-[#8C8477]">Событие</label>
          <select id="invite-event" value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full">
            <option value="">Выберите событие…</option>
            {eventOptions.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="invite-label" className="text-[12.5px] text-[#8C8477]">Имя — чтобы узнать в списке (можно пропустить)</label>
        <input id="invite-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Например, Максим" className="w-full" />
      </div>

      {!created && (
        <button type="button" onClick={create} disabled={busy} className="admin-cta h-12">
          {busy ? 'Создаю ссылку…' : 'Создать ссылку'}
        </button>
      )}

      {created?.link && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 h-12 pl-3.5 pr-1.5 rounded-xl bg-[#1F1C19]">
            <span className="flex-1 min-w-0 truncate text-[13.5px] text-[#BDB5A8]">{created.link.replace('https://', '')}</span>
            <button type="button" onClick={() => copy(created.link!)} className="admin-cta h-9 px-3 text-[13.5px]">
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <button type="button" onClick={() => share(created.link!)} className="h-11 rounded-xl border border-[#2B2723] text-sm text-white">
            Отправить в Telegram
          </button>
          <button type="button" onClick={() => { setCreated(null); setCopied(false); }} className="h-9 text-[12.5px] text-[#8C8477]">
            Ещё одна ссылка
          </button>
        </div>
      )}

      {error && <span className="text-[12.5px] text-[#FF9C7F]">{error}</span>}
      <span className="text-xs text-[#8C8477]">Ссылка срабатывает один раз и действует 24 часа.</span>

      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-[#2B2723]">
          <span className="text-[11.5px] font-semibold tracking-[0.08em] uppercase text-[#8C8477]">Ждут, пока откроют · {pending.length}</span>
          {pending.map((p) => (
            <div key={p.token} className="flex items-center gap-2 text-[13px]">
              <span className="flex-1 min-w-0 truncate text-[#BDB5A8]">
                {p.role === 'controller' ? 'Контролёр' : `Организатор · ${eventTitle(p.eventId)}`}
                {p.label ? ` · ${p.label}` : ''}
                <span className="text-[#8C8477]"> · ещё {hoursLeft(p.expiresAt)} ч</span>
              </span>
              <button type="button" onClick={() => revoke(p.token)} className="h-9 px-2 text-[12.5px] text-[#8C8477]">Отозвать</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
