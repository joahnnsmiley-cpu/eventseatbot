import React from 'react';
import type { EventData } from '../types';
import Card from '../src/ui/Card';
import SectionTitle from '../src/ui/SectionTitle';
import PrimaryButton from '../src/ui/PrimaryButton';
import SeatMap from './SeatMap';
import { UI_TEXT } from '../constants/uiText';

/** Format event_date + event_time as "11 февраля 2026 г. · 01:58" (ru-RU). Returns empty string if either missing. */
function formatEventDateTime(dateStr?: string | null, timeStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string' || !timeStr || typeof timeStr !== 'string') return '';
  const d = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const timePart = String(timeStr).slice(0, 5); // HH:mm
  return `${datePart} · ${timePart}`;
}

export interface EventPageProps {
  event: EventData;
  selectedSeatsByTable: Record<string, number[]>;
  onBack: () => void;
  onRefresh: () => void;
  onTableSelect: (tableId: string) => void;
  eventLoading?: boolean;
  eventError?: string | null;
}

const EventPage: React.FC<EventPageProps> = ({
  event,
  selectedSeatsByTable,
  onBack,
  onRefresh,
  onTableSelect,
  eventLoading = false,
  eventError = null,
}) => {
  const imgUrl = event.imageUrl ?? (event as { image_url?: string }).image_url ?? '';
  const eventDate = event.event_date ?? null;
  const eventTime = event.event_time ?? null;
  const venue = event.venue ?? null;
  const displayDateTime = formatEventDateTime(eventDate, eventTime);
  const showDateTime = Boolean(eventDate && eventTime);
  const showVenue = Boolean(venue && String(venue).trim());

  return (
    <div className="max-w-md mx-auto min-h-screen relative">
      <div className="px-4 pt-6 space-y-8 pb-24">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-xs px-2 py-1 rounded border border-white/20 text-gray-400"
          >
            {UI_TEXT.app.back}
          </button>
          <button onClick={onRefresh} className="text-xs px-2 py-1 rounded border border-white/20 text-gray-400">
            {UI_TEXT.app.refresh}
          </button>
        </div>

        {eventLoading && <div className="text-xs text-gray-500">{UI_TEXT.app.loadingLayout}</div>}
        {eventError && <div className="text-sm text-red-400">{eventError}</div>}

        <div className="relative rounded-3xl overflow-hidden h-[220px]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: imgUrl?.trim() ? `url(${imgUrl.trim()})` : undefined }}
          />
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 h-full flex flex-col justify-end p-6">
            <h1 className="text-2xl font-bold text-white">
              {event.title?.trim() || UI_TEXT.event.eventFallback}
            </h1>
          </div>
        </div>

        {(showDateTime || showVenue) && (
          <Card>
            <div className="space-y-2 text-sm">
              {showDateTime && (
                <p className="text-[#FFC107] font-semibold">
                  {displayDateTime}
                </p>
              )}
              {showVenue && (
                <p className="text-gray-400">
                  {venue?.trim()}
                </p>
              )}
            </div>
          </Card>
        )}

        <div>
          <SectionTitle title="Выбор столов" />
          <Card>
            <SeatMap
              event={event}
              selectedSeatsByTable={selectedSeatsByTable}
              onTableSelect={onTableSelect}
            />
          </Card>
        </div>

        {event.description != null && event.description.trim() !== '' && (
          <p className="text-sm text-gray-400 whitespace-pre-wrap">
            {event.description.trim()}
          </p>
        )}

        {(() => {
          const placeholder = 'eventseatbot_support';
          const raw = event.adminTelegramId ?? placeholder;
          const contactTarget = typeof raw === 'string' ? raw.trim() : '';
          if (!contactTarget) return null;
          const username = contactTarget.replace(/^@/, '');
          const href = /^\d+$/.test(username)
            ? `https://t.me/+${username}`
            : `https://t.me/${username}`;
          return (
            <div className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900 shadow-sm space-y-4">
              <div>
                <p className="text-base font-medium text-white">Связаться с организатором</p>
                <p className="text-sm text-gray-400 mt-1">{UI_TEXT.event.contactOrganizerPrompt}</p>
              </div>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full bg-[#FFC107] text-black font-semibold rounded-xl px-6 py-3 transition active:scale-95"
              >
                Связаться с организатором
              </a>
            </div>
          );
        })()}

        <PrimaryButton onClick={() => {
          console.log('[CONFIRM CLICKED]');
          const firstTable = event.tables?.find((t) => t.is_active !== false);
          if (firstTable) onTableSelect(firstTable.id);
        }} className="w-full">
          Перейти к бронированию
        </PrimaryButton>
      </div>
    </div>
  );
};

export default EventPage;
