import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { getApiBaseUrl } from '@/config/api';
import AuthService from '../services/authService';
import { getPlatform } from '../src/utils/platform';

type ScanResult =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; eventTitle: string; tableNumber: number | string; seats: number | string }
  | { state: 'already_used' }
  | { state: 'invalid' }
  | { state: 'wrong_date'; eventTitle: string }
  /** Found by code: shown before letting the guest in, so the door decides. */
  | { state: 'found'; bookingId: string; eventTitle: string; tableNumber: number | string; seats: number | string; phone: string }
  | { state: 'error'; message: string };

function decodeTokenPayload(token: string): { bookingId?: string } | null {
  try {
    const part = token.split('.')[0];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

async function verifyAndMarkUsed(rawToken: string): Promise<ScanResult> {
  let token = rawToken;
  const m = rawToken.match(/\/verify-ticket\/([^/?#]+)/);
  if (m?.[1]) token = m[1];

  const apiBase = getApiBaseUrl();

  let verifyData: { valid?: boolean; is_used?: boolean; wrong_date?: boolean; eventTitle?: string; tableNumber?: number | string; seats?: number | string; bookingId?: string };
  try {
    const r = await fetch(`${apiBase}/verify-ticket/${encodeURIComponent(token)}`);
    verifyData = await r.json();
  } catch {
    return { state: 'error', message: 'Нет соединения с сервером' };
  }

  if (!verifyData.valid) {
    if (verifyData.is_used) return { state: 'already_used' };
    if (verifyData.wrong_date) return { state: 'wrong_date', eventTitle: verifyData.eventTitle ?? '' };
    return { state: 'invalid' };
  }

  const bookingId = verifyData.bookingId ?? decodeTokenPayload(token)?.bookingId;
  if (!bookingId) return { state: 'invalid' };

  try {
    const r2 = await fetch(`${apiBase}/controller/bookings/${bookingId}/mark-used`, {
      method: 'PATCH',
      headers: { ...(AuthService.getAuthHeader() as Record<string, string>), 'Content-Type': 'application/json' },
    });
    if (r2.status === 409) return { state: 'already_used' };
    if (!r2.ok) {
      const b = await r2.json().catch(() => ({}));
      return { state: 'error', message: (b as any)?.error ?? 'Не удалось пометить билет' };
    }
  } catch {
    return { state: 'error', message: 'Нет соединения с сервером' };
  }

  return {
    state: 'success',
    eventTitle: verifyData.eventTitle ?? '',
    tableNumber: verifyData.tableNumber ?? '',
    seats: verifyData.seats ?? '',
  };
}

/** Mark a found booking as used — the same call the QR path makes. */
type MarkResult = { ok: boolean; alreadyUsed?: boolean; message?: string };

async function markUsed(bookingId: string): Promise<MarkResult> {
  try {
    const r = await fetch(`${getApiBaseUrl()}/controller/bookings/${bookingId}/mark-used`, {
      method: 'PATCH',
      headers: { ...(AuthService.getAuthHeader() as Record<string, string>), 'Content-Type': 'application/json' },
    });
    if (r.status === 409) return { ok: false, alreadyUsed: true };
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      return { ok: false, message: (b as any)?.error ?? 'Не удалось отметить билет' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Нет соединения с сервером' };
  }
}

/** Find tonight's booking by the four-character code the guest was given. */
async function findByCode(code: string): Promise<ScanResult> {
  try {
    const r = await fetch(`${getApiBaseUrl()}/controller/bookings/by-code`, {
      method: 'POST',
      headers: { ...(AuthService.getAuthHeader() as Record<string, string>), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (r.status === 404) {
      const b = await r.json().catch(() => ({}));
      return (b as any)?.error === 'wrong_date'
        ? { state: 'wrong_date', eventTitle: '' }
        : { state: 'invalid' };
    }
    if (!r.ok) return { state: 'error', message: 'Не удалось проверить код' };
    const data = await r.json();
    const first = Array.isArray(data?.bookings) ? data.bookings[0] : null;
    if (!first) return { state: 'invalid' };
    if (first.isUsed) return { state: 'already_used' };
    return {
      state: 'found',
      bookingId: first.id,
      eventTitle: first.eventTitle ?? '',
      tableNumber: first.tableNumber ?? '',
      seats: first.seats ?? '',
      phone: first.phone ?? '',
    };
  } catch {
    return { state: 'error', message: 'Нет соединения с сервером' };
  }
}

export default function ControllerScannerScreen() {
  const [result, setResult] = useState<ScanResult>({ state: 'idle' });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const processingRef = useRef(false); // prevent double-fire

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    processingRef.current = false;
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || processingRef.current) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });

    if (code?.data) {
      processingRef.current = true;
      stopCamera();
      setResult({ state: 'loading' });
      verifyAndMarkUsed(code.data).then(setResult);
      return;
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    processingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch {
      setCameraError('Нет доступа к камере. Разрешите доступ в настройках.');
    }
  }, [scanFrame]);

  const startTelegramScanner = useCallback(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (typeof tg?.showScanQrPopup === 'function') {
      tg.showScanQrPopup({ text: 'Наведите камеру на QR-код билета' }, (text: string) => {
        tg.closeScanQrPopup?.();
        setResult({ state: 'loading' });
        verifyAndMarkUsed(text).then(setResult);
        return true;
      });
    } else {
      startCamera();
    }
  }, [startCamera]);

  useEffect(() => {
    const platform = getPlatform();
    if (platform === 'telegram') {
      startTelegramScanner();
    } else {
      startCamera();
    }
    return () => stopCamera();
  }, []);

  const reset = useCallback(() => {
    setResult({ state: 'idle' });
    processingRef.current = false;
    const platform = getPlatform();
    if (platform === 'telegram') {
      setTimeout(startTelegramScanner, 50);
    } else {
      setTimeout(startCamera, 50);
    }
  }, [startCamera, startTelegramScanner]);

  const isIdle = result.state === 'idle';

  return (
    <div className="w-full max-w-[720px] mx-auto flex flex-col">

      {/* Camera viewfinder */}
      <div className="relative w-full bg-[#0B0A09] overflow-hidden" style={{ aspectRatio: '1', display: isIdle ? 'block' : 'none' }}>
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 36%, rgba(0,0,0,0.6) 62%)'
          }} />
          <div className="relative" style={{ width: 220, height: 220 }}>
            {(['top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-lg',
              'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-lg',
              'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-lg',
              'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-lg'] as const).map((cls, i) => (
              <div key={i} className={`absolute border-white w-9 h-9 ${cls}`} />
            ))}
            <div className="absolute inset-x-0 top-1/2 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent"
              style={{ animation: 'scanLine 1.8s ease-in-out infinite' }} />
          </div>
        </div>

        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-white/90 text-sm bg-black/50 px-4 py-1.5 rounded-full">
            Наведите на QR-код билета
          </span>
        </div>

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <p className="text-white/70 text-sm text-center">{cameraError}</p>
          </div>
        )}
      </div>

      {/* When the QR will not scan: the guest reads out their code. */}
      {isIdle && (
        <form
          className="px-5 pt-4 flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const clean = code.replace(/[^a-z0-9]/gi, '');
            if (clean.length < 4 || codeBusy) return;
            setCodeBusy(true);
            stopCamera();
            setResult({ state: 'loading' });
            const r = await findByCode(clean.slice(0, 4));
            setResult(r);
            setCodeBusy(false);
            setCode('');
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="КОД"
            aria-label="Код брони"
            inputMode="text"
            autoCapitalize="characters"
            className="flex-1 h-12 px-4 rounded-2xl bg-white/5 border border-white/10 text-white text-[17px] tracking-[0.18em] placeholder:text-white/25 focus:outline-none focus:border-[#C6A75E]"
          />
          <button
            type="submit"
            disabled={code.replace(/[^a-z0-9]/gi, '').length < 4 || codeBusy}
            className="h-12 px-4 rounded-2xl bg-white/10 border border-white/10 text-white text-sm font-medium disabled:opacity-40"
          >
            Проверить
          </button>
        </form>
      )}

      {/* Result cards */}
      <div className="px-5 py-5 flex flex-col gap-4">
        {result.state === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white/50 text-sm">Проверяем…</p>
          </div>
        )}

        {result.state === 'success' && (
          <div className="rounded-2xl border border-[#57C79B]/40 bg-[#57C79B]/10 p-5 flex flex-col gap-3">
            <span className="text-[#57C79B] text-[26px] font-bold leading-none">Проходите</span>
            {result.eventTitle && <p className="text-white/70 text-sm">{result.eventTitle}</p>}
            <div className="flex gap-5 text-sm text-white/50">
              {result.tableNumber !== '' && <span>Стол <span className="text-white font-semibold text-base">{result.tableNumber}</span></span>}
              {result.seats !== '' && <span>Гостей <span className="text-white font-semibold text-base">{result.seats}</span></span>}
            </div>
            <button onClick={reset} className="mt-1 w-full py-3.5 rounded-2xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
              Следующий билет
            </button>
          </div>
        )}

        {result.state === 'found' && (
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5 flex flex-col gap-3">
            <span className="text-white text-[22px] font-bold leading-none">Бронь найдена</span>
            {result.eventTitle && <p className="text-white/70 text-sm">{result.eventTitle}</p>}
            <div className="flex gap-5 text-sm text-white/50">
              {result.tableNumber !== '' && <span>Стол <span className="text-white font-semibold text-base">{result.tableNumber}</span></span>}
              {result.seats !== '' && <span>Гостей <span className="text-white font-semibold text-base">{result.seats}</span></span>}
            </div>
            {result.phone && <p className="text-xs text-white/40">Телефон при брони: {result.phone}</p>}
            <button
              onClick={async () => {
                const r = await markUsed(result.bookingId);
                if (r.ok) {
                  setResult({ state: 'success', eventTitle: result.eventTitle, tableNumber: result.tableNumber, seats: result.seats });
                } else if (r.alreadyUsed === true) {
                  setResult({ state: 'already_used' });
                } else {
                  setResult({ state: 'error', message: r.message ?? 'Не удалось отметить билет' });
                }
              }}
              className="mt-1 w-full py-3.5 rounded-2xl bg-[#C6A75E] text-[#16130D] text-[15px] font-semibold active:opacity-80"
            >
              Впустить
            </button>
            <button onClick={reset} className="w-full py-2 text-white/40 text-sm">
              Отмена
            </button>
          </div>
        )}

        {result.state === 'already_used' && (
          <div className="rounded-2xl border border-[#E8B04B]/40 bg-[#E8B04B]/10 p-5 flex flex-col gap-3">
            <span className="text-[#E8B04B] text-[26px] font-bold leading-none">Уже проходили</span>
            <p className="text-white/50 text-sm">Этот билет отметили на входе раньше. Уточните у гостя.</p>
            <button onClick={reset} className="mt-1 w-full py-3.5 rounded-2xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
              Следующий билет
            </button>
          </div>
        )}

        {result.state === 'wrong_date' && (
          <div className="rounded-2xl border border-[#E8B04B]/40 bg-[#E8B04B]/10 p-5 flex flex-col gap-3">
            <span className="text-[#E8B04B] text-[26px] font-bold leading-none">Билет на другой день</span>
            <p className="text-white/50 text-sm">
              {result.eventTitle ? `Это билет на «${result.eventTitle}».` : 'Этот билет не на сегодняшний концерт.'}
            </p>
            <button onClick={reset} className="mt-1 w-full py-3.5 rounded-2xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
              Следующий билет
            </button>
          </div>
        )}

        {result.state === 'invalid' && (
          <div className="rounded-2xl border border-[#FF5A2C]/40 bg-[#FF5A2C]/10 p-5 flex flex-col gap-3">
            <span className="text-[#FF8A63] text-[26px] font-bold leading-none">Не подходит</span>
            <p className="text-white/50 text-sm">Билет не найден или не оплачен. Попробуйте код брони.</p>
            <button onClick={reset} className="mt-1 w-full py-3.5 rounded-2xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
              Сканировать снова
            </button>
          </div>
        )}

        {result.state === 'error' && (
          <div className="rounded-2xl border border-[#FF5A2C]/40 bg-[#FF5A2C]/10 p-5 flex flex-col gap-3">
            <span className="text-[#FF8A63] text-[22px] font-bold leading-none">Не получилось</span>
            <p className="text-white/50 text-sm">{result.message}</p>
            <button onClick={reset} className="mt-1 w-full py-3.5 rounded-2xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
              Попробовать снова
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scanLine {
          0%   { transform: translateY(-100px); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(100px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
