import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Clock, CreditCard, Copy, ChevronRight, AlertCircle } from 'lucide-react';
import type { EventData, Booking } from '../types';
import { getPriceForTable } from '../src/utils/getTablePrice';
import { getEventDisplayParts, getEventDisplayPartsFromIso } from '../src/utils/formatDate';
import { UI_TEXT } from '../constants/uiText';
import * as StorageService from '../services/storageService';

export interface BookingSuccessViewProps {
  event: EventData;
  booking: Booking;
  onStatusUpdate?: (booking: Booking) => void;
  onBackToEvents?: () => void;
  onGoToTickets?: () => void;
}

const formatEventDate = (event: EventData): { date: string; time: string } => {
  const offset = (event as any).timezoneOffsetMinutes ?? 180;
  if (event.event_date) {
    const parts = getEventDisplayParts(event.event_date, event.event_time ?? undefined, offset);
    return parts ? { date: parts.date, time: parts.time } : { date: '—', time: '' };
  }
  if (event.date) {
    const parts = getEventDisplayPartsFromIso(event.date, offset);
    return parts ? { date: parts.date, time: parts.time } : { date: '—', time: '' };
  }
  return { date: '—', time: '' };
};

const formatTablesAndSeats = (booking: Booking, event: EventData): string => {
  const tables = event.tables ?? [];
  const getTableNumber = (tableId: string) => {
    const t = tables.find((x) => x.id === tableId);
    return t?.number ?? tableId;
  };
  if (Array.isArray(booking.tableBookings) && booking.tableBookings.length > 0) {
    return booking.tableBookings
      .map((tb) => `Стол ${getTableNumber(tb.tableId)}: ${tb.seats} мест`)
      .join('; ');
  }
  if (Array.isArray(booking.seatIds) && booking.seatIds.length > 0) {
    const byTable: Record<string, number[]> = {};
    for (const id of booking.seatIds) {
      const [tableId, seatId] = id.split('-');
      if (!tableId) continue;
      const num = parseInt(seatId ?? '', 10);
      if (!byTable[tableId]) byTable[tableId] = [];
      if (!Number.isNaN(num)) byTable[tableId].push(num);
    }
    return Object.entries(byTable)
      .map(([tid, seats]) => `Стол ${getTableNumber(tid)}: места ${seats.sort((a, b) => a - b).join(', ')}`)
      .join('; ');
  }
  const count = booking.seatsCount ?? booking.seatIds?.length ?? 0;
  return count > 0 ? `${count} мест` : '—';
};

