import React, { useState } from 'react';

/**
 * Почта для чека, если её не оставили раньше.
 *
 * Оплата по СБП своей ссылкой требует адрес: без него Робокасса не создаст
 * операцию, а чек по 422-ФЗ должен дойти до покупателя. На экране согласий это
 * поле необязательное — значит его могли пропустить, и спросить приходится
 * здесь, в единственный момент, когда без ответа дальше не пройти.
 */
type Props = {
  onSubmit: (email: string) => Promise<void>;
  onCancel: () => void;
};

export default function ReceiptEmailModal({ onSubmit, onCancel }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить почту');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6">
      <div className="w-full max-w-sm rounded-3xl bg-[#141414] border border-white/10 p-5 space-y-4">
        <div className="space-y-1.5">
          <h2 className="text-[17px] font-bold text-white">Куда прислать чек</h2>
          <p className="text-[13px] text-white/55 leading-relaxed">
            Кассовый чек об оплате приходит на почту — этого требует закон.
            Адрес сохранится, и больше мы его не спросим.
          </p>
        </div>

        <div className="space-y-1.5">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            placeholder="you@example.com"
            className="w-full h-12 px-4 rounded-2xl bg-black/40 border border-white/10 text-white placeholder:text-white/25"
          />
          {error && <p className="text-[12.5px] text-[#FF9C7F]">{error}</p>}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !email.trim()}
            className="w-full h-12 rounded-2xl bg-[#C6A75E] text-black text-[15px] font-semibold disabled:opacity-40"
          >
            {busy ? 'Сохраняем…' : 'Продолжить к оплате'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full h-11 rounded-2xl text-[14px] text-white/45"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
