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

  let verifyData: { valid?: boolean; is_used?: boolean; eventTitle?: string; tableNumber?: number | string; seats?: number | string; bookingId?: string };
  try {
    const r = await fetch(`${apiBase}/verify-ticket/${encodeURIComponent(token)}`);
    verifyData = await r.json();
  } catch {
    return { state: 'error', message: 'Нет соединения с сервером' };
  }

  if (!verifyData.valid) {
    return verifyData.is_used ? { state: 'already_used' } : { state: 'invalid' };
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

export default function ControllerScannerScreen() {
  const [result, setResult] = useState<ScanResult>({ state: 'idle' });
  const [cameraError, setCameraError] = useState<string | null>(null);

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
      <div className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: '1', display: isIdle ? 'block' : 'none' }}>
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
              {result.tableNumber !== '' && <span>Стол <span className="text-white font-semibold">{result.tableNumber}</span></span>}
              {result.seats !== '' && <span>Мест <span className="text-white font-semibold">{result.seats}</span></span>}
            </div>
            <button onClick={reset} className="mt-1 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
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
            <button onClick={reset} className="mt-1 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
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
            <button onClick={reset} className="mt-1 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
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
            <button onClick={reset} className="mt-1 w-full py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-medium active:opacity-70">
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