/** Reusable countdown hook */
function useCountdown(expiresAt?: string | number | null): number {
  const target = expiresAt
    ? typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : Number(expiresAt)
    : 0;
  const [remaining, setRemaining] = useState(() => target > 0 ? Math.max(0, target - Date.now()) : 0);
  useEffect(() => {
    if (target <= 0) return;
    const id = setInterval(() => setRemaining(Math.max(0, target - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);
  return remaining;
}

const BookingSuccessView: React.FC<BookingSuccessViewProps> = ({
  event,
  booking,
  onStatusUpdate,
  onBackToEvents,
  onGoToTickets,
}) => {
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isAwaitingPayment = booking.status === 'reserved' || booking.status === 'pending';
  const isAwaitingConfirmation = booking.status === 'awaiting_confirmation' || booking.status === 'payment_submitted';
  const showPaidButton = isAwaitingPayment;

  const expiresAt = (booking as any).expiresAt;
  const remainingMs = useCountdown(expiresAt);
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const isExpired = remainingMs <= 0 && !!expiresAt;
  const isUrgent = remainingMs > 0 && remainingMs < 5 * 60_000;

  const { date, time } = formatEventDate(event);
  const venue = (event as { venue?: string }).venue ?? '';
  const tablesAndSeats = formatTablesAndSeats(booking, event);

  const seatCount = booking.tableBookings?.reduce((s, tb) => s + (tb.seats ?? 0), 0)
    ?? booking.seatIds?.length ?? 0;
  const tableId = booking.tableId ?? booking.tableBookings?.[0]?.tableId;
  const table = tableId ? (event.tables ?? []).find((t) => t.id === tableId) : null;
  const seatPriceFallback = event?.ticketCategories?.find((c) => c.isActive)?.price ?? 0;
  const price = getPriceForTable(event, table ?? undefined, seatPriceFallback);
  const displayTotal = booking.totalAmount && booking.totalAmount > 0
    ? booking.totalAmount : seatCount * price;

  const handlePaidClick = async () => {
    setStatusUpdateError(null);
    setStatusUpdateLoading(true);
    try {
      const { booking: updated } = await StorageService.updateBookingStatus(booking.id, 'awaiting_confirmation');
      onStatusUpdate?.({ ...booking, ...updated });
    } catch (e) {
      setStatusUpdateError(e instanceof Error ? e.message : UI_TEXT.common.errors.default);
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const copyPhone = () => {
    if (event.paymentPhone) {
      navigator.clipboard.writeText(event.paymentPhone.trim()).catch(() => { });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen w-full" style={{ background: '#090909' }}>
      <div className="max-w-md mx-auto px-4 pt-8 pb-32 space-y-4">

        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-3 pt-4 pb-2"
        >
          {/* Animated check circle */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="relative"
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0.05) 100%)',
                border: '1.5px solid rgba(212,175,55,0.35)',
                boxShadow: '0 0 40px rgba(212,175,55,0.12)',
              }}
            >
              <CheckCircle2 size={36} strokeWidth={1.5} style={{ color: '#D4AF37' }} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="text-center"
          >
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Бронь создана
            </h1>
            <p className="text-sm text-white/40 mt-1">
              {event.title}
            </p>
          </motion.div>
        </motion.div>

        {/* ── Status / Awaiting confirmation banner ── */}
        <AnimatePresence mode="wait">
          {isAwaitingConfirmation && (
            <motion.div
              key="awaiting"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl px-4 py-4 flex items-start gap-3"
              style={{
                background: 'rgba(212,175,55,0.07)',
                border: '1px solid rgba(212,175,55,0.2)',
              }}
            >
              <Clock size={18} strokeWidth={2} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Ожидаем подтверждения оплаты</p>
                <p className="text-xs text-white/40 mt-0.5">Организатор проверит платёж и подтвердит бронь</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Countdown ── */}
        {isAwaitingPayment && !!expiresAt && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
            style={{
              background: isExpired
                ? 'rgba(220,38,38,0.08)'
                : isUrgent
                  ? 'rgba(251,146,60,0.08)'
                  : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isExpired ? 'rgba(220,38,38,0.25)' : isUrgent ? 'rgba(251,146,60,0.25)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <Clock
              size={16}
              strokeWidth={2}
              className={isExpired ? 'text-red-400' : isUrgent ? 'text-orange-400' : 'text-white/30'}
            />
            {isExpired ? (
              <span className="text-sm font-semibold text-red-400">Время брони истекло</span>
            ) : (
              <>
                <span className="text-xs text-white/40">Бронь действует ещё</span>
                <span
                  className={`ml-auto font-mono font-bold tabular-nums text-base ${isUrgent ? 'text-orange-400' : 'text-white/70'}`}
                >
                  {mins}:{secs.toString().padStart(2, '0')}
                </span>
              </>
            )}
          </motion.div>
        )}

        {/* ── Event info card ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <div className="px-4 py-4 space-y-2.5">
            <Row label="Дата" value={`${date}${time ? ` · ${time}` : ''}`} highlight />
            {venue && <Row label="Место" value={venue} />}
            <Row label="Места" value={tablesAndSeats} />
            {displayTotal > 0 && (
              <Row label="К оплате" value={`${displayTotal.toLocaleString('ru-RU')} ₽`} highlight />
            )}
            <Row label="Бронь №" value={booking.id} mono small />
          </div>
        </motion.div>

        {/* ── Payment details ── */}
        {event.paymentPhone?.trim() && isAwaitingPayment && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(212,175,55,0.05)',
              border: '1px solid rgba(212,175,55,0.18)',
            }}
          >
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard size={15} strokeWidth={2} className="text-amber-400/80" />
                <span className="text-xs font-semibold uppercase tracking-widest text-amber-400/80">
                  Оплата по СБП
                </span>
              </div>

              {/* Phone number — large, copyable */}
              <button
                type="button"
                onClick={copyPhone}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 transition-all active:scale-[0.98]"
                style={{
                  background: 'rgba(212,175,55,0.08)',
                  border: '1px solid rgba(212,175,55,0.15)',
                }}
              >
                <span className="text-xl font-bold font-mono text-white tracking-wide">
                  {event.paymentPhone.trim()}
                </span>
                <span className="flex items-center gap-1 text-xs text-amber-400/70">
                  <Copy size={13} strokeWidth={2} />
                  {copied ? 'Скопировано' : 'Копировать'}
                </span>
              </button>

              <div className="space-y-1.5 text-xs text-white/40 leading-relaxed">
                <p>Укажите в комментарии: <span className="text-white/60 font-medium">ФИО и № брони</span></p>
                <p className="font-medium text-amber-400/70">
                  После перевода обязательно нажмите «Я оплатил» ниже
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Error ── */}
        {statusUpdateError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl px-3 py-2.5 flex items-center gap-2"
            style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)' }}
          >
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{statusUpdateError}</p>
          </motion.div>
        )}

        {/* ── CTA buttons ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="flex flex-col gap-3 pt-1"
        >
          {showPaidButton && (
            <button
              type="button"
              onClick={handlePaidClick}
              disabled={statusUpdateLoading}
              className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: statusUpdateLoading
                  ? 'rgba(212,175,55,0.2)'
                  : 'linear-gradient(135deg, #D4AF37 0%, #F5D76E 50%, #C9A227 100%)',
                color: '#0a0a0a',
                boxShadow: statusUpdateLoading ? 'none' : '0 4px 24px rgba(212,175,55,0.3)',
              }}
            >
              {statusUpdateLoading ? 'Отправляем…' : '✓ Я оплатил'}
            </button>
          )}

          <button
            type="button"
            onClick={onGoToTickets ?? onBackToEvents}
            className="w-full py-3.5 rounded-2xl text-sm font-medium transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.75)',
            }}
          >
            Мои билеты
            <ChevronRight size={15} strokeWidth={2} className="opacity-50" />
          </button>

          <button
            type="button"
            onClick={onBackToEvents}
            className="w-full py-2.5 rounded-2xl text-sm font-medium text-white/30 transition-all duration-200 active:scale-[0.98] hover:text-white/50"
          >
            {UI_TEXT.booking.backToEvents}
          </button>
        </motion.div>
      </div>
    </div>
  );
};

/** Simple two-column info row */
const Row: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
  small?: boolean;
}> = ({ label, value, highlight, mono, small }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-xs text-white/30 shrink-0 pt-px">{label}</span>
    <span
      className={`text-right break-all leading-snug ${small ? 'text-[10px]' : 'text-sm'
        } ${mono ? 'font-mono' : 'font-medium'} ${highlight ? 'text-amber-300' : 'text-white/80'
        }`}
    >
      {value}
    </span>
  </div>
);

export default BookingSuccessView;
