import React from 'react';
import type { EventData } from '../types';
import Card from '../src/ui/Card';
import SectionTitle from '../src/ui/SectionTitle';
import PrimaryButton from '../src/ui/PrimaryButton';
import SeatMap from './SeatMap';
import { UI_TEXT } from '../constants/uiText';

/** Format event date as "11 февраля 2026 г. · 01:58" */
function formatEventDisplayDate(dateStr?: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const datePart = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
  const timePart = hasTime ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
  return timePart ? `${datePart} · ${timePart}` : datePart;
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
  const dateField = (event as { start_time?: string; event_date?: string }).start_time
    ?? (event as { start_time?: string; event_date?: string }).event_date
    ?? event.date;
  const dateFormatted = formatEventDisplayDate(dateField);
  const venue = (event as { venue?: string }).venue ?? 'Площадка';

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

        <Card>
          <div className="space-y-2 text-sm">
            <p className="text-[#FFC107] font-semibold">
              {dateFormatted}
            </p>
            <p className="text-gray-400">
              {venue}
            </p>
          </div>
        </Card>

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
            <div className="p-4 rounded-2xl border border-white/10 bg-[#0B0B0B] space-y-2">
              <p className="text-sm text-gray-400">{UI_TEXT.event.contactOrganizerPrompt}</p>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-[#0088cc] rounded-lg hover:opacity-90"
              >
                {UI_TEXT.event.contactOrganizerButton}
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
