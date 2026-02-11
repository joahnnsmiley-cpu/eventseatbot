import React, { useState } from 'react';
import type { EventData, Booking } from '../types';
import { UI_TEXT } from '../constants/uiText';
import * as StorageService from '../services/storageService';

export interface BookingSuccessViewProps {
  event: EventData;
  booking: Booking;
  onStatusUpdate?: (booking: Booking) => void;
  onBackToEvents?: () => void;
}

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

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">{UI_TEXT.booking.successTitle}</h1>
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div>
          <span className="text-xs text-gray-500">{UI_TEXT.app.bookingNumber}</span>
          <span className="text-sm font-medium ml-1">{booking.id}</span>
        </div>
        <div>
          <span className="text-xs text-gray-500">Событие:</span>
          <span className="text-sm font-medium ml-1">{event.title?.trim() || '—'}</span>
        </div>
        <div>
          <span className="text-xs text-gray-500">{UI_TEXT.app.seats}</span>
          <span className="text-sm ml-1">{tablesAndSeats}</span>
        </div>
        {!isAwaitingPayment && (
          <div>
            <span className="text-xs text-gray-500">{UI_TEXT.app.status}</span>
            <span className="text-sm font-medium ml-1">{statusLabel}</span>
          </div>
        )}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
        <div className="text-sm font-medium text-gray-900">{UI_TEXT.booking.paymentDetailsTitle}</div>
        {event.paymentPhone != null && event.paymentPhone.trim() !== '' ? (
          <>
            <p className="text-sm text-gray-700">
              {UI_TEXT.booking.paymentTransferTo} <span className="font-medium">{event.paymentPhone.trim()}</span>
            </p>
            <p className="text-sm text-gray-700">
              {UI_TEXT.booking.paymentPurpose} {booking.id}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-600">{UI_TEXT.booking.paymentNoPhoneFallback}</p>
        )}
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{UI_TEXT.booking.paymentPrompt}</p>
      {isAwaitingConfirmation && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">{UI_TEXT.booking.awaitingConfirmationMessage}</p>
      )}
      {statusUpdateError && (
        <p className="text-sm text-red-600">{statusUpdateError}</p>
      )}
      <div className="flex flex-col gap-2">
        {showPaidButton && (
          <button
            type="button"
            onClick={handlePaidClick}
            disabled={statusUpdateLoading}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-[#0088cc] rounded-lg hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {statusUpdateLoading ? UI_TEXT.common.loading : UI_TEXT.booking.paidButton}
          </button>
        )}
        <button
          type="button"
          onClick={onBackToEvents}
          className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          {UI_TEXT.booking.backToEvents}
        </button>
      </div>
    </div>
  );
};

export default BookingSuccessView;
