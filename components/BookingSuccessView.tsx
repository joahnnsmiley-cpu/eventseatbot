import React, { useState } from 'react';
import type { EventData, Booking } from '../types';
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

const formatEventDate = (dateStr?: string): { date: string; time: string } => {
  if (!dateStr || typeof dateStr !== 'string') return { date: '—', time: '' };
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return { date: dateStr, time: '' };
    const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
    const time = hasTime ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    return { date, time };
  } catch {
    return { date: dateStr, time: '' };
  }
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
  const tablesAndSeats = formatTablesAndSeats(booking, event);
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

  const { date, time } = formatEventDate(event.date);
  const venue = (event as { venue?: string }).venue ?? 'Площадка';

  return (
    <div className="max-w-md mx-auto px-4 pt-16 pb-24 space-y-10 text-center">
      <div className="mx-auto w-16 h-16 rounded-full border border-[#FFC107] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full bg-[#FFC107]" />
      </div>

      <h1 className="text-2xl font-bold text-white">
        Бронирование подтверждено
      </h1>

      <p className="text-gray-400 text-sm">
        Ваш стол успешно зарезервирован.
        Детали доступны в разделе «Мои билеты».
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
          <p className="text-gray-400">
            {venue}
          </p>
        </div>
      </Card>

      <Card>
        <div className="space-y-2 text-sm text-left">
          <p className="text-gray-500 text-xs">
            {UI_TEXT.app.bookingNumber} {booking.id}
          </p>
          <p className="text-gray-500 text-xs">
            {UI_TEXT.app.seats} {tablesAndSeats}
          </p>
          {!isAwaitingPayment && (
            <p className="text-gray-500 text-xs">
              {UI_TEXT.app.status} {statusLabel}
            </p>
          )}
        </div>
      </Card>

      {event.paymentPhone != null && event.paymentPhone.trim() !== '' && isAwaitingPayment && (
        <Card>
          <div className="space-y-2 text-sm text-left">
            <div className="text-white font-semibold">{UI_TEXT.booking.paymentDetailsTitle}</div>
            <p className="text-gray-400">
              {UI_TEXT.booking.paymentTransferTo} <span className="text-white font-medium">{event.paymentPhone.trim()}</span>
            </p>
            <p className="text-gray-400">
              {UI_TEXT.booking.paymentPurpose} {booking.id}
            </p>
          </div>
        </Card>
      )}

      <p className="text-gray-400 text-sm whitespace-pre-wrap text-left">{UI_TEXT.booking.paymentPrompt}</p>

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
            className="w-full px-4 py-3 text-sm font-medium text-white bg-[#0088cc] rounded-xl hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {statusUpdateLoading ? UI_TEXT.common.loading : UI_TEXT.booking.paidButton}
          </button>
        )}
        <PrimaryButton onClick={onGoToTickets ?? onBackToEvents} className="w-full">
          Перейти к билетам
        </PrimaryButton>
        <button
          type="button"
          onClick={onBackToEvents}
          className="w-full px-4 py-2 text-sm font-medium text-gray-400 border border-white/20 rounded-xl hover:bg-white/5 transition"
        >
          {UI_TEXT.booking.backToEvents}
        </button>
      </div>
    </div>
  );
};

export default BookingSuccessView;
