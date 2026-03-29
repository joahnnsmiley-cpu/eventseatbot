import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { getApiBaseUrl } from '@/config/api';
import AuthService from '../services/authService';
import { getPlatform } from '../src/utils/platform';

type ScanResult =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; eventTitle: string; tableNumber: number | string; seats: number | string }
  | { state: 'already_used' }
  | { state: 'invalid' }
  | { state: 'error'; message: string };

function decodeTokenPayload(token: string): { bookingId?: string } | null {
  try {
    const part = token.split('.')[0];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

async function verifyAndMarkUsed(rawToken: string): Promise<ScanResult> {
  let token = rawToken;
  const tokenMatch = rawToken.match(/\/verify-ticket\/([^/?#]+)/);
  if (tokenMatch?.[1]) token = tokenMatch[1];

  const apiBase = getApiBaseUrl();

  let verifyData: { valid?: boolean; is_used?: boolean; eventTitle?: string; tableNumber?: number | string; seats?: number | string; bookingId?: string };
  try {
    const verifyRes = await fetch(`${apiBase}/verify-ticket/${encodeURIComponent(token)}`);
    verifyData = await verifyRes.json();
  } catch {
    return { state: 'error', message: 'Нет соединения с сервером' };
  }

  if (!verifyData.valid) {
    if (verifyData.is_used) return { state: 'already_used' };
    return { state: 'invalid' };
  }

  const payload = decodeTokenPayload(token);
  const bookingId = verifyData.bookingId ?? payload?.bookingId;
  if (!bookingId) return { state: 'invalid' };

  try {
    const markRes = await fetch(`${apiBase}/controller/bookings/${bookingId}/mark-used`, {
      method: 'PATCH',
      headers: { ...(AuthService.getAuthHeader() as Record<string, string>), 'Content-Type': 'application/json' },
    });
    if (markRes.status === 409) return { state: 'already_used' };
    if (!markRes.ok) {
      const body = await markRes.json().catch(() => ({}));
      return { state: 'error', message: (body as any)?.error ?? 'Не удалось пометить билет' };
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

const SCANNER_ELEMENT_ID = 'qr-reader-raw';

export default function ControllerScannerScreen() {
  const [result, setResult] = useState<ScanResult>({ state: 'idle' });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // state 2 = SCANNING, state 3 = PAUSED
        if (state === 2 || state === 3) {
          await scannerRef.current.stop();
        }
      } catch { /* ignore */ }
      scannerRef.current = null;
    }
    scanningRef.current = false;
  };

  const startWebScanner = async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;

    const el = document.getElementById(SCANNER_ELEMENT_ID);
    if (!el) { scanningRef.current = false; return; }

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        (decodedText) => {
          // Stop scanning immediately after first success
          stopScanner().then(() => {
            setResult({ state: 'loading' });
            verifyAndMarkUsed(decodedText).then(setResult);
          });
        },
        () => { /* per-frame error — ignore */ }
      );
    } catch {
      scanningRef.current = false;
      setResult({ state: 'error', message: 'Нет доступа к камере. Разрешите доступ в настройках браузера.' });
    }
  };

  const startTelegramScanner = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (typeof tg?.showScanQrPopup === 'function') {
      tg.showScanQrPopup({ text: 'Наведите камеру на QR-код билета' }, (scannedText: string) => {
        tg.closeScanQrPopup?.();
        setResult({ state: 'loading' });
        verifyAndMarkUsed(scannedText).then(setResult);
        return true;
      });
    } else {
      startWebScanner();
    }
  };

  const initScanner = () => {
    const platform = getPlatform();
    if (platform === 'telegram') {
      startTelegramScanner();
    } else {
      // Small delay to ensure DOM element is mounted
      setTimeout(startWebScanner, 80);
    }
  };

  useEffect(() => {
    initScanner();
    return () => { stopScanner(); };
  }, []);

  const reset = () => {
    stopScanner().then(() => {
      setResult({ state: 'idle' });
      setTimeout(initScanner, 100);
    });
  };

  const isIdle = result.state === 'idle';

  return (
    <div className="w-full max-w-[720px] mx-auto flex flex-col" style={{ minHeight: '60vh' }}>

      {/* Camera viewfinder */}
      {isIdle && (
        <div className="relative w-full bg-black" style={{ aspectRatio: '1' }}>
          {/* Raw scanner target — fills the container */}
          <div id={SCANNER_ELEMENT_ID} className="w-full h-full" />

          {/* Overlay: dark corners + bright frame */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Dark vignette */}
            <div className="absolute inset-0" style={{
              background: 'radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.65) 65%)'
            }} />
            {/* Scanning frame */}
            <div className="relative" style={{ width: 220, height: 220 }}>
              {/* Corner marks */}
              {[
                'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
                'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
                'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
                'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
              ].map((cls, i) => (
                <div key={i} className={`absolute border-white w-8 h-8 ${cls}`} />
              ))}
              {/* Scanning line animation */}
              <div className="absolute inset-x-2 top-1/2 h-px bg-white/60" style={{
                animation: 'scanLine 1.8s ease-in-out infinite',
              }} />
            </div>
          </div>

          {/* Hint text */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
            <span className="text-white/80 text-sm bg-black/40 px-3 py-1 rounded-full">
              Наведите камеру на QR-код билета
            </span>
          </div>
        </div>
      )}

      {/* Result cards */}
      <div className="px-5 py-5 flex flex-col gap-4">

        {result.state === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white/50 text-sm">Проверка...</p>
          </div>
        )}

        {result.state === 'success' && (
          <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">✅</span>
              <span className="text-green-400 text-xl font-bold">Билет принят</span>
            </div>
            {result.eventTitle && <p className="text-white/70 text-sm">{result.eventTitle}</p>}
            <div className="flex gap-5 text-sm text-white/50">
              {result.tableNumber !== '' && (
                <span>Стол <span className="text-white font-semibold">{result.tableNumber}</span></span>
              )}
              {result.seats !== '' && (
                <span>Мест <span className="text-white font-semibold">{result.seats}</span></span>
              )}
            </div>
            <button onClick={reset}
              className="mt-1 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
              Следующий билет
            </button>
          </div>
        )}

        {result.state === 'already_used' && (
          <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚠️</span>
              <span className="text-yellow-400 text-xl font-bold">Уже использован</span>
            </div>
            <p className="text-white/50 text-sm">Этот билет уже был отсканирован ранее.</p>
            <button onClick={reset}
              className="mt-1 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
              Следующий билет
            </button>
          </div>
        )}

        {result.state === 'invalid' && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">❌</span>
              <span className="text-red-400 text-xl font-bold">Недействителен</span>
            </div>
            <p className="text-white/50 text-sm">Билет не найден или не оплачен.</p>
            <button onClick={reset}
              className="mt-1 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
              Сканировать снова
            </button>
          </div>
        )}

        {result.state === 'error' && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">❌</span>
              <span className="text-red-400 text-xl font-bold">Ошибка</span>
            </div>
            <p className="text-white/50 text-sm">{result.message}</p>
            <button onClick={reset}
              className="mt-1 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
              Попробовать снова
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scanLine {
          0%   { transform: translateY(-100px); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(100px); opacity: 0; }
        }
        #${SCANNER_ELEMENT_ID} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #${SCANNER_ELEMENT_ID} img,
        #${SCANNER_ELEMENT_ID} > div:not([id]) {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
