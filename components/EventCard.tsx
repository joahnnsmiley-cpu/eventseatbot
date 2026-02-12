import React from 'react';
import type { EventData } from '../types';
import { UI_TEXT } from '../constants/uiText';

export type EventCardMode = 'user' | 'admin';

export interface EventCardProps {
  event: EventData;
  mode: EventCardMode;
  onClick?: () => void;
  /** When true, card is shown as selected (e.g. admin list). */
  selected?: boolean;
}

const statusLabel = (status?: string) => {
  const s = status ?? '';
  if (s === 'draft') return UI_TEXT.admin.draft;
  if (s === 'published') return UI_TEXT.admin.published;
  if (s === 'archived') return UI_TEXT.admin.archived;
  return '';
};

const formatDate = (dateStr?: string) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const datePart = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
  const timePart = hasTime ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
  return timePart ? `${datePart}, ${timePart}` : datePart;
};

const badgeClassByStatus: Record<string, string> = {
  draft: 'bg-[#E7E3DB] text-[#6E6A64]',
  published: 'bg-[#E7E3DB] text-[#6E6A64]',
  archived: 'bg-[#ECE6DD] text-[#9B948A]',
};

const EventCard: React.FC<EventCardProps> = ({ event, mode, onClick, selected = false }) => {
  // Cover = poster (imageUrl); layoutImageUrl is only for seating map, not shown on card
  const coverUrl = (event.imageUrl ?? (event as { coverImageUrl?: string | null }).coverImageUrl ?? '').trim();
  const title = event.title?.trim() || UI_TEXT.event.eventFallback;
  const dateFormatted = formatDate(event.date);
  const status = event.status ?? (event.published ? 'published' : 'draft');
  const badgeText = statusLabel(status);
  const isArchived = status === 'archived';
  const isClickable = mode === 'admin' || !isArchived;

  const cardClassName = `relative w-full text-left rounded-lg overflow-hidden border transition-all ${selected ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-2' : 'border-gray-200'} ${isClickable ? 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-[0.98] cursor-pointer hover:shadow-md' : 'cursor-default opacity-90'} ${coverUrl ? 'bg-surface' : 'bg-gradient-to-br from-slate-400 to-slate-600'}`;

  const content = (
    <>
      {coverUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${coverUrl})` }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/80 text-4xl" aria-hidden>
          📅
        </div>
      )}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"
        aria-hidden
      />
      {isArchived && (
        <div className="absolute inset-0 bg-black/50 z-[1]" aria-hidden />
      )}
      <div className="relative min-h-[120px] p-4 flex flex-col justify-end z-[2]">
        {mode === 'admin' && badgeText && (
          <span
            className={`absolute top-3 right-3 px-2 py-0.5 text-xs font-medium uppercase tracking-wide rounded-lg ${badgeClassByStatus[status] ?? badgeClassByStatus.draft}`}
            aria-label={UI_TEXT.admin.statusLabel}
          >
            {badgeText}
          </span>
        )}
        <div className="font-semibold text-white text-lg drop-shadow-md">
          {title}
        </div>
        {dateFormatted && (
          <div className="text-sm text-white/90 drop-shadow mt-0.5">
            {dateFormatted}
          </div>
        )}
      </div>
    </>
  );

  if (isClickable) {
    return (
      <button type="button" onClick={onClick} className={cardClassName}>
        {content}
      </button>
    );
  }

  return <div className={cardClassName} role="presentation">{content}</div>;
};

/** Skeleton placeholder for event list loading (same proportions as EventCard). */
export const EventCardSkeleton: React.FC = () => (
  <div
    className="w-full rounded-lg overflow-hidden border border-gray-200 bg-surface min-h-[120px] animate-pulse flex flex-col justify-end p-4"
    aria-hidden
  >
    <div className="h-5 bg-gray-300 rounded w-3/4 max-w-[200px] mb-2" />
    <div className="h-4 bg-gray-300 rounded w-1/2 max-w-[140px]" />
  </div>
);

export default EventCard;
