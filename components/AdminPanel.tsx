import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as StorageService from '../services/storageService';
import { EventData, TableModel } from '../types';
import { UI_TEXT } from '../constants/uiText';
import { TableNumber } from './TableLabel';
import PrimaryButton from '../src/ui/PrimaryButton';
import SecondaryButton from '../src/ui/SecondaryButton';
import DangerButton from '../src/ui/DangerButton';
import { EventCardSkeleton } from './EventCard';
import AdminCard from '../src/ui/AdminCard';
import { formatEventDate, formatEventDateTime, formatDateTimeRu } from '../src/utils/formatDate';
import { tableFromApi, tableToApi } from '../src/model/table';
import { bookingCode } from '../src/utils/bookingCode';
import { deepClone } from '../src/utils/deepEqual';
import { DEFAULT_TICKET_CATEGORIES } from '../constants/ticketStyles';
import AdminTablesLayer from './AdminTablesLayer';
import TableEditPanel from './TableEditPanel';
import TeamInviteCard from './TeamInviteCard';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { CATEGORY_COLORS, CATEGORY_COLOR_KEYS, getCategoryColorFromCategory } from '../src/config/categoryColors';
import type { TicketCategory } from '../types';
import { DEFAULT_TZ_OFFSET_MINUTES } from '../src/config/timezone';

type AdminBooking = {
  id: string;
  event_id?: string;
  table_id?: string | null;
  seat_indices?: number[];
  seats_booked?: number;
  user_telegram_id?: number | null;
  user_phone?: string;
  status?: string;
  created_at?: string;
  expires_at?: string | null;
  event?: { id: string; title?: string; date?: string };
  seatIds?: string[];
  user_vk_id?: number | string | null;
  userPhone?: string;
  tableBookings?: Array<{ tableId: string; seats: number }>;
  userTelegramId?: number;
  totalAmount?: number;
  total_amount?: number;
  user_comment?: string | null;
  userComment?: string | null;
  expiresAt?: string | number;
};

/** Convert ISO string to datetime-local input value (local time) */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert TableModel to API payload format. */
function tableForBackend(t: TableModel, index: number): Record<string, unknown> {
  return tableToApi(t, index);
}

