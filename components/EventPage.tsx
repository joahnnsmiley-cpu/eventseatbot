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

  console.log('EVENT DATA:', event);

  return (
    <div className="max-w-md mx-auto min-h-screen relative">
      <div className="px-4 pt-6 space-y-8 pb-24">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-xs px-2 py-1 rounded border border-white/20 text-muted-light"
          >
            {UI_TEXT.app.back}
          </button>
          <button onClick={onRefresh} className="text-xs px-2 py-1 rounded border border-white/20 text-muted-light">
            {UI_TEXT.app.refresh}
          </button>
        </div>

        {eventLoading && <div className="text-xs text-muted">{UI_TEXT.app.loadingLayout}</div>}
        {eventError && <div className="text-sm text-red-400">{eventError}</div>}

        <div className="relative rounded-3xl overflow-hidden min-h-[220px]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: imgUrl?.trim() ? `url(${imgUrl.trim()})` : undefined }}
          />
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 flex flex-col justify-end p-6 pb-6 min-h-[220px]">
            <h1 className="text-2xl font-bold text-white">
              {event.title?.trim() || UI_TEXT.event.eventFallback}
            </h1>
            {event.description != null && event.description.trim() !== '' && (
              <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">
                {event.description.trim()}
              </p>
            )}
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
                <p className="text-muted-light">
                  {venue?.trim()}
                </p>
              )}
            </div>
          </Card>
        )}

        <div className="relative w-full -mx-4">
          <SectionTitle title="Выбор столов" className="px-4" />
          <SeatMap
            key={`seatmap-${event?.id}-${(event?.tables ?? []).map((t) => t.id).join('-')}`}
            event={event}
            tables={event?.tables ?? []}
            selectedSeatsByTable={selectedSeatsByTable}
            onTableSelect={onTableSelect}
          />
        </div>

        <PrimaryButton onClick={() => {
          console.log('[CONFIRM CLICKED]');
          const firstTable = event.tables?.find((t) => t.is_active !== false);
          if (firstTable) onTableSelect(firstTable.id);
        }} className="w-full">
          Перейти к бронированию
        </PrimaryButton>

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
            <div className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 space-y-4">
              <div>
                <p className="text-base font-medium text-white">Связаться с организатором</p>
                <p className="text-sm text-muted-light mt-1">{UI_TEXT.event.contactOrganizerPrompt}</p>
              </div>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full border border-neutral-700 text-neutral-300 bg-transparent hover:bg-neutral-800 rounded-xl py-3 text-sm font-medium inline-flex items-center justify-center transition"
              >
                Связаться с организатором
              </a>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default EventPage;
