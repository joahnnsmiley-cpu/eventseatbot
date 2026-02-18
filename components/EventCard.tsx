import React from 'react';
import type { EventData } from '../types';
import { UI_TEXT } from '../constants/uiText';
import Skeleton from '../src/ui/Skeleton';

export type EventCardMode = 'user' | 'admin';

export interface EventCardProps {
  event: EventData;
  mode: EventCardMode;
  onClick?: () => void;
  /** When true, card is shown as selected (e.g. admin list). */
  selected?: boolean;
  /** When provided (admin mode), shows delete button. Called with event.id on click. */
  onDelete?: (eventId: string) => void;
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

const EventCard: React.FC<EventCardProps> = ({ event, mode, onClick, selected = false, onDelete }) => {
  // Cover = poster (imageUrl); layoutImageUrl is only for seating map, not shown on card
  const coverUrl = (event.imageUrl ?? (event as { coverImageUrl?: string | null }).coverImageUrl ?? '').trim();
  const title = event.title?.trim() || UI_TEXT.event.eventFallback;
  let dateFormatted: string | null = null;
  if (event.event_date) {
    const datePart = new Date(event.event_date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (event.event_time) {
      const time = event.event_time.slice(0, 5); // HH:mm
      dateFormatted = `${datePart}, ${time}`;
    } else {
      dateFormatted = datePart;
    }
  } else {
    dateFormatted = formatDate(event.date);
  }
  const status = event.status ?? (event.published ? 'published' : 'draft');
  const badgeText = statusLabel(status);
  const isArchived = status === 'archived';
  const isClickable = mode === 'admin' || !isArchived;

  const cardClassName = `relative w-full text-left overflow-hidden rounded-2xl border transition-all duration-200 ${selected ? 'border-[#C6A75E] ring-2 ring-[#C6A75E]/40 ring-offset-2' : 'border-white/10'} ${isClickable ? 'focus:outline-none focus:ring-2 focus:ring-[#C6A75E]/50 focus:ring-offset-2 active:scale-[0.98] cursor-pointer hover:shadow-lg hover:-translate-y-0.5' : 'cursor-default opacity-90'} ${coverUrl ? 'bg-surface' : 'bg-gradient-to-br from-slate-400 to-slate-600'}`;

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
            className="absolute top-3 right-3 px-2 py-1 text-xs rounded-md bg-[#E7E3DB] text-[#6E6A64]"
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

  const deleteButton = mode === 'admin' && onDelete && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onDelete(event.id);
      }}
      className="absolute bottom-3 right-3 z-10 px-4 py-2 text-sm rounded-xl text-red-400 border border-red-400/30 hover:bg-red-500/10 transition-colors"
    >
      {UI_TEXT.admin.deleteEvent}
    </button>
  );

  if (isClickable) {
    return (
      <div className="relative">
        <button type="button" onClick={onClick} className={cardClassName}>
          {content}
        </button>
        {deleteButton}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className={cardClassName} role="presentation">{content}</div>
      {deleteButton}
    </div>
  );
};

/** Skeleton placeholder for event list loading (same proportions as EventCard). */
export const EventCardSkeleton: React.FC = () => (
    <div
      className="w-full rounded-2xl overflow-hidden border border-white/10 min-h-[120px] flex flex-col justify-end p-4"
      aria-hidden
    >
      <Skeleton height={20} width="75%" style={{ maxWidth: 200, marginBottom: 8 }} />
      <Skeleton height={16} width="50%" style={{ maxWidth: 140 }} />
    </div>
  );

export default EventCard;