/** Normalize tables for dirty comparison (stable order, only relevant fields). */
function normalizeTables(tables: TableModel[]): Array<Record<string, unknown>> {
  return tables
    .map((t) => ({
      id: t.id,
      number: t.number,
      centerXPercent: t.centerXPercent,
      centerYPercent: t.centerYPercent,
      widthPercent: t.widthPercent,
      heightPercent: t.heightPercent,
      rotationDeg: t.rotationDeg,
      seatsCount: t.seatsCount,
      categoryId: t.categoryId,
      isActive: t.isActive,
      objectType: t.objectType ?? 'table',
      label: t.label ?? null,
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/** Validate table numbers: positive integer, unique within event. Decorative objects are excluded. */
function validateTableNumbers(tables: TableModel[]): string | null {
  const seen = new Map<number, string>();
  for (const t of tables) {
    if (t.objectType && t.objectType !== 'table') continue; // skip decorative objects
    const n = t.number;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      return `${UI_TEXT.tables.tableNumberInvalid}`;
    }
    if (seen.has(n)) {
      return `${UI_TEXT.tables.tableNumberDuplicate} ${n}`;
    }
    seen.set(n, t.id);
  }
  return null;
}

/** Inline stroke icons for the admin chrome — no emoji, they render differently on every phone. */
function AdminIcon({ d, size = 22, sw = 1.9 }: { d: string; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICON = {
  back: 'M15 5l-7 7 7 7',
  next: 'M5 12h14M12.5 5.5L19 12l-6.5 6.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  cal: 'M3.5 7.5A2.5 2.5 0 0 1 6 5h12a2.5 2.5 0 0 1 2.5 2.5v10A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5zM3.5 10h17M8 3v4M16 3v4',
  ticket: 'M3 8.5v-2A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-2a2.5 2.5 0 0 0 0-5zM14.5 5.5v13',
  users: 'M9 11.7a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5M17 11.9a2.4 2.4 0 1 0 0-4.8M16.6 14.2c2.1.2 3.6 1.8 3.9 4.3',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};

/** UTC+3, UTC+7, UTC+5:30 — minutes east of UTC, as people read it. */
function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** The customer pressed "Я оплатил" — these wait for a person to check the money. */
const WAITING_STATUSES = ['awaiting_confirmation', 'payment_submitted'];

/**
 * An event is filled in four steps, in the order the work is actually done.
 * Each step shows only its own sections — the old screen showed all five
 * accordions at once, and after a few months nobody remembered which was which.
 */
type EventStep = 1 | 2 | 3 | 4;
const EVENT_STEPS: ReadonlyArray<{ n: EventStep; label: string; sections: string[] }> = [
  { n: 1, label: 'Концерт', sections: ['basic'] },
  { n: 2, label: 'Зал', sections: ['layout', 'tables'] },
  { n: 3, label: 'Цены', sections: ['categories'] },
  { n: 4, label: 'Продажи', sections: ['publish'] },
];

function EventStepper({ step, done, onStep }: { step: EventStep; done: boolean[]; onStep: (n: EventStep) => void }) {
  return (
    <nav aria-label="Шаги события" className="flex items-start px-1 pt-3 pb-4">
      {EVENT_STEPS.map((s, i) => {
        const current = s.n === step;
        const isDone = done[i] && !current;
        return (
          <React.Fragment key={s.n}>
            {i > 0 && <span aria-hidden className={`flex-[0.6] h-[1.5px] mt-[13px] ${done[i - 1] ? 'bg-[#57C79B]/45' : 'bg-white/10'}`} />}
            <button
              type="button"
              onClick={() => onStep(s.n)}
              aria-current={current ? 'step' : undefined}
              className="flex-1 basis-0 flex flex-col items-center gap-1.5 min-h-[44px]"
            >
              <span
                className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-[13px] font-bold ${current
                  ? 'bg-[#C6A75E] text-[#16130D]'
                  : isDone
                    ? 'border-[1.5px] border-[#57C79B] text-[#57C79B]'
                    : 'border-[1.5px] border-white/20 text-white/50'
                  }`}
              >
                {isDone ? <AdminIcon d={ICON.check} size={14} sw={2.4} /> : s.n}
              </span>
              <span className={`text-xs ${current ? 'font-semibold text-[#C6A75E]' : 'text-white/65'}`}>{s.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/** An event in the admin list: the poster, what and when, and how full the hall is. */
function AdminEventCard({ ev, onOpen, onDelete }: { ev: EventData; onOpen: () => void; onDelete: () => void }) {
  const status = ev.status ?? (ev.published ? 'published' : 'draft');
  const poster = (ev.imageUrl ?? (ev as { coverImageUrl?: string | null }).coverImageUrl ?? '').trim();
  type RawTable = { seatsTotal?: number; seatsCount?: number; seatsAvailable?: number; isAvailable?: boolean; is_active?: boolean };
  const all = ((ev.tables ?? []) as RawTable[]).filter((t) => t.is_active !== false);
  const seatsOf = (t: RawTable) => t.seatsTotal ?? t.seatsCount ?? 0;
  // Only tables on sale count toward "how full": a table closed from sale is
  // neither free nor taken. Seats booked on a table closed later still count.
  const onSale = all.filter((t) => t.isAvailable !== false);
  const closedSeats = all.filter((t) => t.isAvailable === false).reduce((n, t) => n + seatsOf(t), 0);
  const total = onSale.reduce((n, t) => n + seatsOf(t), 0);
  const taken = all.reduce((n, t) => n + Math.max(0, seatsOf(t) - (t.seatsAvailable ?? seatsOf(t))), 0);
  const when = (() => {
    const parts: string[] = [];
    if (ev.event_date) {
      const d = new Date(`${ev.event_date}T00:00:00`);
      parts.push(Number.isNaN(d.getTime()) ? ev.event_date : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }));
    }
    if (ev.event_time) parts.push(String(ev.event_time).slice(0, 5));
    if (ev.venue) parts.push(ev.venue);
    return parts.join(' · ');
  })();
  const chip = status === 'published'
    ? { text: 'Продажи открыты', cls: 'text-[#57C79B]' }
    : status === 'archived'
      ? { text: 'В архиве', cls: 'text-white/60' }
      : { text: 'Черновик', cls: 'text-[#E8B04B]' };
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left flex flex-col rounded-[20px] overflow-hidden bg-[#161412] border border-[#2B2723] active:scale-[0.99] transition-transform"
      >
        <div className="relative h-[190px] bg-[#1F1C19]">
          {poster && <img src={poster} alt="" className="w-full h-full object-cover block" loading="lazy" />}
          <span className={`absolute top-3 left-3 h-[26px] px-2.5 flex items-center gap-1.5 rounded-full bg-[#0C0B0A]/80 text-xs font-semibold ${chip.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {chip.text}
          </span>
        </div>
        <div className="flex flex-col gap-3 px-4 pt-4 pb-[18px]">
          <div className="flex flex-col gap-1">
            <div className="admin-display text-[30px] leading-[0.95]">{ev.title || 'Без названия'}</div>
            {when && <div className="text-[13.5px] text-[#BDB5A8]">{when}</div>}
          </div>
          {total > 0 && (
            <div className="flex flex-col gap-[7px]">
              <div className="flex justify-between text-[12.5px]">
                <span className="text-[#8C8477]">Продано мест</span>
                <span className="font-semibold">{taken} из {total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#1F1C19] overflow-hidden">
                <div className="h-full rounded-full bg-[#C6A75E]" style={{ width: `${Math.min(100, Math.round((taken / total) * 100))}%` }} />
              </div>
              {closedSeats > 0 && (
                <span className="text-[11.5px] text-[#8C8477]">Ещё {closedSeats} мест закрыты от продажи</span>
              )}
            </div>
          )}
        </div>
      </button>
      <button type="button" onClick={onDelete} className="self-end h-9 px-2 text-[12.5px] text-white/40">
        Удалить событие
      </button>
    </div>
  );
}

function AdminTabBar({
  active,
  waiting,
  onEvents,
  onBookings,
  onTeam,
}: {
  active: 'events' | 'bookings' | 'team';
  waiting: number;
  onEvents: () => void;
  onBookings: () => void;
  onTeam: () => void;
}) {
  const item = (key: typeof active, label: string, icon: string, onClick: () => void, badge = 0) => {
    const on = key === active;
    return (
      <button
        type="button"
        onClick={onClick}
        aria-current={on ? 'page' : undefined}
        className={`flex-1 flex flex-col items-center gap-1 pt-2.5 min-h-[56px] ${on ? 'text-[#C6A75E]' : 'text-[#8C8477]'}`}
      >
        <span className="relative flex">
          <AdminIcon d={icon} size={24} sw={1.7} />
          {badge > 0 && (
            <span className="absolute -top-1 left-[15px] min-w-[18px] h-[18px] px-[5px] rounded-full bg-[#FF5A2C] text-[#1C0A04] text-[11px] font-bold leading-[18px] text-center">
              {badge}
            </span>
          )}
        </span>
        <span className={`text-[11.5px] tracking-[0.02em] ${on ? 'font-semibold' : 'font-medium'}`}>{label}</span>
      </button>
    );
  };
  return (
    <nav
      aria-label="Разделы админки"
      className="fixed bottom-0 left-0 right-0 z-40 max-w-[420px] mx-auto flex px-3 bg-[#0C0B0A]/95 border-t border-[#2B2723] backdrop-blur"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {item('events', 'События', ICON.cal, onEvents)}
      {item('bookings', 'Брони', ICON.ticket, onBookings, waiting)}
      {item('team', 'Команда', ICON.users, onTeam)}
    </nav>
  );
}

/** Sortable section wrapper — defined outside AdminPanel to avoid remount on parent re-render. */
function SortableSectionInner({
  id,
  title,
  sectionKey,
  dirtyIndicator,
  children,
  openSections,
  toggleSection,
  sectionRefs,
  isDirty,
}: {
  id: string;
  title: string;
  sectionKey: string;
  dirtyIndicator?: boolean;
  children: React.ReactNode;
  openSections: string[];
  toggleSection: (key: string) => void;
  sectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  isDirty: boolean;
}) {
  // Sections used to be draggable. The order was never saved, so dragging
  // gave nothing — and on a phone the ☰ handle was easy to catch while
  // scrolling and shuffle the form mid-edit. Fixed order: the order of work.
  // Inside a step every section is open — folding them was how things got lost.
  void id; void dirtyIndicator; void openSections; void toggleSection; void isDirty;
  return (
    <section ref={(el) => { sectionRefs.current[sectionKey] = el as HTMLDivElement | null; }} className="mb-7">
      <h2 className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[#8C8477] mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** Validate rect tables: width_percent > 0, height_percent > 0, rotation in [-180, 180]. Returns error or null. */
function validateRectTables(tables: TableModel[]): string | null {
  for (const t of tables) {
    if (t.shape === 'circle') continue;
    const w = t.widthPercent;
    const h = t.heightPercent;
    const rot = t.rotationDeg;
    if (typeof w !== 'number' || w <= 0) return UI_TEXT.tables.widthPercentInvalid;
    if (typeof h !== 'number' || h <= 0) return UI_TEXT.tables.heightPercentInvalid;
    if (typeof rot !== 'number' || rot < -180 || rot > 180) return UI_TEXT.tables.rotationInvalid;
  }
  return null;
}

const AdminPanel: React.FC<{
  onBack?: () => void;
  onViewAsUser?: (eventId: string) => void;
  isAdmin?: boolean;
  organizerEventIds?: string[];
}> = ({ onBack, onViewAsUser, isAdmin = false, organizerEventIds = [] }) => {
  const [mode, setMode] = useState<'bookings' | 'layout' | 'controllers' | 'roles'>('bookings');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [eventStep, setEventStep] = useState<EventStep>(1);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [layoutUrl, setLayoutUrl] = useState('');
  const [eventPosterUrl, setEventPosterUrl] = useState('');
  const [posterUploadLoading, setPosterUploadLoading] = useState(false);
  const [posterUploadError, setPosterUploadError] = useState<string | null>(null);
  const [eventTicketTemplateUrl, setEventTicketTemplateUrl] = useState('');
  const [ticketTemplateUploadLoading, setTicketTemplateUploadLoading] = useState(false);
  const [ticketTemplateUploadError, setTicketTemplateUploadError] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [timezoneOffsetMinutes, setTimezoneOffsetMinutes] = useState<number>(DEFAULT_TZ_OFFSET_MINUTES);
  const [venue, setVenue] = useState('');
  const [eventPhone, setEventPhone] = useState('');
  const [eventPublished, setEventPublished] = useState(false);
  const [eventFeatured, setEventFeatured] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('waiting');
  const [eventStatusFilter, setEventStatusFilter] = useState<'published' | 'draft' | 'archived' | 'deleted'>('published');
  const [openSections, setOpenSections] = useState<string[]>(['basic']);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [sectionOrder, setSectionOrder] = useState(['basic', 'layout', 'tables', 'categories', 'publish']);
  const [exitConfirmPending, setExitConfirmPending] = useState<{ type: 'back' } | { type: 'closeEvent' } | { type: 'switchMode'; mode: 'bookings' | 'layout' | 'controllers' | 'roles' } | { type: 'switchEvent'; eventId: string } | null>(null);
  const [resyncLoading, setResyncLoading] = useState(false);
  const [layoutUploadLoading, setLayoutUploadLoading] = useState(false);
  const [layoutUploadError, setLayoutUploadError] = useState<string | null>(null);
  const [layoutUploadVersion, setLayoutUploadVersion] = useState<number | null>(null);
  /** Set when a newly uploaded plan has different proportions than the one the tables were placed on. */
  const [layoutAspectWarning, setLayoutAspectWarning] = useState<string | null>(null);

  /** Venue library: a hall is arranged once and copied into later events. */
  const [venues, setVenues] = useState<StorageService.SavedVenue[]>([]);
  const [venuesOpen, setVenuesOpen] = useState(false);
  const [venueBusy, setVenueBusy] = useState(false);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [venueNotice, setVenueNotice] = useState<string | null>(null);

  const loadVenues = React.useCallback(async () => {
    setVenueError(null);
    try {
      setVenues(await StorageService.listVenues());
    } catch (err) {
      setVenueError(err instanceof Error ? err.message : 'Не удалось загрузить залы');
    }
  }, []);

  const handleSaveVenue = async () => {
    if (!selectedEvent?.id) return;
    const suggested = (selectedEvent.venue || selectedEvent.title || '').trim();
    const name = window.prompt('Название зала', suggested);
    if (!name || !name.trim()) return;
    setVenueBusy(true);
    setVenueError(null);
    setVenueNotice(null);
    try {
      const saved = await StorageService.saveVenue(name.trim(), selectedEvent.id);
      setVenueNotice(`Зал «${name.trim()}» сохранён — ${saved.tableCount} объектов`);
      await loadVenues();
    } catch (err) {
      setVenueError(err instanceof Error ? err.message : 'Не удалось сохранить зал');
    } finally {
      setVenueBusy(false);
    }
  };

  /**
   * Applying a venue replaces the hall in the editor, not in the database: the
   * admin still reviews it and presses save, so it goes through the same
   * validation and publish lock as any other layout change.
   */
  const handleApplyVenue = async (venue: StorageService.SavedVenue) => {
    const hasTables = tables.length > 0;
    if (hasTables && !window.confirm(
      `Заменить текущую расстановку залом «${venue.name}»? Столов сейчас: ${tables.length}.`
    )) return;
    setVenueBusy(true);
    setVenueError(null);
    setVenueNotice(null);
    try {
      const payload = await StorageService.getVenueApplyPayload(venue.id);
      setTables(payload.tables.map(tableFromApi));
      if (payload.layoutImageUrl) setLayoutUrl(payload.layoutImageUrl);
      if (Array.isArray(payload.ticketCategories) && payload.ticketCategories.length > 0) {
        setSelectedEvent((prev) => (prev ? { ...prev, ticketCategories: payload.ticketCategories } : prev));
      }
      setSelectedTableId(null);
      setVenuesOpen(false);
      setVenueNotice(`Зал «${venue.name}» загружен. Проверьте расстановку и сохраните.`);
    } catch (err) {
      setVenueError(err instanceof Error ? err.message : 'Не удалось загрузить зал');
    } finally {
      setVenueBusy(false);
    }
  };

  const handleDeleteVenue = async (venue: StorageService.SavedVenue) => {
    if (!window.confirm(`Удалить зал «${venue.name}» из библиотеки? События, созданные из него, не изменятся.`)) return;
    setVenueBusy(true);
    try {
      await StorageService.deleteVenue(venue.id);
      await loadVenues();
    } catch (err) {
      setVenueError(err instanceof Error ? err.message : 'Не удалось удалить зал');
    } finally {
      setVenueBusy(false);
    }
  };
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [eventTablesMap, setEventTablesMap] = useState<Record<string, TableModel[]>>({});
  const [eventDetailsMap, setEventDetailsMap] = useState<Record<string, EventData>>({});
  const [activeTabLeft, setActiveTabLeft] = useState(0);
  const [activeTabWidth, setActiveTabWidth] = useState(0);
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState<EventData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [controllers, setControllers] = useState<StorageService.ControllerEntry[]>([]);
  const [controllersLoading, setControllersLoading] = useState(false);
  const [newControllerId, setNewControllerId] = useState('');
  const [newControllerPlatform, setNewControllerPlatform] = useState<'telegram' | 'vk'>('telegram');
  const [newControllerLabel, setNewControllerLabel] = useState('');
  const [controllerError, setControllerError] = useState<string | null>(null);
  // Roles tab state
  const [organizers, setOrganizers] = useState<StorageService.OrganizerEntry[]>([]);
  const [organizersLoading, setOrganizersLoading] = useState(false);
  const [appUsers, setAppUsers] = useState<StorageService.AppUser[]>([]);
  const [appUsersLoading, setAppUsersLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [rolesSubTab, setRolesSubTab] = useState<'controllers' | 'organizers'>('controllers');
  const [showOrganizerPicker, setShowOrganizerPicker] = useState(false);
  const [orgPickerQuery, setOrgPickerQuery] = useState('');
  const [orgPickerEventId, setOrgPickerEventId] = useState('');
  const [orgPickerPlatform, setOrgPickerPlatform] = useState<'telegram' | 'vk'>('telegram');
  const [orgPickerLabel, setOrgPickerLabel] = useState('');
  const [orgPickerManualId, setOrgPickerManualId] = useState('');
  const [orgPickerSelectedUserId, setOrgPickerSelectedUserId] = useState<number | null>(null);
  const [tables, setTables] = useState<TableModel[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  /**
   * Bulk selection. Assigning a category is the second most repetitive job in
   * setting up a hall after placing the tables: eight VIP tables means opening
   * eight panels and picking the same value eight times. In bulk mode a tap
   * adds a table to the set instead of opening its panel.
   */
  useEffect(() => {
    if (!selectedTableId) return;
    // Narrow screens only: there the panel is a bottom sheet over the lower
    // half, and the plan has to sit above it to be of any use.
    if (typeof window === 'undefined' || window.innerWidth >= 640) return;
    layoutPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedTableId]);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkIds, setBulkIds] = useState<string[]>([]);

  const bookableTables = React.useMemo(
    () => tables.filter((t) => (t.objectType ?? 'table') === 'table'),
    [tables]
  );

  const exitBulkMode = () => { setBulkMode(false); setBulkIds([]); };

  const toggleBulk = (id: string) => {
    setBulkIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const applyToBulk = (updates: Partial<TableModel>) => {
    if (bulkIds.length === 0) return;
    const ids = new Set(bulkIds);
    setTables((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, ...updates } : t)));
  };

  const deleteBulk = () => {
    if (bulkIds.length === 0) return;
    if (!window.confirm(`Удалить выбранные столы (${bulkIds.length})?`)) return;
    const ids = new Set(bulkIds);
    setTables((prev) => prev.filter((t) => !ids.has(t.id)));
    setBulkIds([]);
  };
  const initialTablesRef = useRef<TableModel[]>([]);
  const hasInitializedRef = useRef(false);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveLayoutRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);

  const isDirty = useMemo(() => {
    const tablesDirty =
      JSON.stringify(normalizeTables(tables)) !==
      JSON.stringify(normalizeTables(initialTablesRef.current));
    if (tablesDirty) return true;
    if (!selectedEvent) return false;
    const ev = selectedEvent;
    const titleDirty = (eventTitle ?? '').trim() !== (ev.title ?? '').trim();
    const descDirty = (eventDescription ?? '').trim() !== (ev.description ?? '').trim();
    const dateDirty = (eventDate ?? '').trim() !== (ev.event_date ?? '').trim();
    const timeDirty = (eventTime ?? '').trim() !== (ev.event_time ? String(ev.event_time).slice(0, 5) : '');
    const venueDirty = (venue ?? '').trim() !== (ev.venue ?? '').trim();
    const phoneDirty = (eventPhone ?? '').trim() !== (ev.paymentPhone ?? '').trim();
    const posterDirty = (eventPosterUrl ?? '').trim() !== (ev.imageUrl ?? '').trim();
    const layoutDirty = (layoutUrl ?? '').trim() !== (ev.layoutImageUrl ?? '').trim();
    const publishedDirty = eventPublished !== (ev.published === true);
    const featuredDirty = eventFeatured !== ((ev as { isFeatured?: boolean }).isFeatured === true);
    const tzDirty = timezoneOffsetMinutes !== ((ev as any).timezoneOffsetMinutes ?? DEFAULT_TZ_OFFSET_MINUTES);
    return (
      titleDirty ||
      descDirty ||
      dateDirty ||
      timeDirty ||
      venueDirty ||
      phoneDirty ||
      posterDirty ||
      layoutDirty ||
      publishedDirty ||
      featuredDirty ||
      tzDirty
    );
  }, [
    tables,
    selectedEvent,
    eventTitle,
    eventDescription,
    eventDate,
    eventTime,
    venue,
    eventPhone,
    eventPosterUrl,
    layoutUrl,
    eventPublished,
    eventFeatured,
    timezoneOffsetMinutes,
  ]);

  useEffect(() => {
    hasInitializedRef.current = false;
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (!selectedEvent?.tables) return;
    if (hasInitializedRef.current) return;
    const mapped = (selectedEvent.tables ?? []).map(tableFromApi);
    setTables(mapped);
    hasInitializedRef.current = true;
  }, [selectedEvent?.id]);

  const layoutPreviewRef = useRef<HTMLDivElement>(null);
  const layoutZoomResetRef = useRef<(() => void) | null>(null);
  const [isAddTableMode, setIsAddTableMode] = useState(false);
  const eventTabsScrollRef = useRef<HTMLDivElement>(null);
  const eventTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const hasEvents = useMemo(() => events.length > 0, [events.length]);

  const handleSave = useCallback((silent = false) => saveLayoutRef.current?.(silent), []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSectionOrder((items) => {
        const oldIndex = items.indexOf(String(active.id));
        const newIndex = items.indexOf(String(over.id));
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const isOpening = !prev.includes(key);
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (isOpening) {
        setTimeout(() => {
          const el = sectionRefs.current[key];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 50);
      }
      return next;
    });
  }, []);

  const eventTabsVisible = mode === 'layout' && hasEvents && !eventsLoading;
  const eventTabKeys = useMemo(() => ['published', 'draft', 'archived', 'deleted'] as const, []);

  useLayoutEffect(() => {
    const el = eventTabRefs.current[eventStatusFilter];
    if (el) {
      setActiveTabLeft(el.offsetLeft);
      setActiveTabWidth(el.offsetWidth);
    }
  }, [eventStatusFilter, eventTabsVisible, eventTabKeys]);

  useLayoutEffect(() => {
    const el = eventTabRefs.current[eventStatusFilter];
    const container = eventTabsScrollRef.current;
    if (el && container) {
      const elLeft = el.offsetLeft;
      const elWidth = el.offsetWidth;
      const containerWidth = container.offsetWidth;
      container.scrollTo({
        left: elLeft - containerWidth / 2 + elWidth / 2,
        behavior: eventTabsVisible ? 'smooth' : 'auto',
      });
    }
  }, [eventStatusFilter, eventTabsVisible, eventTabKeys]);

  const toFriendlyError = (e: unknown) => {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw === 'Forbidden') return UI_TEXT.common.errors.forbidden;
    if (raw.toLowerCase().includes('not found')) return UI_TEXT.common.errors.notFound;
    if (raw.toLowerCase().includes('expired')) return UI_TEXT.common.errors.expired;
    if (raw.toLowerCase().includes('only reserved')) return UI_TEXT.common.errors.onlyReserved;
    if (raw.includes('Cannot delete table') || raw.includes('it has bookings')) return UI_TEXT.common.errors.deleteTableWithBookings;
    if (raw.includes('Cannot deactivate table with active bookings')) return UI_TEXT.common.errors.cannotDeactivateTableWithBookings;
    // Pass through backend error details so admin can diagnose issues
    if (raw.startsWith('Save failed:')) return raw;
    return UI_TEXT.common.errors.default;
  };
  const isExpired = (expiresAt?: string | number) => {
    if (!expiresAt) return false;
    const ts = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : Number(expiresAt);
    if (!Number.isFinite(ts)) return false;
    return Date.now() > ts;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const data = await StorageService.getAdminBookings();
      setBookings(Array.isArray(data) ? data : []);

      const eventIds = [...new Set((data as AdminBooking[]).map((b) => b.event_id ?? b.event?.id).filter(Boolean))] as string[];
      const map: Record<string, TableModel[]> = {};
      const detailsMap: Record<string, EventData> = {};
      for (const eventId of eventIds) {
        try {
          const ev = await StorageService.getAdminEvent(eventId);
          map[eventId] = Array.isArray(ev?.tables) ? ev.tables.map(tableFromApi) : [];
          if (ev) detailsMap[eventId] = ev;
        } catch {
          map[eventId] = [];
        }
      }
      setEventTablesMap(map);
      setEventDetailsMap(detailsMap);
    } catch (e) {
      setError(toFriendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const data = await StorageService.getAdminEvents();
      setEvents(Array.isArray(data) ? (data as EventData[]) : []);
    } catch (e) {
      setError(toFriendlyError(e));
    } finally {
      setEventsLoading(false);
    }
  };

  const handleResyncSeats = async () => {
    setResyncLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await StorageService.resyncSeats();
      setSuccessMessage(UI_TEXT.admin.resyncSeatsSuccess);
      await loadEvents();
      await load();
    } catch {
      alert(UI_TEXT.admin.resyncSeatsError);
    } finally {
      setResyncLoading(false);
    }
  };

  /** After getAdminEvent: only set event. No duplicate tables or form arrays. */
  const setEventFromFresh = (fresh: EventData | null, opts?: { skipInitialTablesRef?: boolean }) => {
    if (!fresh) {
      setSelectedEvent(null);
      setTables([]);
      initialTablesRef.current = [];
      setSelectedTableId(null);
      return;
    }
    const ticketCategories = fresh.ticketCategories?.length ? fresh.ticketCategories : DEFAULT_TICKET_CATEGORIES;
    const mappedTables = (fresh.tables ?? []).map(tableFromApi);
    const mapped = { ...fresh, ticketCategories, tables: mappedTables };
    setSelectedEvent(mapped);
    setTables(mappedTables);
    if (!opts?.skipInitialTablesRef) {
      initialTablesRef.current = deepClone(mappedTables);
    }
    setSelectedTableId(null);
    setLayoutUrl(fresh.layoutImageUrl || '');
    setEventPosterUrl(fresh.imageUrl ?? '');
    setEventTicketTemplateUrl(fresh.ticketTemplateUrl ?? '');
    setEventTitle(fresh.title || '');
    setEventDescription(fresh.description || '');
    setEventDate(fresh.event_date ?? '');
    setEventTime(fresh.event_time ? String(fresh.event_time).slice(0, 5) : '');
    setTimezoneOffsetMinutes((fresh as any).timezoneOffsetMinutes ?? DEFAULT_TZ_OFFSET_MINUTES);
    setVenue(fresh.venue ?? '');
    setEventPhone(fresh.paymentPhone || '');
    setEventPublished(fresh.published === true);
    setEventFeatured((fresh as { isFeatured?: boolean }).isFeatured === true);
    setEvents((prev) => prev.map((e) => (e.id === fresh.id ? { ...e, title: fresh.title } : e)));
  };

  const handlePosterUpload = useCallback(async (file: File) => {
    if (!selectedEvent?.id) return;
    setPosterUploadLoading(true);
    setPosterUploadError(null);
    try {
      const { url } = await StorageService.uploadPosterImage(selectedEvent.id, file);
      setEventPosterUrl(url);
      const fresh = await StorageService.getAdminEvent(selectedEvent.id);
      setEventFromFresh(fresh);
    } catch (err) {
      setPosterUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPosterUploadLoading(false);
    }
  }, [selectedEvent?.id]);

  const handleTicketTemplateUpload = useCallback(async (file: File) => {
    if (!selectedEvent?.id) return;
    setTicketTemplateUploadLoading(true);
    setTicketTemplateUploadError(null);
    try {
      const { url } = await StorageService.uploadTicketTemplateImage(selectedEvent.id, file);
      setEventTicketTemplateUrl(url);
      const fresh = await StorageService.getAdminEvent(selectedEvent.id);
      setEventFromFresh(fresh);
    } catch (err) {
      setTicketTemplateUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setTicketTemplateUploadLoading(false);
    }
  }, [selectedEvent?.id]);

  const loadEvent = async (eventId: string) => {
    if (!eventId) return;
    setEventsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const fresh = await StorageService.getAdminEvent(eventId);
      setEventFromFresh(fresh);
      setLayoutUploadVersion(null);
      setSaveStatus('idle');
    } catch (e) {
      setError(toFriendlyError(e));
    } finally {
      setEventsLoading(false);
    }
  };

  const createEvent = async () => {
    setCreatingEvent(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const created = await StorageService.createAdminEvent({ title: UI_TEXT.event.newEventTitle, status: 'draft' } as any);
      await loadEvents();
      if (created?.id) {
        setSelectedEventId(created.id);
        await loadEvent(created.id);
      }
      setError(null);
      setSuccessMessage(UI_TEXT.admin.eventCreated);
    } catch (e) {
      setError(toFriendlyError(e));
    } finally {
      setCreatingEvent(false);
    }
  };

  const saveLayout = async (silent = false) => {
    if (!selectedEvent?.id) return;
    const rawTables = tables;
    const numErr = validateTableNumbers(rawTables);
    if (numErr) { setError(numErr); return; }
    const rectErr = validateRectTables(rawTables);
    if (rectErr) { setError(rectErr); return; }
    setSavingLayout(true);
    setSaveStatus('saving');
    if (!silent) {
      setError(null);
      setSuccessMessage(null);
    }
    try {
      const payload: StorageService.AdminEventPayload = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        event_date: eventDate.trim() || null,
        event_time: eventTime.trim() || null,
        timezoneOffsetMinutes,
        venue: venue.trim() || null,
        paymentPhone: eventPhone.trim(),
        imageUrl: eventPosterUrl.trim() || (selectedEvent?.imageUrl ?? null),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : (selectedEvent?.layoutImageUrl ?? null),
        published: eventPublished,
        isFeatured: eventFeatured,
        ticketCategories: selectedEvent?.ticketCategories ?? [],
        tables: (rawTables ?? []).map((t, idx) => tableForBackend(t, idx)),
      };
      const response = await StorageService.updateAdminEvent(selectedEvent.id, payload);
      const fresh = await StorageService.getAdminEvent(selectedEvent.id);
      initialTablesRef.current = structuredClone(tables);
      setEventFromFresh(fresh, { skipInitialTablesRef: true });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      if (!silent) {
        setError(null);
        setSuccessMessage(UI_TEXT.admin.eventUpdated);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isForbidden =
        msg === 'Forbidden' ||
        msg.toLowerCase().includes('forbidden') ||
        msg.toLowerCase().includes('published') ||
        msg.toLowerCase().includes('cannot be modified');
      setError(
        isForbidden ? UI_TEXT.event.publishedWarning : toFriendlyError(e),
      );
    } finally {
      setSavingLayout(false);
    }
  };
  saveLayoutRef.current = saveLayout;

  const loadControllers = async () => {
    setControllersLoading(true);
    setControllerError(null);
    try {
      const data = await StorageService.getAdminControllers();
      setControllers(data);
    } catch (err: any) {
      setControllerError(err?.message ?? 'Ошибка загрузки');
    } finally {
      setControllersLoading(false);
    }
  };

  const loadOrganizers = async () => {
    setOrganizersLoading(true);
    setRolesError(null);
    try {
      const data = await StorageService.getAdminOrganizers();
      setOrganizers(data);
    } catch (err: any) {
      setRolesError(err?.message ?? 'Ошибка загрузки организаторов');
    } finally {
      setOrganizersLoading(false);
    }
  };

  const loadAppUsers = async () => {
    setAppUsersLoading(true);
    try {
      const data = await StorageService.getAppUsers();
      setAppUsers(data);
    } catch {
      /* silent */
    } finally {
      setAppUsersLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadEvents();
    loadControllers();
  }, []);

  const formatAdminSeatLabel = (b: AdminBooking): string => {
    if (Array.isArray(b.seat_indices) && b.seat_indices.length > 0) {
      const sorted = [...b.seat_indices].sort((a, b) => a - b);
      const human = sorted.map((i) => i + 1);
      return `Места: ${human.join(', ')}`;
    }
    const count = b.seats_booked ?? (Array.isArray(b.tableBookings) ? b.tableBookings.reduce((s, tb) => s + tb.seats, 0) : 0);
    if (typeof count === 'number' && count > 0) return `${count} ${count === 1 ? 'место' : 'мест'}`;
    return '—';
  };

  const getAdminTableLabel = (b: AdminBooking): string => {
    const eventId = b.event_id ?? b.event?.id ?? '';
    const tablesForEvent = eventId === selectedEventId ? tables : (eventTablesMap[eventId] ?? []);
    const tableId = b.table_id ?? b.tableBookings?.[0]?.tableId;
    if (!tableId) return '—';
    const exists = tablesForEvent.some((t) => t.id === tableId);
    if (!exists) return 'Стол удалён';
    const table = tablesForEvent.find((t) => t.id === tableId);
    return table ? `Стол ${table.number}` : '—';
  };

  const getAdminCategoryLabel = (b: AdminBooking): string => {
    const eventId = b.event_id ?? b.event?.id ?? '';
    const ev = eventDetailsMap[eventId];
    const tableId = b.table_id ?? b.tableBookings?.[0]?.tableId;
    if (!tableId || !ev?.ticketCategories) return '—';
    const tablesForEvent = eventId === selectedEventId ? tables : (eventTablesMap[eventId] ?? []);
    const table = tablesForEvent.find((t) => t.id === tableId);
    const catId = table?.categoryId;
    if (!catId) return '—';
    const cat = ev.ticketCategories.find((c) => c.id === catId);
    return cat?.name ?? '—';
  };

  const formatAdminDate = (s: string | null | undefined, offset = 180): string => {
    if (!s) return '—';
    return formatDateTimeRu(s, offset) || String(s);
  };

  const formatEventDateDisplay = (ev: EventData | undefined): string => {
    if (!ev) return '—';
    const offset = (ev as any).timezoneOffsetMinutes ?? DEFAULT_TZ_OFFSET_MINUTES;
    if (ev.event_date && ev.event_time) return formatEventDateTime(ev.event_date, ev.event_time, offset);
    if (ev.event_date) return formatEventDate(ev.event_date, offset);
    if (ev.date) return formatDateTimeRu(ev.date, offset);
    return '—';
  };

  const tableIdsWithBookings = useMemo(() => {
    const set = new Set<string>();
    if (!selectedEventId) return set;
    for (const b of bookings) {
      if (b.event?.id !== selectedEventId) continue;
      if (Array.isArray(b.tableBookings)) {
        for (const tb of b.tableBookings) {
          if (typeof tb?.tableId === 'string') set.add(tb.tableId);
        }
      }
    }
    return set;
  }, [bookings, selectedEventId]);

  const addTable = (percentX = 50, percentY = 50) => {
    if (!selectedEvent?.id) return;
    const defaultCategoryId = (selectedEvent?.ticketCategories ?? []).find((c) => c.isActive)?.id ?? '';
    const newTable = {
      id: crypto.randomUUID(),
      centerXPercent: percentX,
      centerYPercent: percentY,
      widthPercent: 8,
      heightPercent: 8,
      shape: 'circle' as const,
      rotationDeg: 0,
      seatsCount: 4,
      seatsAvailable: 4,
      categoryId: defaultCategoryId,
      isActive: true,
    };
    setTables((prev) => {
      const tableNums = prev.filter(t => !t.objectType || t.objectType === 'table').map(t => t.number ?? 0);
      const maxNumber = tableNums.length ? Math.max(...tableNums) : 0;
      const nextNumber = maxNumber + 1;
      const withNumber = { ...newTable, number: nextNumber };
      const next = [...prev, withNumber];
      const numErr = validateTableNumbers(next);
      if (numErr) {
        setError(numErr);
        return prev;
      }
      const rectErr = validateRectTables(next);
      if (rectErr) {
        setError(rectErr);
        return prev;
      }
      setSelectedTableId(withNumber.id);
      return next;
    });
  };

  const deleteTable = (tableId: string) => {
    const newTables = tables.filter((it) => it.id !== tableId);
    const numErr = validateTableNumbers(newTables);
    if (numErr) { setError(numErr); return; }
    const rectErr = validateRectTables(newTables);
    if (rectErr) { setError(rectErr); return; }
    setTables(newTables);
    if (selectedTableId === tableId) setSelectedTableId(null);
  };

  const confirmBooking = async (bookingId: string) => {
    setConfirmingId(bookingId);
    setError(null);
    setSuccessMessage(null);
    try {
      await StorageService.confirmBookingPayment(bookingId);
      setError(null);
      setSuccessMessage(UI_TEXT.booking.paymentConfirmed);
      await load();
    } catch (e) {
      setError(toFriendlyError(e));
    } finally {
      setConfirmingId(null);
    }
  };

  const cancelBookingAction = async (bookingId: string) => {
    setCancellingId(bookingId);
    setError(null);
    setSuccessMessage(null);
    try {
      await StorageService.cancelBooking(bookingId);
      setError(null);
      setSuccessMessage('Бронирование отменено');
      await load();
    } catch (e) {
      setError(toFriendlyError(e));
    } finally {
      setCancellingId(null);
    }
  };

  const hasBookings = useMemo(() => bookings.length > 0, [bookings.length]);
  const uniqueBookingStatuses = useMemo(
    () => [...new Set(bookings.map((b) => b.status).filter(Boolean))].sort(),
    [bookings]
  );

  useEffect(() => {
    if (statusFilter === 'waiting' || statusFilter === 'paid') return;
    if (bookings.length && statusFilter && !uniqueBookingStatuses.includes(statusFilter)) {
      setStatusFilter('');
    }
  }, [bookings.length, statusFilter, uniqueBookingStatuses]);

  const filteredBookings = useMemo(() => {
    let result = bookings;
    // Organizer: show only bookings for their events
    if (!isAdmin && organizerEventIds.length > 0) {
      result = result.filter((b) => organizerEventIds.includes(b.event?.id ?? b.event_id ?? ''));
    }
    if (!statusFilter) return result;
    if (statusFilter === 'waiting') {
      return result.filter((b) => WAITING_STATUSES.includes(String(b.status ?? '')));
    }
    return result.filter((b) => String(b.status ?? '') === statusFilter);
  }, [bookings, statusFilter, isAdmin, organizerEventIds]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Organizer: show only their events
      if (!isAdmin && organizerEventIds.length > 0 && !organizerEventIds.includes(ev.id)) return false;
      const status = ev.status ?? (ev.published ? 'published' : 'draft');
      const isDeleted = (ev as { is_deleted?: boolean }).is_deleted === true;
      if (eventStatusFilter === 'deleted') return isDeleted;
      if (isDeleted) return false;
      if (eventStatusFilter === 'published') return status === 'published';
      if (eventStatusFilter === 'draft') return status === 'draft';
      if (eventStatusFilter === 'archived') return status === 'archived';
      return true;
    });
  }, [events, eventStatusFilter]);

  const eventCounts = useMemo(() => {
    const status = (ev: EventData) => ev.status ?? (ev.published ? 'published' : 'draft');
    const isDeleted = (ev: EventData) => (ev as { is_deleted?: boolean }).is_deleted === true;
    return {
      published: events.filter((ev) => status(ev) === 'published' && !isDeleted(ev)).length,
      draft: events.filter((ev) => status(ev) === 'draft' && !isDeleted(ev)).length,
      archived: events.filter((ev) => status(ev) === 'archived' && !isDeleted(ev)).length,
      deleted: events.filter((ev) => isDeleted(ev)).length,
    };
  }, [events]);

  const getActiveBookingsCount = useCallback((eventId: string) => {
    const active = ['reserved', 'pending', 'awaiting_confirmation', 'paid', 'payment_submitted'];
    return bookings.filter(
      (b) => (b.event_id ?? b.event?.id) === eventId && active.includes(String(b.status ?? ''))
    ).length;
  }, [bookings]);

  /** Back from an event to the list. Unsaved table edits are dropped with it. */
  const closeEvent = useCallback(() => {
    setSelectedEventId('');
    setSelectedEvent(null);
    setSelectedTableId(null);
    setBulkMode(false);
    setBulkIds([]);
    setTables([]);
    initialTablesRef.current = [];
    setEventStep(1);
    setError(null);
    setSuccessMessage(null);
    window.scrollTo({ top: 0 });
  }, []);

  const executeExitAction = useCallback((pending: NonNullable<typeof exitConfirmPending>) => {
    setExitConfirmPending(null);
    if (pending.type === 'back') onBack?.();
    else if (pending.type === 'closeEvent') closeEvent();
    else if (pending.type === 'switchMode') setMode(pending.mode);
    else if (pending.type === 'switchEvent') {
      setSelectedEventId(pending.eventId);
      setSelectedEvent(null);
      setError(null);
      setSuccessMessage(null);
      loadEvent(pending.eventId);
    }
  }, [onBack, closeEvent]);

  const inEvent = mode === 'layout' && !!selectedEventId;
  const requestCloseEvent = () => {
    if (isDirty) setExitConfirmPending({ type: 'closeEvent' });
    else closeEvent();
  };
  const goStep = (n: EventStep) => {
    setEventStep(n);
    if (n !== 2) setSelectedTableId(null);
    window.scrollTo({ top: 0 });
  };
  // A step counts as done when the guest-facing essentials are there.
  const stepsDone = [
    eventTitle.trim() !== '' && eventDate.trim() !== '',
    !!layoutUrl && tables.length > 0,
    (selectedEvent?.ticketCategories?.length ?? 0) > 0 &&
      (selectedEvent?.ticketCategories ?? []).every((c) => Number(c.price) > 0),
    selectedEvent?.status === 'published',
  ];
  const waitingCount = bookings.filter((b) => {
    const st = String(b.status ?? '');
    return st === 'awaiting_confirmation' || st === 'payment_submitted';
  }).length;
  const eventSubtitle = (() => {
    const parts: string[] = [];
    if (eventDate) {
      const d = new Date(`${eventDate}T00:00:00`);
      parts.push(Number.isNaN(d.getTime()) ? eventDate : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }));
    }
    if (eventTime) parts.push(eventTime.slice(0, 5));
    if (venue.trim()) parts.push(venue.trim());
    return parts.join(' · ');
  })();
  const goEvents = () => {
    if (isDirty && selectedEvent) setExitConfirmPending({ type: 'switchMode', mode: 'layout' });
    else setMode('layout');
  };
  const goBookings = () => {
    if (isDirty && selectedEvent) setExitConfirmPending({ type: 'switchMode', mode: 'bookings' });
    else setMode('bookings');
  };
  const goTeam = () => {
    const target = isAdmin ? 'roles' : 'controllers';
    if (isDirty && selectedEvent) { setExitConfirmPending({ type: 'switchMode', mode: target }); return; }
    setMode(target);
    if (isAdmin) { loadOrganizers(); loadAppUsers(); }
    // Organizer invites pick an event from this list.
    if (isAdmin && events.length === 0) void loadEvents();
  };
  const screenTitle = mode === 'bookings' ? UI_TEXT.admin.bookings : mode === 'layout' ? UI_TEXT.admin.eventsTab : UI_TEXT.admin.team;

  const handleSaveAndExit = useCallback(async () => {
    const pending = exitConfirmPending;
    if (!pending) return;
    try {
      await handleSave(false);
      executeExitAction(pending);
    } catch {
      /* error already shown */
    }
  }, [exitConfirmPending, handleSave, executeExitAction]);

  const handleDeleteEvent = useCallback(async () => {
    const ev = deleteConfirmEvent;
    if (!ev) return;
    setDeleteLoading(true);
    try {
      await StorageService.deleteAdminEvent(ev.id);
      setDeleteConfirmEvent(null);
      if (selectedEventId === ev.id) {
        setSelectedEventId('');
        setSelectedEvent(null);
      }
      await loadEvents();
    } catch (e) {
      setError(toFriendlyError(e));
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteConfirmEvent, selectedEventId, loadEvents]);

  return (
    <div className="admin-root min-h-screen px-4 pt-5 pb-36">
      {!inEvent && (
        <header className="flex items-end justify-between gap-3 mb-5">
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="admin-display text-[46px]">{screenTitle}</h1>
            {saveStatus === 'saved' && (
              <span className="text-xs text-[#57C79B]">Сохранено</span>
            )}
          </div>
          <div className="flex gap-2 items-center flex-shrink-0">
            {mode === 'layout' && (
              <button
                type="button"
                onClick={createEvent}
                disabled={eventsLoading || creatingEvent}
                className="admin-cta h-11 pl-3.5 pr-4"
              >
                <AdminIcon d={ICON.plus} size={20} sw={2.2} />
                {creatingEvent ? UI_TEXT.admin.creatingEvent : 'Создать'}
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={moreMenuOpen}
                aria-label="Ещё"
                className="admin-icon-btn"
              >
                <AdminIcon d={ICON.more} size={22} sw={3} />
              </button>
              {moreMenuOpen && (
                // Tap anywhere else to close — the usual way a menu goes away on a phone.
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setMoreMenuOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
              )}
              {moreMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-12 z-50 min-w-[240px] rounded-2xl border border-[#2B2723] bg-[#161412] p-1 shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      if (mode === 'bookings') load();
                      if (mode === 'layout') loadEvents();
                      if (mode === 'controllers') loadControllers();
                      if (mode === 'roles') { loadOrganizers(); loadAppUsers(); }
                    }}
                    disabled={loading || eventsLoading}
                    className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-white/85 hover:bg-white/5 disabled:opacity-40"
                  >
                    {UI_TEXT.admin.reload}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMoreMenuOpen(false); void handleResyncSeats(); }}
                    disabled={resyncLoading || loading || eventsLoading}
                    className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-white/85 hover:bg-white/5 disabled:opacity-40"
                  >
                    {resyncLoading ? UI_TEXT.common.loading : UI_TEXT.admin.resyncSeats}
                    <span className="block text-[11px] text-white/45 mt-0.5">
                      Если свободных мест показывается не столько, сколько на самом деле
                    </span>
                  </button>
                  {onBack && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        if (isDirty) setExitConfirmPending({ type: 'back' });
                        else onBack();
                      }}
                      disabled={loading || eventsLoading || savingLayout || confirmingId !== null || cancellingId !== null}
                      className="w-full text-left rounded-xl px-3 py-2.5 text-sm text-white/85 hover:bg-white/5 disabled:opacity-40"
                    >
                      {UI_TEXT.admin.exit}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
      )}


      {loading && !inEvent && <div className="text-sm text-muted">{UI_TEXT.admin.loadingBookings}</div>}
      {error && !inEvent && <div className="admin-notice admin-notice-error mb-4">{error}</div>}
      {successMessage && !inEvent && <div className="admin-notice admin-notice-ok mb-4">{successMessage}</div>}

      {mode === 'bookings' && (
        <>
          {hasBookings && (
            <div role="tablist" aria-label="Статус брони" className="admin-segmented mb-4">
              {[
                { key: 'waiting', label: 'Ждут оплаты', count: waitingCount },
                { key: 'paid', label: 'Оплачено', count: 0 },
                { key: '', label: 'Все', count: 0 },
              ].map((f) => (
                <button
                  key={f.key || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === f.key}
                  onClick={() => setStatusFilter(f.key)}
                >
                  {f.label}
                  {f.count > 0 && (
                    <span className="min-w-[18px] h-[18px] px-[5px] rounded-full bg-[#FF5A2C] text-[#1C0A04] text-[11px] font-bold leading-[18px] text-center">
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {!loading && !hasBookings && (
            <div className="py-10 text-center text-sm text-[#8C8477]">{UI_TEXT.admin.noBookings}</div>
          )}

          {!loading && hasBookings && filteredBookings.length === 0 && (
            <div className="py-10 text-center text-sm text-[#8C8477]">
              {statusFilter === 'waiting' ? 'Никто не ждёт подтверждения. Всё разобрано.' : UI_TEXT.booking.noBookingsForFilter}
            </div>
          )}

          {!loading && hasBookings && filteredBookings.length > 0 && (
            <div className="flex flex-col gap-3">
              {filteredBookings.map((b) => {
                const status = String(b.status ?? '');
                const canConfirm = status === 'reserved' || status === 'pending' || status === 'awaiting_confirmation' || status === 'payment_submitted' || status === 'expired';
                const waiting = WAITING_STATUSES.includes(status);
                const telegramId = b.user_telegram_id ?? b.userTelegramId;
                const userPhone = b.user_phone ?? b.userPhone;
                const eventId = b.event_id ?? b.event?.id ?? '';
                const eventDetails = eventDetailsMap[eventId];
                const tableLabel = getAdminTableLabel(b);
                const tableNum = tableLabel.startsWith('Стол ') && tableLabel !== 'Стол удалён' ? tableLabel.slice(5) : null;
                const tablesForEvent = eventId === selectedEventId ? tables : (eventTablesMap[eventId] ?? []);
                const tableId = b.table_id ?? b.tableBookings?.[0]?.tableId;
                const catId = tablesForEvent.find((t) => t.id === tableId)?.categoryId;
                const cat = catId ? eventDetails?.ticketCategories?.find((c) => c.id === catId) : undefined;
                const amount = Number(b.totalAmount ?? b.total_amount ?? 0);
                const comment = b.user_comment ?? b.userComment;
                const statusColor = waiting ? 'text-[#FF8A63]' : status === 'paid' ? 'text-[#57C79B]' : status === 'cancelled' || status === 'expired' ? 'text-white/45' : 'text-[#BDB5A8]';

                return (
                  <article key={b.id} className={`flex flex-col gap-3.5 p-4 rounded-[18px] bg-[#161412] border ${waiting ? 'border-[#FF5A2C]/30' : 'border-[#2B2723]'}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-[50px] h-[50px] shrink-0 rounded-[14px] bg-[#1F1C19] flex flex-col items-center justify-center gap-px">
                        <span className="text-[10px] text-[#8C8477]">стол</span>
                        <span className="admin-display text-[26px] leading-[0.85]">{tableNum ?? '—'}</span>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="text-base font-semibold truncate">{userPhone || 'Гость'}</span>
                          {amount > 0 && <span className="admin-display text-[24px] leading-none shrink-0">{amount.toLocaleString('ru-RU')}&nbsp;₽</span>}
                        </div>
                        <span className="flex items-center gap-1.5 text-[12.5px] text-[#BDB5A8]">
                          {cat && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getCategoryColorFromCategory(cat).gradient }} />}
                          {[cat?.name, formatAdminSeatLabel(b)].filter((x) => x && x !== '—').join(' · ')}
                        </span>
                        <span className={`text-xs ${statusColor}`}>
                          {UI_TEXT.booking.adminStatusLabels[status] ?? status ?? '—'} · {formatAdminDate(b.created_at)}
                        </span>
                      </div>
                    </div>

                    {!tableId && (
                      <div className="rounded-xl bg-[#FF5A2C]/10 px-3 py-2.5 text-[12.5px] text-[#FF9C7F]">
                        У брони нет стола: его удалили из плана после покупки. Посадите гостя вручную.
                      </div>
                    )}

                    {comment && typeof comment === 'string' && comment.trim() !== '' && (
                      <div className="rounded-xl bg-[#1F1C19] px-3 py-2.5 text-sm text-white/80">
                        <div className="text-[11px] text-[#8C8477] mb-0.5">Комментарий</div>
                        {comment}
                      </div>
                    )}

                    <div className="text-[11.5px] text-[#8C8477] leading-relaxed">
                      {b.event?.title || UI_TEXT.event.eventFallback} · {formatEventDateDisplay(eventDetails) || formatAdminDate(b.event?.date)}
                      <br />
                      Код брони <span className="text-white/80 font-semibold tracking-[0.08em]">{bookingCode(b.id)}</span>
                      {' · '}{b.user_vk_id ? 'VK' : 'TG'} ID: {b.user_vk_id || telegramId || '—'}
                    </div>

                    {canConfirm && (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <button
                          type="button"
                          onClick={() => confirmBooking(b.id)}
                          disabled={confirmingId !== null || cancellingId !== null}
                          className="admin-cta h-11"
                        >
                          {confirmingId === b.id ? UI_TEXT.booking.confirming : 'Подтвердить оплату'}
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelBookingAction(b.id)}
                          disabled={confirmingId !== null || cancellingId !== null}
                          className="h-11 px-4 rounded-xl border border-[#2B2723] text-sm text-[#BDB5A8] disabled:opacity-50"
                        >
                          {cancellingId === b.id ? 'Отмена…' : 'Отменить'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {mode === 'layout' && (
        <div className="grid grid-cols-1 gap-4">
          {!inEvent && (
          <div>
            {eventsLoading && (
              <div className="space-y-3 mt-2" aria-label={UI_TEXT.admin.loadingEvents}>
                <EventCardSkeleton />
                <EventCardSkeleton />
                <EventCardSkeleton />
                <EventCardSkeleton />
              </div>
            )}
            {!eventsLoading && hasEvents && (
              <div ref={eventTabsScrollRef} role="tablist" aria-label="Фильтр событий" className="admin-segmented mb-4">
                {[
                  { key: 'published' as const, label: 'Активные', count: eventCounts.published },
                  { key: 'draft' as const, label: 'Черновики', count: eventCounts.draft },
                  { key: 'archived' as const, label: 'Архив', count: eventCounts.archived },
                  { key: 'deleted' as const, label: 'Корзина', count: eventCounts.deleted },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    ref={(el) => { eventTabRefs.current[tab.key] = el; }}
                    type="button"
                    role="tab"
                    aria-selected={eventStatusFilter === tab.key}
                    onClick={() => setEventStatusFilter(tab.key)}
                  >
                    {tab.label}
                    {tab.count > 0 && <span className="admin-segmented-count">{tab.count}</span>}
                  </button>
                ))}
              </div>
            )}
            {!eventsLoading && !hasEvents && (
              <div className="py-8 text-center">
                <p className="text-base text-[#6E6A64] mb-4">{UI_TEXT.admin.emptyEventsList}</p>
                <SecondaryButton
                  type="button"
                  onClick={createEvent}
                  disabled={creatingEvent}
                >
                  {creatingEvent ? UI_TEXT.admin.creatingEvent : UI_TEXT.admin.createEvent}
                </SecondaryButton>
              </div>
            )}
            {!eventsLoading && hasEvents && filteredEvents.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-base text-[#6E6A64]">Нет событий в этой категории.</p>
              </div>
            )}
            {!eventsLoading && hasEvents && filteredEvents.length > 0 && (
              <div className="space-y-3">
                {filteredEvents.map((ev) => (
                  <AdminEventCard
                    key={ev.id}
                    ev={ev}
                    onOpen={() => {
                      if (isDirty && selectedEventId && ev.id !== selectedEventId) {
                        setExitConfirmPending({ type: 'switchEvent', eventId: ev.id });
                      } else {
                        setSelectedEventId(ev.id);
                        setSelectedEvent(null);
                        setEventStep(1);
                        setError(null);
                        setSuccessMessage(null);
                        window.scrollTo({ top: 0 });
                        loadEvent(ev.id);
                      }
                    }}
                    onDelete={() => setDeleteConfirmEvent(ev)}
                  />
                ))}
              </div>
            )}
          </div>
          )}

          {inEvent && (
            <div className="-mx-4 -mt-5 mb-1 sticky top-0 z-30 bg-[#0C0B0A]/95 backdrop-blur border-b border-[#2B2723]">
              <header className="flex items-center gap-2.5 pl-2.5 pr-4 pt-3.5 pb-1">
                <button
                  type="button"
                  onClick={requestCloseEvent}
                  aria-label="К списку событий"
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-white/75"
                >
                  <AdminIcon d={ICON.back} size={22} sw={2} />
                </button>
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <div className="admin-display text-[23px] truncate">{eventTitle.trim() || selectedEvent?.title || 'Новое событие'}</div>
                  {eventSubtitle && <div className="text-[12.5px] text-[#8C8477] truncate">{eventSubtitle}</div>}
                </div>
              </header>
              <EventStepper step={eventStep} done={stepsDone} onStep={goStep} />
            </div>
          )}
          {inEvent && error && <div className="admin-notice admin-notice-error">{error}</div>}
          {inEvent && successMessage && <div className="admin-notice admin-notice-ok">{successMessage}</div>}
          {inEvent && !selectedEvent && (
            <div className="py-10 text-center text-sm text-[#8C8477]">{UI_TEXT.common.loading}</div>
          )}

          {selectedEvent && (
            <>
              {selectedTableId && !bulkMode && eventStep === 2 && (
                <TableEditPanel
                  table={tables.find((t) => t.id === selectedTableId) ?? null}
                  ticketCategories={(selectedEvent?.ticketCategories ?? []) as import('../types').TicketCategory[]}
                  onUpdate={(updates) => {
                    setTables((prev) =>
                      prev.map((t) => (t.id === selectedTableId ? { ...t, ...updates } : t))
                    );
                  }}
                  onDelete={() => deleteTable(selectedTableId)}
                  onClose={() => setSelectedTableId(null)}
                />
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                  {sectionOrder.map((key) => {
                    if (!EVENT_STEPS[eventStep - 1].sections.includes(key)) return null;
                    if (key === 'basic') return (
                      <SortableSectionInner key="basic" id="basic" title="О концерте" sectionKey="basic" dirtyIndicator openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
                        <div className="space-y-4">
                          <div>
                            <div className="text-sm font-semibold mb-1">{UI_TEXT.event.title}</div>
                            <input
                              type="text"
                              value={eventTitle}
                              onChange={(e) => { setEventTitle(e.target.value); }}
                              placeholder={UI_TEXT.event.titlePlaceholder}
                              className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                            />
                          </div>
                          <div>
                            <div className="text-sm font-semibold mb-1">{UI_TEXT.event.description}</div>
                            <textarea
                              value={eventDescription}
                              onChange={(e) => { setEventDescription(e.target.value); }}
                              placeholder={UI_TEXT.event.descriptionPlaceholder}
                              className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                              rows={3}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm font-semibold mb-1">{UI_TEXT.event.eventDate}</div>
                              <input
                                type="date"
                                value={eventDate}
                                onChange={(e) => { setEventDate(e.target.value); }}
                                placeholder={UI_TEXT.event.eventDatePlaceholder}
                                className="w-full max-w-full min-w-0 appearance-none border rounded px-3 py-2 text-sm box-border"
                              />
                            </div>
                            <div>
                              <div className="text-sm font-semibold mb-1">{UI_TEXT.event.eventTime}</div>
                              <input
                                type="time"
                                value={eventTime}
                                onChange={(e) => { setEventTime(e.target.value); }}
                                placeholder={UI_TEXT.event.eventTimePlaceholder}
                                className="w-full max-w-full min-w-0 appearance-none border rounded px-3 py-2 text-sm box-border"
                              />
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-semibold mb-1">{UI_TEXT.event.timezoneRef}</div>
                            <p className="text-xs text-muted mb-2">{UI_TEXT.event.timezoneRefHint}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-white">{formatUtcOffset(timezoneOffsetMinutes)}</span>
                              {timezoneOffsetMinutes !== -new Date().getTimezoneOffset() && (
                                <button
                                  type="button"
                                  onClick={() => setTimezoneOffsetMinutes(-new Date().getTimezoneOffset())}
                                  className="admin-chip"
                                >
                                  Как на этом телефоне: {formatUtcOffset(-new Date().getTimezoneOffset())}
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-semibold mb-1">{UI_TEXT.event.venue}</div>
                            <input
                              type="text"
                              value={venue}
                              onChange={(e) => { setVenue(e.target.value); }}
                              placeholder={UI_TEXT.event.venuePlaceholder}
                              className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                            />
                          </div>
                          <div>
                            <div className="text-sm font-semibold mb-1">{UI_TEXT.event.posterSectionLabel}</div>
                            {eventPosterUrl ? (
                              <div className="space-y-2">
                                <div className="rounded border overflow-hidden bg-surface max-h-32">
                                  <img src={eventPosterUrl} alt="" className="w-full h-auto max-h-32 object-contain" onError={() => { }} />
                                </div>
                                <label className="inline-block">
                                  <span className="px-4 py-2 text-sm rounded-xl border border-white/20 hover:bg-white/5 cursor-pointer transition">
                                    Заменить
                                  </span>
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handlePosterUpload(file);
                                      e.target.value = '';
                                    }}
                                    disabled={posterUploadLoading || !selectedEvent?.id}
                                  />
                                </label>
                              </div>
                            ) : (
                              <label className="block">
                                <span className="inline-block px-4 py-2 text-sm rounded-xl border border-white/20 hover:bg-white/5 cursor-pointer transition">
                                  Загрузить афишу
                                </span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handlePosterUpload(file);
                                    e.target.value = '';
                                  }}
                                  disabled={posterUploadLoading || !selectedEvent?.id}
                                />
                              </label>
                            )}
                            {posterUploadLoading && <div className="text-xs text-muted mt-1">{UI_TEXT.common.loading}</div>}
                            {posterUploadError && <div className="text-xs text-[#6E6A64] mt-1">{posterUploadError}</div>}
                          </div>
                          <div>
                            <div className="text-sm font-semibold mb-1">{UI_TEXT.event.ticketTemplateSectionLabel}</div>
                            {eventTicketTemplateUrl ? (
                              <div className="space-y-2">
                                <div className="rounded border overflow-hidden bg-surface max-h-32">
                                  <img src={eventTicketTemplateUrl} alt="" className="w-full h-auto max-h-32 object-contain" onError={() => { }} />
                                </div>
                                <label className="inline-block">
                                  <span className="px-4 py-2 text-sm rounded-xl border border-white/20 hover:bg-white/5 cursor-pointer transition">
                                    Заменить
                                  </span>
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleTicketTemplateUpload(file);
                                      e.target.value = '';
                                    }}
                                    disabled={ticketTemplateUploadLoading || !selectedEvent?.id}
                                  />
                                </label>
                              </div>
                            ) : (
                              <label className="block">
                                <span className="inline-block px-4 py-2 text-sm rounded-xl border border-white/20 hover:bg-white/5 cursor-pointer transition">
                                  Загрузить шаблон PNG
                                </span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleTicketTemplateUpload(file);
                                    e.target.value = '';
                                  }}
                                  disabled={ticketTemplateUploadLoading || !selectedEvent?.id}
                                />
                              </label>
                            )}
                            {ticketTemplateUploadLoading && <div className="text-xs text-muted mt-1">{UI_TEXT.common.loading}</div>}
                            {ticketTemplateUploadError && <div className="text-xs text-[#6E6A64] mt-1">{ticketTemplateUploadError}</div>}
                          </div>
                        </div>
                      </SortableSectionInner>
                    );
                    if (key === 'categories') return (
                      <SortableSectionInner key="categories" id="categories" title="Категории и цены" sectionKey="categories" openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
                        <div className="flex flex-col gap-2.5">
                          {(selectedEvent?.ticketCategories ?? []).map((cat) => {
                            const colorConfig = getCategoryColorFromCategory(cat);
                            const catTables = tables.filter((t) => t.categoryId === cat.id && t.isActive && (!t.objectType || t.objectType === 'table'));
                            const catSeats = catTables.reduce((n, t) => n + (t.seatsCount ?? 0), 0);
                            const open = openCategoryId === cat.id;
                            return (
                              <div key={cat.id} className={`rounded-2xl bg-[#161412] border ${open ? 'border-[#C6A75E]/40' : 'border-transparent'} ${cat.isActive ? '' : 'opacity-60'}`}>
                                <button
                                  type="button"
                                  onClick={() => setOpenCategoryId(open ? null : cat.id)}
                                  aria-expanded={open}
                                  className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left"
                                >
                                  <span className="w-3.5 h-3.5 rounded-full shrink-0 ring-[1.5px] ring-white/20" style={{ background: colorConfig.gradient }} />
                                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-base font-semibold text-white truncate">{cat.name || 'Без названия'}</span>
                                    <span className="text-[12.5px] text-[#8C8477]">
                                      {cat.isActive ? (catTables.length > 0 ? `${catTables.length} ${catTables.length === 1 ? 'стол' : catTables.length < 5 ? 'стола' : 'столов'} · ${catSeats} мест` : 'Столов пока нет') : 'Не продаётся'}
                                    </span>
                                  </span>
                                  <span className="admin-display text-[30px] leading-none">{Number(cat.price || 0).toLocaleString('ru-RU')}&nbsp;₽</span>
                                </button>
                                {open && (
                                <div className="px-4 pb-4 space-y-3 border-t border-[#2B2723] pt-3">
                                <div className="flex items-center gap-2">
                                  <label className="relative w-6 h-6 rounded border border-[#2A2A2A] shrink-0 cursor-pointer block" style={{ background: colorConfig.gradient }} title={`${colorConfig.label}. Клик — выбрать цвет из палитры`}>
                                    <input
                                      type="color"
                                      value={cat.custom_color ?? colorConfig.base}
                                      onChange={(e) => {
                                        const hex = e.target.value;
                                        setSelectedEvent((prev) =>
                                          prev
                                            ? {
                                              ...prev,
                                              ticketCategories: (prev.ticketCategories ?? []).map((c) =>
                                                c.id === cat.id ? { ...c, custom_color: hex, color_key: undefined } : c
                                              ),
                                            }
                                            : null
                                        );
                                      }}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                  </label>
                                  <input
                                    type="text"
                                    value={cat.name}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setSelectedEvent((prev) =>
                                        prev
                                          ? {
                                            ...prev,
                                            ticketCategories: (prev.ticketCategories ?? []).map((c) =>
                                              c.id === cat.id ? { ...c, name: val } : c
                                            ),
                                          }
                                          : null
                                      );
                                    }}
                                    placeholder="Название"
                                    className="flex-1 border rounded px-2 py-1 text-sm bg-[#0F0F0F] border-[#2A2A2A] text-[#EAE6DD]"
                                  />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-[#6E6A64] block mb-1">Цена</label>
                                    <input
                                      type="number"
                                      min={0}
                                      step={100}
                                      value={cat.price}
                                      onChange={(e) => {
                                        const val = Math.max(0, Number(e.target.value) || 0);
                                        setSelectedEvent((prev) =>
                                          prev
                                            ? {
                                              ...prev,
                                              ticketCategories: (prev.ticketCategories ?? []).map((c) =>
                                                c.id === cat.id ? { ...c, price: val } : c
                                              ),
                                            }
                                            : null
                                        );
                                      }}
                                      className="w-full border rounded px-2 py-1 text-sm bg-[#0F0F0F] border-[#2A2A2A] text-[#EAE6DD]"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-[#6E6A64] block mb-2">Цвет</label>
                                    <div className="grid grid-cols-3 gap-3">
                                      {CATEGORY_COLOR_KEYS.map((key) => {
                                        const config = CATEGORY_COLORS[key];
                                        const isPresetSelected = !cat.custom_color && (cat.color_key ?? cat.styleKey ?? 'gold') === key;
                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            onClick={() => {
                                              setSelectedEvent((prev) =>
                                                prev
                                                  ? {
                                                    ...prev,
                                                    ticketCategories: (prev.ticketCategories ?? []).map((c) =>
                                                      c.id === cat.id ? { ...c, color_key: key, custom_color: undefined } : c
                                                    ),
                                                  }
                                                  : null
                                              );
                                            }}
                                            className={`h-10 w-10 rounded-full transition-all hover:scale-105 ${isPresetSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141414]' : ''
                                              }`}
                                            style={{
                                              background: config.gradient,
                                              boxShadow: isPresetSelected ? config.glow : 'none',
                                            }}
                                            title={config.label}
                                          />
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs text-[#6E6A64] block mb-1">Описание</label>
                                  <textarea
                                    value={cat.description}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setSelectedEvent((prev) =>
                                        prev
                                          ? {
                                            ...prev,
                                            ticketCategories: (prev.ticketCategories ?? []).map((c) =>
                                              c.id === cat.id ? { ...c, description: val } : c
                                            ),
                                          }
                                          : null
                                      );
                                    }}
                                    placeholder="Описание категории"
                                    rows={2}
                                    className="w-full border rounded px-2 py-1 text-sm bg-[#0F0F0F] border-[#2A2A2A] text-[#EAE6DD]"
                                  />
                                </div>
                                <label className="flex items-center gap-3 pt-1">
                                  <span className="flex-1 text-sm text-white">Продаётся</span>
                                  <input
                                    type="checkbox"
                                    role="switch"
                                    className="admin-switch"
                                    checked={cat.isActive}
                                    onChange={(e) => {
                                      const next = e.target.checked;
                                      // Same guard the old ✕ button had: a category tables still use cannot be switched off.
                                      if (!next && tables.some((t) => t.categoryId === cat.id)) {
                                        alert('Нельзя отключить категорию, к которой привязаны столы.');
                                        return;
                                      }
                                      setSelectedEvent((prev) =>
                                        prev
                                          ? {
                                            ...prev,
                                            ticketCategories: (prev.ticketCategories ?? []).map((c) =>
                                              c.id === cat.id ? { ...c, isActive: next } : c
                                            ),
                                          }
                                          : null
                                      );
                                    }}
                                  />
                                </label>
                                </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newCat: TicketCategory = {
                              id: crypto.randomUUID(),
                              name: 'Новая категория',
                              price: 1000,
                              description: '',
                              styleKey: 'gold',
                              color_key: 'gold',
                              isActive: true,
                            };
                            setSelectedEvent((prev) =>
                              prev
                                ? {
                                  ...prev,
                                  ticketCategories: [...(prev.ticketCategories ?? []), newCat],
                                }
                                : null
                            );
                            setOpenCategoryId(newCat.id);
                          }}
                          className="mt-2.5 w-full h-12 rounded-2xl border border-dashed border-[#2B2723] text-[#BDB5A8] text-sm"
                        >
                          + Добавить категорию
                        </button>
                        {(() => {
                          const cats = selectedEvent?.ticketCategories ?? [];
                          const priceOf = (id: string) => Number(cats.find((c) => c.id === id)?.price ?? 0);
                          const bookable = tables.filter((t) => !t.objectType || t.objectType === 'table');
                          // TableModel.isActive = not deleted AND on sale (see src/model/table.ts).
                          const onSale = bookable.filter((t) => t.isActive);
                          const seats = onSale.reduce((n, t) => n + (t.seatsCount ?? 0), 0);
                          const full = onSale.reduce((n, t) => n + (t.seatsCount ?? 0) * priceOf(t.categoryId), 0);
                          const closed = bookable.filter((t) => !t.isActive).reduce((n, t) => n + (t.seatsCount ?? 0), 0);
                          const noCategory = onSale.filter((t) => !cats.some((c) => c.id === t.categoryId)).length;
                          if (!seats) return null;
                          return (
                            <div className="flex flex-col gap-1 px-1 pt-4 text-[13px]">
                              <div className="flex justify-between items-baseline">
                                <span className="text-[#8C8477]">Если продать всё, {seats} мест</span>
                                <span className="text-[15px] font-semibold text-[#C6A75E]">{full.toLocaleString('ru-RU')}&nbsp;₽</span>
                              </div>
                              {closed > 0 && <span className="text-[12px] text-[#8C8477]">Не считая {closed} мест, закрытых от продажи</span>}
                              {noCategory > 0 && (
                                <span className="text-[12px] text-[#FF9C7F]">
                                  {noCategory} {noCategory === 1 ? 'стол' : noCategory < 5 ? 'стола' : 'столов'} без категории — у них нет цены
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </SortableSectionInner>
                    );
                    if (key === 'publish') return (
                      <SortableSectionInner key="publish" id="publish" title="Продажи" sectionKey="publish" openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
                        {(() => {
                          const st = selectedEvent?.status;
                          const live = st === 'published';
                          return (
                            <div className={`rounded-[20px] p-[18px] mb-3 bg-[#161412] border ${live ? 'border-[#57C79B]/35' : 'border-[#2B2723]'}`}>
                              <div className={`admin-display text-[34px] ${live ? 'text-[#57C79B]' : st === 'archived' ? 'text-white/55' : 'text-[#F3EEE6]'}`}>
                                {live ? 'Продажи открыты' : st === 'archived' ? UI_TEXT.admin.archived : UI_TEXT.admin.draft}
                              </div>
                              <p className="text-[13px] text-[#BDB5A8] mt-1">
                                {live ? 'Гости видят событие и бронируют места' : st === 'archived' ? 'Событие в архиве' : 'Черновик — доступен только вам'}
                              </p>
                          {selectedEvent?.status === 'archived' && (
                            <PrimaryButton
                              type="button"
                              onClick={async () => {
                                if (!selectedEventId || !selectedEvent) return;
                                const rawTables = tables;
                                const numErr = validateTableNumbers(rawTables);
                                if (numErr) { setError(numErr); return; }
                                const rectErr = validateRectTables(rawTables);
                                if (rectErr) { setError(rectErr); return; }
                                setStatusActionLoading(true);
                                setError(null);
                                setSuccessMessage(null);
                                try {
                                  const payload: StorageService.AdminEventPayload = {
                                    status: 'published' as const,
                                    ticketCategories: selectedEvent?.ticketCategories ?? [],
                                    tables: rawTables.map((t, idx) => tableForBackend(t, idx)),
                                  };
                                  await StorageService.updateAdminEvent(selectedEvent.id, payload);
                                  setSuccessMessage(UI_TEXT.admin.eventPublishedAgain);
                                  await loadEvent(selectedEventId);
                                } catch (e) {
                                  setError(toFriendlyError(e));
                                } finally {
                                  setStatusActionLoading(false);
                                }
                              }}
                              disabled={statusActionLoading}
                              className="mt-3 disabled:opacity-50"
                            >
                              {statusActionLoading ? '…' : UI_TEXT.admin.publishAgain}
                            </PrimaryButton>
                          )}
                            </div>
                          );
                        })()}
                        <div className="flex flex-col gap-2">
                          <label className="admin-switch-row">
                            <span className="flex-1 flex flex-col gap-0.5">
                              <span className="text-[15px] font-semibold text-white">Продажи открыты</span>
                              <span className="text-[12.5px] text-[#8C8477]">
                                {eventPublished !== (selectedEvent?.published === true) ? 'Включится после «Сохранить»' : 'Событие видно в афише'}
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              role="switch"
                              className="admin-switch"
                              checked={eventPublished}
                              onChange={(e) => { setEventPublished(e.target.checked); }}
                            />
                          </label>
                          <label className="admin-switch-row">
                            <span className="flex-1 flex flex-col gap-0.5">
                              <span className="text-[15px] font-semibold text-white">{UI_TEXT.admin.featuredCheckbox}</span>
                              <span className="text-[12.5px] text-[#8C8477]">Первым на главном экране</span>
                            </span>
                            <input
                              type="checkbox"
                              role="switch"
                              className="admin-switch"
                              checked={eventFeatured}
                              onChange={(e) => { setEventFeatured(e.target.checked); }}
                            />
                          </label>
                          <div className="rounded-2xl bg-[#161412] px-4 py-3.5 flex flex-col gap-2">
                            <label htmlFor="admin-payment-phone" className="text-[15px] font-semibold text-white">Телефон для оплаты по СБП</label>
                            <input
                              id="admin-payment-phone"
                              type="tel"
                              inputMode="tel"
                              value={eventPhone}
                              onChange={(e) => { setEventPhone(e.target.value); }}
                              placeholder={UI_TEXT.event.phonePlaceholder}
                              className="w-full"
                            />
                          </div>
                        </div>
                        {selectedEvent?.id && (
                          <button
                            type="button"
                            onClick={() => {
                              const id = selectedEvent?.id;
                              if (!id) return;
                              if (onViewAsUser) {
                                onViewAsUser(id);
                              } else {
                                window.open(`${window.location.origin}/#/event/${id}`, '_blank');
                              }
                            }}
                            className="mt-3 w-full h-12 flex items-center justify-center gap-2 rounded-2xl border border-[#C6A75E] text-[#C6A75E] text-[15px] font-semibold"
                          >
                            <AdminIcon d={ICON.eye} size={20} />
                            Посмотреть как гость
                          </button>
                        )}
                          {selectedEvent?.status === 'published' && (
                            <DangerButton
                              type="button"
                              onClick={async () => {
                                if (!selectedEventId) return;
                                setStatusActionLoading(true);
                                setError(null);
                                setSuccessMessage(null);
                                try {
                                  await StorageService.archiveAdminEvent(selectedEventId);
                                  setSuccessMessage(UI_TEXT.admin.eventArchived);
                                  await loadEvent(selectedEventId);
                                } catch (e) {
                                  setError(toFriendlyError(e));
                                } finally {
                                  setStatusActionLoading(false);
                                }
                              }}
                              disabled={statusActionLoading}
                              className="w-full h-11 rounded-xl text-sm text-white/60 bg-transparent border-0 disabled:opacity-50"
                            >
                              {statusActionLoading ? '…' : UI_TEXT.admin.archiveEvent}
                            </DangerButton>
                          )}
                      </SortableSectionInner>
                    );
                    if (key === 'tables') return (
                      <SortableSectionInner key="tables" id="tables" title={`Все столы · ${tables.length}`} sectionKey="tables" openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
                        <div className="space-y-3">
                          <p className="text-xs text-[#8C8477]">Нажмите номер, чтобы открыть стол.</p>
                          {tables.length === 0 && (
                            <div className="text-xs text-muted">{UI_TEXT.tables.noTablesYet}</div>
                          )}
                          <div className="grid grid-cols-5 gap-2">
                          {tables.map((t, idx) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => { setBulkMode(false); setSelectedTableId(t.id); }}
                              aria-label={`${UI_TEXT.tables.table} ${t.number ?? idx + 1}, мест: ${t.seatsCount ?? 0}`}
                              className={`h-12 rounded-xl flex flex-col items-center justify-center leading-none border transition ${selectedTableId === t.id
                                ? 'border-[#C6A75E] bg-[#C6A75E]/10 text-[#C6A75E]'
                                : 'border-[#2B2723] bg-[#161412] text-white'
                                }`}
                            >
                              <span className="text-[15px] font-semibold">{t.number ?? idx + 1}</span>
                              <span className="text-[10.5px] text-[#8C8477] mt-1">{t.seatsCount ?? 0} мест</span>
                            </button>
                          ))}
                          </div>
                        </div>
                      </SortableSectionInner>
                    );
                    if (key === 'layout') return (
                      <SortableSectionInner key="layout" id="layout" title="План зала" sectionKey="layout" openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
                        <div className="flex flex-col gap-3">
                          {/* Tools in one row; the plan comes right after — it is what this step is about. */}
                          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
                              <button
                                type="button"
                                disabled={venueBusy}
                                onClick={() => {
                                  const next = !venuesOpen;
                                  setVenuesOpen(next);
                                  if (next) void loadVenues();
                                }}
                                className={`admin-chip ${venuesOpen ? 'admin-chip-on' : ''}`}
                              >
                                Библиотека залов
                              </button>
                              <button
                                type="button"
                                disabled={tables.length === 0}
                                onClick={() => {
                                  if (bulkMode) exitBulkMode();
                                  else { setBulkMode(true); setSelectedTableId(null); }
                                }}
                                className={`admin-chip ${bulkMode ? 'admin-chip-on' : ''}`}
                              >
                                {bulkMode ? 'Выйти из выбора' : 'Выбрать несколько'}
                              </button>
                            <label
                              className={`admin-chip cursor-pointer ${detectLoading || !selectedEvent?.id ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                disabled={detectLoading || !selectedEvent?.id}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setDetectLoading(true);
                                  setDetectError(null);
                                  try {
                                    const objects = await StorageService.detectLayout(file);
                                    if (!objects.length) {
                                      setDetectError('Объекты не обнаружены. Попробуйте другое изображение.');
                                      return;
                                    }
                                    // Convert detected objects to TableModel format and add to tables
                                    const existingTableNums = tables.filter(t => !t.objectType || t.objectType === 'table').map(t => t.number);
                                    let tableCounter = existingTableNums.length > 0 ? Math.max(...existingTableNums) : 0;
                                    // Decorative objects get unique negative numbers (never conflict with positive table numbers;
                                    // excluded from the uniqueness constraint on the DB side too)
                                    const existingDecorNums = tables.filter(t => t.objectType && t.objectType !== 'table').map(t => t.number);
                                    let decorCounter = existingDecorNums.length > 0 ? Math.min(...existingDecorNums) : 0;
                                    const newObjects: TableModel[] = objects.map((obj) => {
                                      const isTable = obj.type === 'table';
                                      if (isTable) tableCounter++;
                                      else decorCounter--;
                                      const seats = obj.seatsTotal ?? 4;
                                      const isCircle = obj.shape !== 'rect';
                                      const table: TableModel = {
                                        id: crypto.randomUUID(),
                                        number: isTable ? tableCounter : decorCounter,
                                        centerXPercent: obj.centerX,
                                        centerYPercent: obj.centerY,
                                        shape: isCircle ? 'circle' : 'rect',
                                        widthPercent: obj.widthPercent,
                                        // A circle is square; keep the model consistent
                                        // instead of storing a height it will never use.
                                        heightPercent: isCircle ? obj.widthPercent : obj.heightPercent,
                                        rotationDeg: obj.rotation ?? 0,
                                        seatsCount: seats,
                                        seatsAvailable: seats,
                                        categoryId: '',
                                        isActive: true,
                                        objectType: obj.type,
                                        label: obj.label,
                                      };
                                      return table;
                                    });
                                    setTables((prev) => [...prev, ...newObjects]);
                                  } catch (err) {
                                    setDetectError(err instanceof Error ? err.message : 'Ошибка распознавания');
                                  } finally {
                                    setDetectLoading(false);
                                    e.target.value = '';
                                  }
                                }}
                              />
                              {detectLoading ? 'Распознаю…' : 'Распознать столы'}
                            </label>
                          </div>
                            {detectError && (
                              <span className="block text-xs text-[#FF9C7F]">{detectError}</span>
                            )}
                          {bulkMode && (
                            <div className="flex gap-2">
                              {bulkMode && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setBulkIds(bookableTables.map((t) => t.id))}
                                    className="admin-chip"
                                  >
                                    Все столы ({bookableTables.length})
                                  </button>
                                  {bulkIds.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setBulkIds([])}
                                      className="admin-chip"
                                    >
                                      Снять
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                            {bulkMode && (
                              <div className="mt-2 rounded-xl border border-[#C6A75E]/30 bg-[#C6A75E]/5 p-3 space-y-3">
                                {bulkIds.length === 0 ? (
                                  <p className="text-xs text-white/60">
                                    Нажимайте на столы на плане, чтобы выбрать их. Потом задайте категорию сразу всем.
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-xs text-[#C6A75E]">Выбрано столов: {bulkIds.length}</p>

                                    <div>
                                      <label className="block text-xs text-white/60 mb-1">Категория для всех</label>
                                      <select
                                        defaultValue=""
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === '') return;
                                          applyToBulk({ categoryId: val === '__none__' ? '' : val });
                                          e.target.value = '';
                                        }}
                                        className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white text-sm"
                                      >
                                        <option value="">Выберите категорию…</option>
                                        <option value="__none__">Без категории</option>
                                        {(selectedEvent?.ticketCategories ?? []).map((c) => (
                                          <option key={c.id} value={c.id}>{c.name} ({c.price} ₽)</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="flex items-end gap-2">
                                      <div className="flex-1">
                                        <label className="block text-xs text-white/60 mb-1">Мест за столом</label>
                                        <input
                                          type="number"
                                          min={0}
                                          placeholder="—"
                                          onKeyDown={(e) => {
                                            if (e.key !== 'Enter') return;
                                            const raw = (e.target as HTMLInputElement).value;
                                            if (raw === '') return;
                                            const val = Math.max(0, parseInt(raw, 10) || 0);
                                            applyToBulk({ seatsCount: val, seatsAvailable: val });
                                            (e.target as HTMLInputElement).value = '';
                                          }}
                                          onBlur={(e) => {
                                            const raw = e.target.value;
                                            if (raw === '') return;
                                            const val = Math.max(0, parseInt(raw, 10) || 0);
                                            applyToBulk({ seatsCount: val, seatsAvailable: val });
                                            e.target.value = '';
                                          }}
                                          className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white text-sm"
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={deleteBulk}
                                        className="px-3 py-2 rounded-lg text-xs border border-red-500/40 text-red-400"
                                      >
                                        Удалить
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            {venueNotice && <div className="text-xs text-[#7ED6A5] mt-2">{venueNotice}</div>}
                            {venueError && <div className="text-xs text-red-400 mt-2">{venueError}</div>}
                          {venuesOpen && (
                            <div className="rounded-2xl bg-[#161412] p-3 flex flex-col gap-2">
                              <button
                                type="button"
                                disabled={venueBusy || !selectedEvent?.id || tables.length === 0}
                                onClick={handleSaveVenue}
                                className="w-full h-11 rounded-xl border border-[#C6A75E]/50 text-[#C6A75E] text-sm disabled:opacity-40"
                              >
                                Сохранить эту расстановку в библиотеку
                              </button>
                            {(
                              <div className="mt-2 space-y-1">
                                {venues.length === 0 && (
                                  <div className="text-xs text-muted">
                                    Библиотека пуста. Расставьте зал и сохраните его — в следующий раз он подставится готовым.
                                  </div>
                                )}
                                {venues.map((v) => (
                                  <div
                                    key={v.id}
                                    className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm text-white truncate">{v.name}</div>
                                      <div className="text-[11px] text-muted">
                                        {v.tableCount} столов · {v.seatCount} мест
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={venueBusy}
                                      onClick={() => handleApplyVenue(v)}
                                      className="px-2 py-1 rounded text-xs border border-[#C6A75E]/40 text-[#C6A75E] disabled:opacity-40"
                                    >
                                      Загрузить
                                    </button>
                                    <button
                                      type="button"
                                      disabled={venueBusy}
                                      onClick={() => handleDeleteVenue(v)}
                                      aria-label={`Удалить зал ${v.name}`}
                                      className="px-2 py-1 rounded text-xs text-white/40 disabled:opacity-40"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            </div>
                          )}
                          {layoutUploadLoading && <div className="text-xs text-muted mt-1">{UI_TEXT.common.loading}</div>}
                          {layoutUploadError && <div className="text-xs text-[#6E6A64] mt-1">{layoutUploadError}</div>}
                          {layoutAspectWarning && (
                            <div
                              role="alert"
                              className="mt-2 rounded-lg border border-[#E0A94A]/40 bg-[#E0A94A]/10 px-3 py-2 text-xs leading-relaxed text-[#E0A94A]"
                            >
                              {layoutAspectWarning}
                            </div>
                          )}
                        <div>
                          <div className="text-sm font-semibold mb-2 flex items-center justify-between gap-2">
                            <span>{UI_TEXT.tables.layoutPreview}</span>
                            <button
                              type="button"
                              onClick={() => layoutZoomResetRef.current?.()}
                              className="text-xs text-[#C6A75E] hover:underline"
                            >
                              Сбросить масштаб
                            </button>
                          </div>
                          <div className="relative" style={{ overflow: 'hidden', touchAction: 'none' }}>
                            <TransformWrapper
                              minScale={0.5}
                              maxScale={3}
                              initialScale={1}
                              limitToBounds={true}
                              centerOnInit={true}
                              wheel={{ step: 0.08 }}
                              pinch={{ step: 5 }}
                              doubleClick={{ disabled: true }}
                              panning={{ velocityDisabled: false, excluded: ['table-wrapper'] }}
                            >
                              {({ resetTransform }) => {
                                layoutZoomResetRef.current = () => resetTransform(300, 'easeOut');
                                return (
                                  <>
                                    <TransformComponent
                                      wrapperStyle={{ width: '100%', height: '100%', touchAction: 'none' }}
                                      contentStyle={{ width: '100%', height: '100%', position: 'relative', touchAction: 'none' }}
                                    >
                                      <div
                                        ref={layoutPreviewRef}
                                        className="border border-[#242424] rounded-xl bg-[#111111] cursor-crosshair"
                                        style={{
                                          position: 'relative',
                                          width: '100%',
                                          maxWidth: 600,
                                          margin: '0 auto',
                                          containerType: 'inline-size',
                                          cursor: isAddTableMode ? 'crosshair' : 'default',
                                        }}
                                        onClick={(e) => {
                                          if (!isAddTableMode) return;
                                          const target = e.target as HTMLElement;
                                          if (target.closest('[data-table-id]')) return;
                                          const layout = layoutPreviewRef.current;
                                          const img = layout?.querySelector('img');
                                          if (img && (e.target === img || img.contains(target))) {
                                            const me = e.nativeEvent as MouseEvent;
                                            const percentX = (me.offsetX / img.clientWidth) * 100;
                                            const percentY = (me.offsetY / img.clientHeight) * 100;
                                            addTable(percentX, percentY);
                                            setIsAddTableMode(false);
                                          } else if (layout && layoutUrl) {
                                            const rect = layout.getBoundingClientRect();
                                            const percentX = ((e.clientX - rect.left) / rect.width) * 100;
                                            const percentY = ((e.clientY - rect.top) / rect.height) * 100;
                                            addTable(percentX, percentY);
                                            setIsAddTableMode(false);
                                          }
                                        }}
                                      >
                                        {layoutUrl ? (
                                          <img
                                            src={layoutUrl}
                                            alt=""
                                            style={{
                                              width: '100%',
                                              height: 'auto',
                                              display: 'block',
                                            }}
                                          />
                                        ) : (
                                          <div className="flex items-center justify-center py-12 text-xs text-muted">
                                            {UI_TEXT.tables.noLayoutImage}
                                          </div>
                                        )}
                                        <AdminTablesLayer
                                          tables={tables}
                                          ticketCategories={selectedEvent?.ticketCategories ?? []}
                                          selectedTableId={bulkMode ? null : selectedTableId}
                                          bulkIds={bulkMode ? bulkIds : undefined}
                                          onTableSelect={(id) => {
                                            if (bulkMode) toggleBulk(id);
                                            else setSelectedTableId(id);
                                          }}
                                          onTablesChange={(updater) => setTables(updater)}
                                        />
                                      </div>
                                    </TransformComponent>
                                  </>
                                );
                              }}
                            </TransformWrapper>
                          </div>
                          <div className="text-xs text-muted mt-2">
                            {isAddTableMode ? UI_TEXT.tables.addTableHint : UI_TEXT.tables.layoutHint}
                          </div>
                          <div className="mt-2">
                            <PrimaryButton
                              onClick={() => setIsAddTableMode((prev) => !prev)}
                              className={isAddTableMode ? 'ring-2 ring-[#C6A75E]' : ''}
                            >
                              {isAddTableMode ? UI_TEXT.common.cancel : UI_TEXT.tables.addTable}
                            </PrimaryButton>
                          </div>
                        </div>
                          <details className="rounded-2xl bg-[#161412] px-4 py-1">
                            <summary className="min-h-[44px] flex items-center text-sm text-[#BDB5A8] cursor-pointer">Заменить картинку плана</summary>
                            <div className="pb-4">
                          <div className="text-sm font-semibold mb-1">{UI_TEXT.tables.layoutImageUrl}</div>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !selectedEvent?.id) return;
                              setLayoutUploadLoading(true);
                              setLayoutUploadError(null);
                              setLayoutAspectWarning(null);
                              try {
                                const res = await StorageService.uploadLayoutImage(selectedEvent.id, file);
                                setLayoutUrl(res.url);
                                setLayoutUploadVersion(res.version ?? null);
                                if (res.aspectChanged && res.previousWidth && res.previousHeight && res.width && res.height) {
                                  const before = `${res.previousWidth}×${res.previousHeight}`;
                                  const after = `${res.width}×${res.height}`;
                                  setLayoutAspectWarning(
                                    `Пропорции плана изменились: было ${before}, стало ${after}. ` +
                                    `Столы остались на прежних координатах, но относительно нового рисунка они сместятся. ` +
                                    `Проверьте расстановку ниже и поправьте, что уехало.`
                                  );
                                }
                              } catch (err) {
                                setLayoutUploadError(err instanceof Error ? err.message : 'Upload failed');
                              } finally {
                                setLayoutUploadLoading(false);
                                e.target.value = '';
                              }
                            }}
                            disabled={layoutUploadLoading || !selectedEvent?.id}
                            className="w-full max-w-full border rounded px-3 py-2 text-sm box-border file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-surface file:cursor-pointer"
                          />
                          <input
                            type="text"
                            value={layoutUrl}
                            onChange={(e) => { setLayoutUrl(e.target.value); setLayoutUploadError(null); setLayoutUploadVersion(null); setLayoutAspectWarning(null); }}
                            placeholder={UI_TEXT.tables.layoutImagePlaceholder}
                            className="w-full max-w-full border rounded px-3 py-2 text-sm box-border mt-2"
                          />
                          <div className="text-xs text-muted mt-1">
                            {UI_TEXT.tables.layoutImageHint}
                          </div>
                          {/* No thumbnail here: the preview right below shows the same plan
                              larger, and on a phone the duplicate cost a screen of scrolling. */}
                          {layoutUrl && layoutUploadVersion != null && (
                            <div className="text-xs text-muted mt-1">Версия плана: {layoutUploadVersion}</div>
                          )}
                          <div className="mt-3">
                            <SecondaryButton
                              onClick={() => { setLayoutUrl(selectedEvent?.layoutImageUrl || ''); setLayoutUploadVersion(null); setLayoutAspectWarning(null); }}
                              className="w-full md:w-auto"
                            >
                              {UI_TEXT.common.reset}
                            </SecondaryButton>
                          </div>
                            </div>
                          </details>
                        </div>
                      </SortableSectionInner>
                    );
                    return null;
                  })}
                </SortableContext>
              </DndContext>
            </>
          )}
        </div>
      )}

      {inEvent && selectedEvent && !(eventStep === 2 && selectedTableId && !bulkMode) && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 max-w-[420px] mx-auto bg-[#0C0B0A]/95 backdrop-blur border-t border-[#2B2723] px-4 pt-3.5 flex items-center gap-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[12.5px]">
            {savingLayout ? (
              <span className="text-white/60">{UI_TEXT.common.saving}</span>
            ) : isDirty ? (
              <span className="text-[#E8B04B]">Не сохранено</span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#8C8477] whitespace-nowrap">
                <span className="text-[#57C79B] flex"><AdminIcon d={ICON.check} size={16} sw={2.2} /></span>
                Всё сохранено
              </span>
            )}
          </span>
          {isDirty && (
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={savingLayout}
              className="admin-cta h-12 px-5"
            >
              {UI_TEXT.common.save}
            </button>
          )}
          {eventStep < 4 ? (
            <button
              type="button"
              onClick={() => goStep((eventStep + 1) as EventStep)}
              aria-label={`Дальше: ${EVENT_STEPS[eventStep].label}`}
              className={isDirty ? 'admin-icon-btn h-12 w-12' : 'admin-cta h-12 pl-5 pr-4'}
            >
              {!isDirty && <>Дальше: {EVENT_STEPS[eventStep].label.toLowerCase()}</>}
              <AdminIcon d={ICON.next} size={18} sw={2.2} />
            </button>
          ) : !isDirty && (
            <button type="button" onClick={requestCloseEvent} className="admin-icon-btn h-12 px-4 w-auto text-sm">
              К событиям
            </button>
          )}
        </div>
      )}

      {!inEvent && (
        <AdminTabBar
          active={mode === 'bookings' ? 'bookings' : mode === 'layout' ? 'events' : 'team'}
          waiting={waitingCount}
          onEvents={goEvents}
          onBookings={goBookings}
          onTeam={goTeam}
        />
      )}

      {exitConfirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">
              {UI_TEXT.common.unsavedChangesTitle}
            </h3>
            <p className="text-sm text-white/70 mb-4">
              {UI_TEXT.common.unsavedChangesText}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setExitConfirmPending(null)}
                disabled={savingLayout}
                className="w-full px-4 py-2.5 text-sm rounded-xl border border-white/20 text-white/80 hover:bg-white/5 transition"
              >
                {UI_TEXT.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => exitConfirmPending && executeExitAction(exitConfirmPending)}
                disabled={savingLayout}
                className="w-full px-4 py-2.5 text-sm rounded-xl border border-white/20 text-white/80 hover:bg-white/5 transition"
              >
                {UI_TEXT.common.discardAndExit}
              </button>
              <button
                type="button"
                onClick={handleSaveAndExit}
                disabled={savingLayout}
                className="w-full px-4 py-2.5 text-sm rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {savingLayout ? UI_TEXT.common.saving : UI_TEXT.common.saveAndExit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roles section */}
      {mode === 'roles' && isAdmin && (
        <div className="mt-2 space-y-4">
          <TeamInviteCard events={events} />
          {/* Sub-tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setRolesSubTab('controllers')}
              className={`px-3 py-2 rounded-lg text-sm ${rolesSubTab === 'controllers' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
            >
              Контролёры
            </button>
            <button
              onClick={() => setRolesSubTab('organizers')}
              className={`px-3 py-2 rounded-lg text-sm ${rolesSubTab === 'organizers' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
            >
              Организаторы
            </button>
          </div>

          {rolesError && <p className="text-sm text-red-400">{rolesError}</p>}

          {/* Controllers sub-tab (reuse existing controllers state) */}
          {rolesSubTab === 'controllers' && (
            <AdminCard>
              <p className="text-xs text-white/40 mb-4">
                Контролёры могут сканировать QR-коды билетов на входе.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                <input
                  type="number"
                  placeholder="ID пользователя"
                  value={newControllerId}
                  onChange={(e) => setNewControllerId(e.target.value)}
                  className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                />
                <select
                  value={newControllerPlatform}
                  onChange={(e) => setNewControllerPlatform(e.target.value as 'telegram' | 'vk')}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                >
                  <option value="telegram">Telegram</option>
                  <option value="vk">VK</option>
                </select>
                <input
                  type="text"
                  placeholder="Имя (опционально)"
                  value={newControllerLabel}
                  onChange={(e) => setNewControllerLabel(e.target.value)}
                  className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                />
                <PrimaryButton
                  disabled={!newControllerId || controllersLoading}
                  onClick={async () => {
                    setControllerError(null);
                    try {
                      await StorageService.addAdminController(Number(newControllerId), newControllerPlatform, newControllerLabel || undefined);
                      setNewControllerId('');
                      setNewControllerLabel('');
                      await loadControllers();
                    } catch (err: any) {
                      setControllerError(err?.message ?? 'Ошибка');
                    }
                  }}
                >
                  Добавить
                </PrimaryButton>
              </div>
              {controllerError && <p className="text-sm text-red-400 mb-3">{controllerError}</p>}
              {controllersLoading && controllers.length === 0 && <p className="text-sm text-white/40">Загрузка...</p>}
              {!controllersLoading && controllers.length === 0 && <p className="text-sm text-white/40">Контролёры не назначены</p>}
              {controllers.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex flex-col">
                    <span className="text-sm text-white">{c.label ?? `ID ${c.id}`}</span>
                    <span className="text-xs text-white/40">{c.platform} · {c.id}</span>
                  </div>
                  <DangerButton onClick={async () => {
                    setControllerError(null);
                    try { await StorageService.removeAdminController(c.id); await loadControllers(); }
                    catch (err: any) { setControllerError(err?.message ?? 'Ошибка'); }
                  }}>
                    Удалить
                  </DangerButton>
                </div>
              ))}
            </AdminCard>
          )}

          {/* Organizers sub-tab */}
          {rolesSubTab === 'organizers' && (
            <AdminCard>
              <p className="text-xs text-white/40 mb-4">
                Организаторы видят полную админку, но только своё событие. Выберите пользователя из списка или введите ID вручную.
              </p>

              <PrimaryButton
                onClick={() => {
                  setShowOrganizerPicker(true);
                  setOrgPickerQuery('');
                  setOrgPickerSelectedUserId(null);
                  setOrgPickerManualId('');
                  setOrgPickerEventId(selectedEventId || events[0]?.id || '');
                  setOrgPickerPlatform('telegram');
                  setOrgPickerLabel('');
                }}
                className="mb-4"
              >
                + Назначить организатора
              </PrimaryButton>

              {organizersLoading && organizers.length === 0 && <p className="text-sm text-white/40">Загрузка...</p>}
              {!organizersLoading && organizers.length === 0 && <p className="text-sm text-white/40">Организаторы не назначены</p>}
              {organizers.map((o) => {
                const event = events.find((e) => e.id === o.eventId);
                return (
                  <div key={`${o.userId}-${o.eventId}-${o.platform}`} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex flex-col">
                      <span className="text-sm text-white">{o.label ?? `ID ${o.userId}`}</span>
                      <span className="text-xs text-white/40">{o.platform} · {o.userId}</span>
                      <span className="text-xs text-[#C6A75E]">{event?.title ?? o.eventId}</span>
                    </div>
                    <DangerButton onClick={async () => {
                      setRolesError(null);
                      try { await StorageService.removeAdminOrganizer(o.userId, o.eventId, o.platform); await loadOrganizers(); }
                      catch (err: any) { setRolesError(err?.message ?? 'Ошибка'); }
                    }}>
                      Удалить
                    </DangerButton>
                  </div>
                );
              })}
            </AdminCard>
          )}

          {/* Organizer picker modal */}
          {showOrganizerPicker && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
              <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
                  <h3 className="text-base font-semibold text-white">Выбор пользователя</h3>
                  <button onClick={() => setShowOrganizerPicker(false)} className="text-white/40 hover:text-white text-xl leading-none">×</button>
                </div>
                <div className="overflow-y-auto flex-1 p-4 space-y-3">
                  {/* Event selector */}
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Событие</label>
                    <select
                      value={orgPickerEventId}
                      onChange={(e) => setOrgPickerEventId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    >
                      {events.map((e) => (
                        <option key={e.id} value={e.id}>{e.title}</option>
                      ))}
                    </select>
                  </div>

                  {/* Platform selector */}
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Платформа</label>
                    <select
                      value={orgPickerPlatform}
                      onChange={(e) => setOrgPickerPlatform(e.target.value as 'telegram' | 'vk')}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    >
                      <option value="telegram">Telegram</option>
                      <option value="vk">VK</option>
                    </select>
                  </div>

                  {/* User search from DB */}
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Поиск по имени / @username</label>
                    <input
                      type="text"
                      placeholder="Введите имя или @username..."
                      value={orgPickerQuery}
                      onChange={(e) => setOrgPickerQuery(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                    />
                    {appUsersLoading && <p className="text-xs text-white/40 mt-1">Загрузка пользователей...</p>}
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {appUsers
                        .filter((u) => {
                          if (!orgPickerQuery) return true;
                          const q = orgPickerQuery.toLowerCase();
                          const name = `${u.firstName ?? ''} ${u.lastName ?? ''} ${u.username ?? ''}`.toLowerCase();
                          return name.includes(q) || String(u.id).includes(q);
                        })
                        .slice(0, 20)
                        .map((u) => (
                          <button
                            key={`${u.id}-${u.platform}`}
                            type="button"
                            onClick={() => {
                              setOrgPickerSelectedUserId(u.id);
                              setOrgPickerPlatform(u.platform as 'telegram' | 'vk');
                              const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || '';
                              setOrgPickerLabel(name);
                              setOrgPickerManualId('');
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${orgPickerSelectedUserId === u.id ? 'bg-[#C6A75E]/20 border border-[#C6A75E]/40 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                          >
                            <span className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(' ') || `ID ${u.id}`}</span>
                            {u.username && <span className="text-white/40 ml-1">@{u.username}</span>}
                            <span className="text-white/30 text-xs ml-2">{u.platform} · {u.id}</span>
                          </button>
                        ))}
                      {!appUsersLoading && appUsers.filter((u) => {
                        if (!orgPickerQuery) return true;
                        const q = orgPickerQuery.toLowerCase();
                        const name = `${u.firstName ?? ''} ${u.lastName ?? ''} ${u.username ?? ''}`.toLowerCase();
                        return name.includes(q) || String(u.id).includes(q);
                      }).length === 0 && (
                        <p className="text-xs text-white/30 px-1">Пользователи не найдены</p>
                      )}
                    </div>
                  </div>

                  {/* Manual ID fallback */}
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Или введите ID вручную</label>
                    <input
                      type="number"
                      placeholder="Числовой ID"
                      value={orgPickerManualId}
                      onChange={(e) => {
                        setOrgPickerManualId(e.target.value);
                        setOrgPickerSelectedUserId(null);
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                    />
                  </div>

                  {/* Label */}
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Имя (для отображения)</label>
                    <input
                      type="text"
                      placeholder="Иван Иванов"
                      value={orgPickerLabel}
                      onChange={(e) => setOrgPickerLabel(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>

                <div className="px-4 pb-4 pt-3 border-t border-white/10 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowOrganizerPicker(false)}
                    className="flex-1 px-4 py-2 text-sm rounded-xl border border-white/20 text-white/80 hover:bg-white/5 transition"
                  >
                    Отмена
                  </button>
                  <PrimaryButton
                    className="flex-1"
                    disabled={(!orgPickerSelectedUserId && !orgPickerManualId) || !orgPickerEventId}
                    onClick={async () => {
                      const userId = orgPickerSelectedUserId ?? Number(orgPickerManualId);
                      if (!userId || !orgPickerEventId) return;
                      setRolesError(null);
                      try {
                        await StorageService.addAdminOrganizer(userId, orgPickerEventId, orgPickerPlatform, orgPickerLabel || undefined);
                        setShowOrganizerPicker(false);
                        await loadOrganizers();
                      } catch (err: any) {
                        setRolesError(err?.message ?? 'Ошибка назначения');
                      }
                    }}
                  >
                    Назначить
                  </PrimaryButton>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controllers section */}
      {mode === 'controllers' && (
        <div className="mt-2">
          <AdminCard title="Контролеры">
            <p className="text-xs text-white/40 mb-4">
              Контролеры могут сканировать QR-коды билетов на входе. Укажите числовой ID пользователя в Telegram или VK.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                type="number"
                placeholder="ID пользователя"
                value={newControllerId}
                onChange={(e) => setNewControllerId(e.target.value)}
                className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              />
              <select
                value={newControllerPlatform}
                onChange={(e) => setNewControllerPlatform(e.target.value as 'telegram' | 'vk')}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              >
                <option value="telegram">Telegram</option>
                <option value="vk">VK</option>
              </select>
              <input
                type="text"
                placeholder="Имя (опционально)"
                value={newControllerLabel}
                onChange={(e) => setNewControllerLabel(e.target.value)}
                className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              />
              <PrimaryButton
                disabled={!newControllerId || controllersLoading}
                onClick={async () => {
                  setControllerError(null);
                  try {
                    await StorageService.addAdminController(
                      Number(newControllerId),
                      newControllerPlatform,
                      newControllerLabel || undefined
                    );
                    setNewControllerId('');
                    setNewControllerLabel('');
                    await loadControllers();
                  } catch (err: any) {
                    setControllerError(err?.message ?? 'Ошибка');
                  }
                }}
              >
                Добавить
              </PrimaryButton>
            </div>
            {controllerError && (
              <p className="text-sm text-red-400 mb-3">{controllerError}</p>
            )}
            {controllersLoading && controllers.length === 0 && (
              <p className="text-sm text-white/40">Загрузка...</p>
            )}
            {!controllersLoading && controllers.length === 0 && (
              <p className="text-sm text-white/40">Контролеры не назначены</p>
            )}
            {controllers.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="flex flex-col">
                  <span className="text-sm text-white">{c.label ?? `ID ${c.id}`}</span>
                  <span className="text-xs text-white/40">{c.platform} · {c.id}</span>
                </div>
                <DangerButton
                  onClick={async () => {
                    setControllerError(null);
                    try {
                      await StorageService.removeAdminController(c.id);
                      await loadControllers();
                    } catch (err: any) {
                      setControllerError(err?.message ?? 'Ошибка');
                    }
                  }}
                >
                  Удалить
                </DangerButton>
              </div>
            ))}
          </AdminCard>
        </div>
      )}

      {deleteConfirmEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">
              {UI_TEXT.admin.deleteEventConfirmTitle}
            </h3>
            <p className="text-sm text-white/70 mb-4">
              {UI_TEXT.admin.deleteEventConfirmText}
            </p>
            {getActiveBookingsCount(deleteConfirmEvent.id) > 0 && (
              <p className="text-sm text-red-400 mb-4">
                {UI_TEXT.admin.deleteEventActiveBookings}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmEvent(null)}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm rounded-xl border border-white/20 text-white/80 hover:bg-white/5 transition"
              >
                {UI_TEXT.common.cancel}
              </button>
              <button
                type="button"
                onClick={handleDeleteEvent}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition"
              >
                {deleteLoading ? UI_TEXT.common.loading : UI_TEXT.admin.deleteEventButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;