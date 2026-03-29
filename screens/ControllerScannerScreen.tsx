import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
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
  // The QR contains a full URL like https://host/verify-ticket/TOKEN
  // or just the token itself. Extract the token part.
  let token = rawToken;
  const tokenMatch = rawToken.match(/\/verify-ticket\/([^/?#]+)/);
  if (tokenMatch?.[1]) {
    token = tokenMatch[1];
  }

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

  // Extract bookingId from token payload
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

export default function ControllerScannerScreen() {
  const [result, setResult] = useState<ScanResult>({ state: 'idle' });
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const scannerInitialized = useRef(false);

  const handleToken = (token: string) => {
    setResult({ state: 'loading' });
    verifyAndMarkUsed(token).then(setResult);
  };

  const startWebScanner = () => {
    if (scannerInitialized.current) return;
    scannerInitialized.current = true;

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        qrbox: { width: 260, height: 260 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      },
      false
    );
    scannerRef.current = scanner;
    scanner.render(
      (decodedText) => {
        scanner.clear().catch(() => {});
        scannerInitialized.current = false;
        handleToken(decodedText);
      },
      () => { /* ignore per-frame errors */ }
    );
  };

  const startTelegramScanner = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (typeof tg?.showScanQrPopup === 'function') {
      tg.showScanQrPopup({ text: 'Наведите камеру на QR-код билета' }, (scannedText: string) => {
        tg.closeScanQrPopup?.();
        handleToken(scannedText);
        return true; // close after first scan
      });
    } else {
      // Telegram client too old — fall back to web scanner
      startWebScanner();
    }
  };

  const initScanner = () => {
    const platform = getPlatform();
    if (platform === 'telegram') {
      startTelegramScanner();
    } else {
      startWebScanner();
    }
  };

  useEffect(() => {
    if (result.state === 'idle') {
      initScanner();
    }
    return () => {
      scannerRef.current?.clear().catch(() => {});
      scannerRef.current = null;
      scannerInitialized.current = false;
    };
  }, []);

  const reset = () => {
    scannerRef.current?.clear().catch(() => {});
    scannerRef.current = null;
    scannerInitialized.current = false;
    setResult({ state: 'idle' });
    // Re-init scanner after state update
    setTimeout(initScanner, 100);
  };

  return (
    <div className="w-full max-w-[720px] mx-auto px-6 py-6 flex flex-col gap-4">
      <h2 className="text-white text-xl font-semibold">Проверка билетов</h2>

      {/* Scanner container — shown when idle */}
      {result.state === 'idle' && (
        <div id="qr-reader" className="w-full rounded-xl overflow-hidden" />
      )}

      {/* Loading */}
      {result.state === 'loading' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Проверка билета...</p>
        </div>
      )}

      {/* Success */}
      {result.state === 'success' && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✅</span>
            <span className="text-green-400 text-lg font-semibold">Билет принят</span>
          </div>
          {result.eventTitle && (
            <p className="text-white/80 text-sm">{result.eventTitle}</p>
          )}
          <div className="flex gap-4 text-sm text-white/60">
            {result.tableNumber !== '' && <span>Стол: <span className="text-white">{result.tableNumber}</span></span>}
            {result.seats !== '' && <span>Мест: <span className="text-white">{result.seats}</span></span>}
          </div>
          <button
            onClick={reset}
            className="mt-2 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-80"
          >
            Сканировать следующий
          </button>
        </div>
      )}

      {/* Already used */}
      {result.state === 'already_used' && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            <span className="text-yellow-400 text-lg font-semibold">Билет уже использован</span>
          </div>
          <p className="text-white/60 text-sm">Этот билет был отсканирован ранее.</p>
          <button
            onClick={reset}
            className="mt-2 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-80"
          >
            Сканировать следующий
          </button>
        </div>
      )}

      {/* Invalid */}
      {result.state === 'invalid' && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">❌</span>
            <span className="text-red-400 text-lg font-semibold">Недействительный билет</span>
          </div>
          <p className="text-white/60 text-sm">Билет не найден, не оплачен или недействителен.</p>
          <button
            onClick={reset}
            className="mt-2 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-80"
          >
            Сканировать ещё раз
          </button>
        </div>
      )}

      {/* Error */}
      {result.state === 'error' && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">❌</span>
            <span className="text-red-400 text-lg font-semibold">Ошибка</span>
          </div>
          <p className="text-white/60 text-sm">{result.message}</p>
          <button
            onClick={reset}
            className="mt-2 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-80"
          >
            Попробовать снова
          </button>
        </div>
      )}
    </div>
  );
}
