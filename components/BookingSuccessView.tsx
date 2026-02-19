import React, { useState, useEffect } from 'react';
import type { EventData, Booking } from '../types';
import { getPriceForTable } from '../src/utils/getTablePrice';
import { getEventDisplayParts, getEventDisplayPartsFromIso } from '../src/utils/formatDate';
import { UI_TEXT } from '../constants/uiText';
import * as StorageService from '../services/storageService';
import Card from '../src/ui/Card';
import PrimaryButton from '../src/ui/PrimaryButton';

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
      .map((tb) => `Стол ${getTableNumber(tb.tableId)}: ${tb.seats} ${tb.seats === 1 ? 'место' : 'мест'}`)
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
    const parts = Object.entries(byTable).map(([tid, seats]) => {
      const nums = seats.sort((a, b) => a - b);
      return `Стол ${getTableNumber(tid)}: места ${nums.join(', ')}`;
    });
    return parts.join('; ');
  }

  const count = booking.seatsCount ?? booking.seatIds?.length ?? 0;
  return count > 0 ? `${count} ${count === 1 ? 'место' : 'мест'}` : '—';
};

const BookingSuccessView: React.FC<BookingSuccessViewProps> = ({
  event,
  booking,
  onStatusUpdate,
  onBackToEvents,
  onGoToTickets,
}) => {
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const tablesAndSeats = formatTablesAndSeats(booking, event);

  useEffect(() => {
    if (!isAwaitingPayment) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isAwaitingPayment]);
  const isAwaitingPayment = booking.status === 'reserved' || booking.status === 'pending';
  const isAwaitingConfirmation = booking.status === 'awaiting_confirmation';
  const showPaidButton = isAwaitingPayment && !isAwaitingConfirmation;
  const statusLabel = UI_TEXT.booking.statusLabels[booking.status] ?? booking.status ?? '—';

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

  const { date, time } = formatEventDate(event);
  const venue = (event as { venue?: string }).venue ?? 'Площадка';

  return (
    <div className="max-w-md mx-auto px-4 pt-6 pb-4 space-y-5 text-center">
      <div className="mx-auto w-16 h-16 rounded-full border border-[#FFC107] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full bg-[#FFC107]" />
      </div>

      <h1 className="text-xl font-bold text-white">
        {UI_TEXT.booking.bookingCreated}
      </h1>

      <p className="text-muted-light text-xs">
        {UI_TEXT.booking.bookingValidMinutes}
      </p>

      <div className="w-12 h-[2px] bg-[#FFC107] mx-auto" />

      <Card>
        <div className="space-y-2 text-sm">
          <p className="text-white font-semibold">
            {event.title?.trim() || '—'}
          </p>
          <p className="text-[#FFC107]">
            {date}{time ? ` • ${time}` : ''}
          </p>
          <p className="text-muted-light">
            {venue}
          </p>
        </div>
      </Card>

      {isAwaitingPayment && (() => {
        const expiresAt = (booking as { expiresAt?: string | number }).expiresAt;
        const target = expiresAt ? (typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : Number(expiresAt)) : 0;
        const diffMs = Number.isFinite(target) ? Math.max(0, target - nowTick) : 0;
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        const expired = diffMs <= 0;
        return (
          <Card className={expired ? 'border-amber-500/50' : ''}>
            <div className="text-center">
              <p className="text-xs text-muted-light mb-1">{UI_TEXT.booking.bookingValidMinutes}</p>
              <p className={`text-2xl font-mono font-bold ${expired ? 'text-amber-400' : 'text-[#FFC107]'}`}>
                {expired ? '0:00' : `${mins}:${secs.toString().padStart(2, '0')}`}
              </p>
            </div>
          </Card>
        );
      })()}

      <Card>
        <div className="space-y-2 text-sm text-left">
          <p className="text-muted text-xs">
            {UI_TEXT.app.bookingNumber} {booking.id}
          </p>
          <p className="text-muted text-xs">
            {UI_TEXT.app.seats} {tablesAndSeats}
          </p>
          {(() => {
            const seatCount = booking.tableBookings?.reduce((sum, tb) => sum + (tb.seats ?? 0), 0)
              ?? booking.seatIds?.length ?? 0;
            const tableId = booking.tableId ?? booking.tableBookings?.[0]?.tableId;
            const table = tableId ? (event.tables ?? []).find((t) => t.id === tableId) : null;
            const seatPriceFallback = event?.ticketCategories?.find((c) => c.isActive)?.price ?? 0;
            const price = getPriceForTable(event, table ?? undefined, seatPriceFallback);
            const total = seatCount * price;
            const displayTotal = booking.totalAmount && booking.totalAmount > 0
              ? booking.totalAmount
              : total;
            return displayTotal > 0 ? (
              <p className="text-muted text-xs">
                {UI_TEXT.app.total} {displayTotal.toLocaleString('ru-RU')} ₽
              </p>
            ) : null;
          })()}
          {!isAwaitingPayment && (
            <p className="text-muted text-xs">
              {UI_TEXT.app.status} {statusLabel}
            </p>
          )}
        </div>
      </Card>

      {event.paymentPhone != null && event.paymentPhone.trim() !== '' && isAwaitingPayment && (
        <Card>
          <div className="space-y-2 text-sm text-left">
            <div className="text-white font-semibold">{UI_TEXT.booking.paymentDetailsTitle}</div>
            {(() => {
              const seatCount = booking.tableBookings?.reduce((sum, tb) => sum + (tb.seats ?? 0), 0)
                ?? booking.seatIds?.length ?? 0;
              const tableId = booking.tableId ?? booking.tableBookings?.[0]?.tableId;
              const table = tableId ? (event.tables ?? []).find((t) => t.id === tableId) : null;
              const seatPriceFallback = event?.ticketCategories?.find((c) => c.isActive)?.price ?? 0;
              const price = getPriceForTable(event, table ?? undefined, seatPriceFallback);
              const total = seatCount * price;
              const displayTotal = booking.totalAmount && booking.totalAmount > 0 ? booking.totalAmount : total;
              return displayTotal > 0 ? (
                <p className="text-[#FFC107] font-semibold">К оплате: {displayTotal.toLocaleString('ru-RU')} ₽</p>
              ) : null;
            })()}
            <p className="text-muted-light">
              {UI_TEXT.booking.paymentTransferTo} <span className="text-white font-medium">{event.paymentPhone.trim()} {UI_TEXT.booking.paymentPhoneSberbank}</span>
            </p>
            <p className="text-muted-light">
              {UI_TEXT.booking.paymentPurpose} {booking.id}
            </p>
          </div>
        </Card>
      )}

      <p className="text-muted-light text-sm whitespace-pre-wrap text-left">{UI_TEXT.booking.paymentPrompt}</p>
      <p className="text-amber-300 text-sm font-semibold uppercase tracking-wide whitespace-pre-wrap text-left mt-2">{UI_TEXT.booking.paymentPromptCaps}</p>
      <p className="text-muted-light text-xs whitespace-pre-wrap text-left mt-1">{UI_TEXT.booking.paymentPromptOrder}</p>

      {isAwaitingConfirmation && (
        <p className="text-sm text-[#6E6A64] bg-[#E7E3DB] rounded-lg p-3 text-left">{UI_TEXT.booking.awaitingConfirmationMessage}</p>
      )}

      {statusUpdateError && (
        <p className="text-sm text-red-400">{statusUpdateError}</p>
      )}

      <div className="flex flex-col gap-3">
        {showPaidButton && (
          <button
            type="button"
            onClick={handlePaidClick}
            disabled={statusUpdateLoading}
            className="w-full px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white bg-[#0088cc] rounded-xl hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {statusUpdateLoading ? UI_TEXT.common.loading : UI_TEXT.booking.paidButtonCaps}
          </button>
        )}
        <PrimaryButton onClick={onGoToTickets ?? onBackToEvents} className="w-full">
          Перейти к билетам
        </PrimaryButton>
        <button
          type="button"
          onClick={onBackToEvents}
          className="w-full px-4 py-2 text-sm font-medium text-muted-light border border-white/20 rounded-xl hover:bg-white/5 transition"
        >
          {UI_TEXT.booking.backToEvents}
        </button>
      </div>
    </div>
  );
};

export default BookingSuccessView;
