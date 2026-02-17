import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { EventData, Table } from '../types';
import { UI_TEXT } from '../constants/uiText';
import { getGoldToneByCategory } from '../src/ui/theme';
import { computeTableSizes } from '../src/ui/tableSizing';
import { useContainerWidth } from '../src/hooks/useContainerWidth';
import { TableNumber, SeatInfo } from './TableLabel';
import PrimaryButton from '../src/ui/PrimaryButton';
import SecondaryButton from '../src/ui/SecondaryButton';
import DangerButton from '../src/ui/DangerButton';
import EventCard, { EventCardSkeleton } from './EventCard';
import AdminCard from '../src/ui/AdminCard';
import { mapTableFromDb } from '../src/utils/mapTableFromDb';
import { TICKET_STYLES, DEFAULT_TICKET_CATEGORIES, getGoldToneFromStyleKey } from '../constants/ticketStyles';
import type { TicketCategory } from '../types';

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
  event: { id: string; title?: string; date?: string };
  seatIds?: string[];
  tableBookings?: Array<{ tableId: string; seats: number }>;
  userTelegramId?: number;
  totalAmount?: number;
  total_amount?: number;
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

/** Ensure required table fields for backend; defaults so nothing is undefined. */
function tableForBackend(t: Table, index: number): Table {
  const x = typeof t.x === 'number' ? t.x : (typeof t.centerX === 'number' ? t.centerX : 50);
  const y = typeof t.y === 'number' ? t.y : (typeof t.centerY === 'number' ? t.centerY : 50);
  return {
    ...t,
    id: t.id || `tbl-${Date.now()}-${index}`,
    number: typeof t.number === 'number' ? t.number : index + 1,
    seatsTotal: typeof t.seatsTotal === 'number' ? t.seatsTotal : 4,
    seatsAvailable: typeof t.seatsAvailable === 'number' ? t.seatsAvailable : (typeof t.seatsTotal === 'number' ? t.seatsTotal : 4),
    x,
    y,
    centerX: typeof t.centerX === 'number' ? t.centerX : x,
    centerY: typeof t.centerY === 'number' ? t.centerY : y,
    visibleFrom: t.visibleFrom ?? undefined,
    visibleUntil: t.visibleUntil ?? undefined,
  };
}

/** Validate table numbers: positive integer, unique within event. Returns error message or null. */
function validateTableNumbers(tables: Table[]): string | null {
  const seen = new Map<number, string>();
  for (const t of tables) {
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

/** Validate rect tables: width_percent > 0, height_percent > 0, rotation in [-180, 180]. Returns error or null. */
function validateRectTables(tables: Table[]): string | null {
  for (const t of tables) {
    const shape = t.shape ?? 'circle';
    if (shape === 'circle') continue;
    const w = (t as { widthPercent?: number }).widthPercent;
    const h = (t as { heightPercent?: number }).heightPercent;
    const rot = (t as { rotationDeg?: number }).rotationDeg ?? 0;
    if (typeof w !== 'number' || w <= 0) return UI_TEXT.tables.widthPercentInvalid;
    if (typeof h !== 'number' || h <= 0) return UI_TEXT.tables.heightPercentInvalid;
    if (typeof rot !== 'number' || rot < -180 || rot > 180) return UI_TEXT.tables.rotationInvalid;
  }
  return null;
}

const AdminPanel: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [mode, setMode] = useState<'bookings' | 'layout'>('bookings');
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
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [venue, setVenue] = useState('');
  const [eventPhone, setEventPhone] = useState('');
  const [eventPublished, setEventPublished] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [layoutAspectRatio, setLayoutAspectRatio] = useState<number | null>(null);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [eventStatusFilter, setEventStatusFilter] = useState<'published' | 'draft' | 'archived' | 'deleted'>('published');
  const [openSections, setOpenSections] = useState<string[]>(['basic']);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [dirtyCause, setDirtyCause] = useState(0);
  const [sectionOrder, setSectionOrder] = useState(['basic', 'layout', 'tables', 'categories', 'publish']);
  const [resyncLoading, setResyncLoading] = useState(false);
  const [layoutUploadLoading, setLayoutUploadLoading] = useState(false);
  const [layoutUploadError, setLayoutUploadError] = useState<string | null>(null);
  const [layoutUploadVersion, setLayoutUploadVersion] = useState<number | null>(null);
  const [addingTable, setAddingTable] = useState(false);
  const [eventTablesMap, setEventTablesMap] = useState<Record<string, Table[]>>({});
  const [eventDetailsMap, setEventDetailsMap] = useState<Record<string, EventData>>({});
  const [activeTabLeft, setActiveTabLeft] = useState(0);
  const [activeTabWidth, setActiveTabWidth] = useState(0);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveLayoutRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);
  const [layoutPreviewRef, layoutPreviewWidth] = useContainerWidth<HTMLDivElement>();
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

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSaveStatus('dirty');
    setDirtyCause((c) => c + 1);
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty || !selectedEvent?.id) return;
    const timeout = setTimeout(() => {
      handleSave(true);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [isDirty, selectedEvent?.id, dirtyCause, handleSave]);

  const toggleSection = (key: string) => {
    const isOpening = !openSections.includes(key);
    setOpenSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    if (isOpening) {
      setTimeout(() => {
        const el = sectionRefs.current[key];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }
  };

  const AccordionSection = ({
    title,
    sectionKey,
    children,
    dirtyIndicator,
    dragHandle,
  }: {
    title: string;
    sectionKey: string;
    children: React.ReactNode;
    dirtyIndicator?: boolean;
    dragHandle?: React.ReactNode;
  }) => {
    const isOpen = openSections.includes(sectionKey);
    return (
      <div
        ref={(el) => { sectionRefs.current[sectionKey] = el; }}
        className="relative border border-white/10 rounded-2xl mb-4 bg-[#121212] overflow-hidden"
      >
        <div className="sticky top-0 z-20 bg-[#121212] border-b border-white/5">
          <button
            type="button"
            onClick={() => toggleSection(sectionKey)}
            className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-white/5 transition"
          >
            <span className="font-semibold text-white flex items-center gap-2">
              {dragHandle}
              {title}
              {dirtyIndicator && isDirty && (
                <span className="ml-2 text-xs text-[#FFC107]">●</span>
              )}
            </span>
            <motion.span
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-[#C6A75E]"
            >
              ▼
            </motion.span>
          </button>
        </div>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const SortableSection = ({
    id,
    title,
    sectionKey,
    dirtyIndicator,
    children,
  }: {
    id: string;
    title: string;
    sectionKey: string;
    dirtyIndicator?: boolean;
    children: React.ReactNode;
  }) => {
    const {
      setNodeRef,
      setActivatorNodeRef,
      listeners,
      attributes,
      transform,
      transition,
      isDragging,
    } = useSortable({ id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };
    return (
      <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
        <AccordionSection
          title={title}
          sectionKey={sectionKey}
          dirtyIndicator={dirtyIndicator}
          dragHandle={
            <span
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              className="cursor-grab active:cursor-grabbing text-[#6E6A64] text-lg px-1 select-none"
              title="Перетащить"
              onClick={(e) => e.stopPropagation()}
            >
              ☰
            </span>
          }
        >
          {children}
        </AccordionSection>
      </div>
    );
  };

  useEffect(() => {
    const el = eventTabRefs.current[eventStatusFilter];
    if (el) {
      setActiveTabLeft(el.offsetLeft);
      setActiveTabWidth(el.offsetWidth);
    }
  }, [eventStatusFilter, hasEvents, eventsLoading]);

  useEffect(() => {
    if (!layoutUrl?.trim()) {
      setLayoutAspectRatio(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      setLayoutAspectRatio(w / h);
    };
    img.onerror = () => setLayoutAspectRatio(null);
    img.src = layoutUrl.trim();
  }, [layoutUrl]);

  useEffect(() => {
    const el = eventTabRefs.current[eventStatusFilter];
    const container = eventTabsScrollRef.current;
    if (el && container) {
      const elLeft = el.offsetLeft;
      const elWidth = el.offsetWidth;
      const containerWidth = container.offsetWidth;
      container.scrollTo({
        left: elLeft - containerWidth / 2 + elWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [eventStatusFilter]);

  const toFriendlyError = (e: unknown) => {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw === 'Forbidden') return UI_TEXT.common.errors.forbidden;
    if (raw.toLowerCase().includes('not found')) return UI_TEXT.common.errors.notFound;
    if (raw.toLowerCase().includes('expired')) return UI_TEXT.common.errors.expired;
    if (raw.toLowerCase().includes('only reserved')) return UI_TEXT.common.errors.onlyReserved;
    if (raw.includes('Cannot delete table') || raw.includes('it has bookings')) return UI_TEXT.common.errors.deleteTableWithBookings;
    if (raw.includes('Cannot deactivate table with active bookings')) return UI_TEXT.common.errors.cannotDeactivateTableWithBookings;
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
      const map: Record<string, Table[]> = {};
      const detailsMap: Record<string, EventData> = {};
      for (const eventId of eventIds) {
        try {
          const ev = await StorageService.getAdminEvent(eventId);
          map[eventId] = Array.isArray(ev?.tables) ? ev.tables : [];
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
  const setEventFromFresh = (fresh: EventData | null) => {
    if (!fresh) {
      setSelectedEvent(null);
      return;
    }
    const ticketCategories = fresh.ticketCategories?.length ? fresh.ticketCategories : DEFAULT_TICKET_CATEGORIES;
    const mapped = { ...fresh, ticketCategories, tables: (fresh.tables ?? []).map(mapTableFromDb) };
    setSelectedEvent(mapped);
    setLayoutUrl(fresh.layoutImageUrl || '');
    setEventPosterUrl(fresh.imageUrl ?? '');
    setEventTitle(fresh.title || '');
    setEventDescription(fresh.description || '');
    setEventDate(fresh.event_date ?? '');
    setEventTime(fresh.event_time ? String(fresh.event_time).slice(0, 5) : '');
    setVenue(fresh.venue ?? '');
    setEventPhone(fresh.paymentPhone || '');
    setEventPublished(fresh.published === true);
    setEvents((prev) => prev.map((e) => (e.id === fresh.id ? { ...e, title: fresh.title } : e)));
  };

  const loadEvent = async (eventId: string) => {
    if (!eventId) return;
    setEventsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const fresh = await StorageService.getAdminEvent(eventId);
      setEventFromFresh(fresh);
      setLayoutUploadVersion(null);
      setIsDirty(false);
      setSaveStatus('idle');
    } catch (e) {
      console.error('[AdminPanel] Failed to load event', e);
      if (e instanceof Error && e.message) {
        console.error('[AdminPanel] Backend message:', e.message);
      }
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
      console.error('[AdminPanel] Failed to create event', e);
      if (e instanceof Error && e.message) {
        console.error('[AdminPanel] Backend message:', e.message);
      }
      setError(toFriendlyError(e));
    } finally {
      setCreatingEvent(false);
    }
  };

  const saveLayout = async (silent = false) => {
    if (!selectedEvent?.id) return;
    const rawTables = selectedEvent?.tables ?? [];
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
      const payload: Partial<EventData> = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        event_date: eventDate.trim() || null,
        event_time: eventTime.trim() || null,
        venue: venue.trim() || null,
        paymentPhone: eventPhone.trim(),
        imageUrl: eventPosterUrl.trim() || (selectedEvent?.imageUrl ?? null),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : (selectedEvent?.layoutImageUrl ?? null),
        published: eventPublished,
        ticketCategories: selectedEvent?.ticketCategories ?? [],
        tables: rawTables.map((t, idx) => tableForBackend(t, idx)),
      };
      await StorageService.updateAdminEvent(selectedEvent.id, payload);
      const fresh = await StorageService.getAdminEvent(selectedEvent.id);
      setEventFromFresh(fresh);
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      if (!silent) {
        setError(null);
        setSuccessMessage(UI_TEXT.admin.eventUpdated);
      }
    } catch (e) {
      console.error('[AdminPanel] Failed to save event', e);
      if (e instanceof Error && e.message) {
        console.error('[AdminPanel] Backend message:', e.message);
      }
      const msg = e instanceof Error ? e.message : String(e);
      const isForbidden =
        msg === 'Forbidden' ||
        msg.toLowerCase().includes('forbidden') ||
        msg.toLowerCase().includes('published') ||
        msg.toLowerCase().includes('cannot be modified');
      setError(
        isForbidden ? UI_TEXT.event.publishedWarning : toFriendlyError(e),
      );
      setSaveStatus('dirty');
    } finally {
      setSavingLayout(false);
    }
  };
  saveLayoutRef.current = saveLayout;

  useEffect(() => {
    load();
    loadEvents();
  }, []);

  const formatAdminSeatLabel = (b: AdminBooking): string => {
    if (Array.isArray(b.seat_indices) && b.seat_indices.length > 0) {
      const sorted = [...b.seat_indices].sort((a, b) => a - b);
      const human = sorted.map((i) => i + 1);
      if (human.length <= 5) return `Места: ${human.join(', ')}`;
      return `${human.length} мест`;
    }
    const count = b.seats_booked ?? (Array.isArray(b.tableBookings) ? b.tableBookings.reduce((s, tb) => s + tb.seats, 0) : 0);
    if (typeof count === 'number' && count > 0) return `${count} ${count === 1 ? 'место' : 'мест'}`;
    return '—';
  };

  const getAdminTableLabel = (b: AdminBooking): string => {
    const eventId = b.event_id ?? b.event?.id ?? '';
    const tables = eventTablesMap[eventId] ?? [];
    const tableId = b.table_id ?? b.tableBookings?.[0]?.tableId;
    if (!tableId) return '—';
    const exists = tables.some((t) => t.id === tableId);
    if (!exists) return 'Стол удалён';
    const table = tables.find((t) => t.id === tableId);
    return table ? `Стол ${table.number}` : '—';
  };

  const getAdminCategoryLabel = (b: AdminBooking): string => {
    const eventId = b.event_id ?? b.event?.id ?? '';
    const ev = eventDetailsMap[eventId];
    const tableId = b.table_id ?? b.tableBookings?.[0]?.tableId;
    if (!tableId || !ev?.ticketCategories) return '—';
    const table = (ev.tables ?? []).find((t) => t.id === tableId);
    const catId = table?.ticketCategoryId;
    if (!catId) return '—';
    const cat = ev.ticketCategories.find((c) => c.id === catId);
    return cat?.name ?? '—';
  };

  const formatAdminDate = (s: string | null | undefined): string => {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(s);
    }
  };

  const formatEventDateDisplay = (ev: EventData | undefined): string => {
    if (!ev) return '—';
    const d = ev.event_date ?? ev.date;
    if (!d) return '—';
    try {
      const dateStr = new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
      const time = ev.event_time;
      return time ? `${dateStr}, ${time}` : dateStr;
    } catch {
      return String(d);
    }
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

  const addTable = async () => {
    if (!selectedEvent?.id) return;
    const currentTables = selectedEvent?.tables ?? [];
    const nextId = `tbl-${Date.now()}`;
    const firstActiveCatId = (selectedEvent?.ticketCategories ?? []).find((c) => c.isActive)?.id;
    const newTable: Table = {
      id: nextId,
      number: currentTables.length + 1,
      seatsTotal: 4,
      seatsAvailable: 4,
      x: 50,
      y: 50,
      centerX: 50,
      centerY: 50,
      sizePercent: 6,
      shape: 'circle',
      ticketCategoryId: firstActiveCatId,
      isAvailable: true,
    };
    const newTables = [...currentTables, newTable];
    const numErr = validateTableNumbers(newTables);
    if (numErr) { setError(numErr); return; }
    const rectErr = validateRectTables(newTables);
    if (rectErr) { setError(rectErr); return; }
    setAddingTable(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload: Partial<EventData> = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        event_date: eventDate.trim() || null,
        event_time: eventTime.trim() || null,
        venue: venue.trim() || null,
        paymentPhone: eventPhone.trim(),
        imageUrl: eventPosterUrl.trim() || (selectedEvent?.imageUrl ?? null),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : (selectedEvent?.layoutImageUrl ?? null),
        published: eventPublished,
        ticketCategories: selectedEvent?.ticketCategories ?? [],
        tables: newTables.map((t, idx) => tableForBackend(t, idx)),
      };
      await StorageService.updateAdminEvent(selectedEvent.id, payload);
      const fresh = await StorageService.getAdminEvent(selectedEvent.id);
      setEventFromFresh(fresh);
      setSuccessMessage(UI_TEXT.tables.tableAdded);
    } catch (e) {
      console.error('[AdminPanel] Failed to add table', e);
      setError(toFriendlyError(e));
    } finally {
      setAddingTable(false);
    }
  };

  const deleteTable = async (tableId: string) => {
    if (!selectedEvent?.id) return;
    const newTables = (selectedEvent.tables ?? []).filter((it) => it.id !== tableId);
    const numErr = validateTableNumbers(newTables);
    if (numErr) { setError(numErr); return; }
    const rectErr = validateRectTables(newTables);
    if (rectErr) { setError(rectErr); return; }
    setSavingLayout(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload: Partial<EventData> = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        event_date: eventDate.trim() || null,
        event_time: eventTime.trim() || null,
        venue: venue.trim() || null,
        paymentPhone: eventPhone.trim(),
        imageUrl: eventPosterUrl.trim() || (selectedEvent?.imageUrl ?? null),
        layoutImageUrl: layoutUrl ? layoutUrl.trim() : (selectedEvent?.layoutImageUrl ?? null),
        published: eventPublished,
        ticketCategories: selectedEvent?.ticketCategories ?? [],
        tables: newTables.map((t, idx) => tableForBackend(t, idx)),
      };
      await StorageService.updateAdminEvent(selectedEvent.id, payload);
      const fresh = await StorageService.getAdminEvent(selectedEvent.id);
      setEventFromFresh(fresh);
      setSuccessMessage(UI_TEXT.tables.tableDeleted);
    } catch (e) {
      console.error('[AdminPanel] Failed to delete table', e);
      setError(toFriendlyError(e));
      if (selectedEventId) {
        try {
          const fresh = await StorageService.getAdminEvent(selectedEventId);
          setEventFromFresh(fresh);
        } catch {
          /* ignore reload failure */
        }
      }
    } finally {
      setSavingLayout(false);
    }
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
      console.error('[AdminPanel] Failed to confirm payment', e);
      if (e instanceof Error && e.message) {
        console.error('[AdminPanel] Backend message:', e.message);
      }
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
      console.error('[AdminPanel] Failed to cancel booking', e);
      setError(toFriendlyError(e));
    } finally {
      setCancellingId(null);
    }
  };

  const hasBookings = useMemo(() => bookings.length > 0, [bookings.length]);
  const filteredBookings = useMemo(() => {
    if (!statusFilter) return bookings;
    return bookings.filter((b) => String(b.status ?? '') === statusFilter);
  }, [bookings, statusFilter]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
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

  return (
    <div className="admin-root min-h-screen p-4">
      {isDirty && selectedEvent && (
        <div className="sticky top-0 z-50 bg-[#111] border-b border-white/10 px-4 py-3 -mx-4 -mt-4 mb-4">
          <div className="flex items-center justify-between max-w-[420px] mx-auto">
            <span className="text-sm text-[#FFC107]">
              Есть несохранённые изменения
            </span>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={savingLayout}
              className="bg-[#FFC107] text-black px-4 py-2 rounded-xl font-semibold active:scale-95 transition disabled:opacity-50"
            >
              Сохранить всё
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">{UI_TEXT.admin.title}</h1>
          <div className="flex items-center gap-2 text-xs">
            {saveStatus === 'dirty' && (
              <span className="text-[#FFC107]">Есть изменения</span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-white">Сохранение...</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-green-400 flex items-center gap-1">
                ✓ Сохранено
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={() => {
                if (isDirty && !window.confirm('Есть несохранённые изменения. Выйти без сохранения?')) return;
                onBack();
              }}
              disabled={loading || eventsLoading || savingLayout || addingTable || confirmingId !== null || cancellingId !== null}
              className="text-sm text-[#6E6A64]"
            >
              {UI_TEXT.admin.exit}
            </button>
          )}
          <PrimaryButton
            onClick={() => {
              if (mode === 'bookings') load();
              if (mode === 'layout') loadEvents();
            }}
            disabled={loading || eventsLoading}
          >
            {UI_TEXT.admin.reload}
          </PrimaryButton>
          <SecondaryButton
            onClick={handleResyncSeats}
            disabled={resyncLoading || loading || eventsLoading}
            className="px-4 py-2 rounded-xl bg-[#ECE6DD] text-[#1C1C1C] hover:bg-[#DDD6CC]"
          >
            {resyncLoading ? UI_TEXT.common.loading : UI_TEXT.admin.resyncSeats}
          </SecondaryButton>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('bookings')}
          className={`px-3 py-2 rounded-lg text-sm ${mode === 'bookings' ? 'bg-[#C6A75E] text-black' : 'bg-[#1A1A1A] text-[#EAE6DD] border border-[#2A2A2A]'}`}
        >
          {UI_TEXT.admin.bookings}
        </button>
        <button
          onClick={() => setMode('layout')}
          className={`px-3 py-2 rounded-lg text-sm ${mode === 'layout' ? 'bg-[#C6A75E] text-black' : 'bg-[#1A1A1A] text-[#EAE6DD] border border-[#2A2A2A]'}`}
        >
          {UI_TEXT.admin.venueLayout}
        </button>
      </div>

      {loading && <div className="text-sm text-muted">{UI_TEXT.admin.loadingBookings}</div>}
      {error && <div className="text-sm text-[#6E6A64] mb-4">{error}</div>}
      {successMessage && <div className="text-sm text-green-700 mb-4">{successMessage}</div>}

      {mode === 'bookings' && (
        <>
          {!loading && hasBookings && (
            <div className="mb-4">
              <label className="text-xs text-muted block mb-1">{UI_TEXT.booking.status}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border rounded px-3 py-2 text-sm min-w-[180px]"
              >
                <option value="">{UI_TEXT.booking.statusFilterAll}</option>
                <option value="pending">{UI_TEXT.booking.statusLabels.pending}</option>
                <option value="awaiting_confirmation">{UI_TEXT.booking.statusLabels.awaiting_confirmation}</option>
                <option value="paid">{UI_TEXT.booking.statusLabels.paid}</option>
                <option value="cancelled">{UI_TEXT.booking.statusLabels.cancelled}</option>
                <option value="expired">{UI_TEXT.booking.statusLabels.expired}</option>
                <option value="reserved">{UI_TEXT.booking.statusLabels.reserved}</option>
              </select>
            </div>
          )}

          {!loading && !hasBookings && (
            <div className="text-sm text-[#6E6A64]">{UI_TEXT.admin.noBookings}</div>
          )}

          {!loading && hasBookings && filteredBookings.length === 0 && (
            <div className="text-sm text-[#6E6A64]">{UI_TEXT.booking.noBookingsForFilter}</div>
          )}

          {!loading && hasBookings && filteredBookings.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              {filteredBookings.map((b) => {
                const status = String(b.status ?? '');
                const canConfirm = status === 'reserved' || status === 'awaiting_confirmation' || status === 'payment_submitted';
                const telegramId = b.user_telegram_id ?? b.userTelegramId;
                const userPhone = b.user_phone ?? b.userPhone;
                const eventId = b.event_id ?? b.event?.id ?? '';
                const eventDetails = eventDetailsMap[eventId];

                return (
                  <div key={b.id} className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-white">{b.event?.title || UI_TEXT.event.eventFallback}</h3>
                        <div className="text-sm text-white/60 mt-0.5">{formatEventDateDisplay(eventDetails) || formatAdminDate(b.event?.date)}</div>
                      </div>
                      <span className="shrink-0 px-3 py-1 text-xs rounded-full bg-white/10 text-white">
                        {UI_TEXT.booking.statusLabels[status] ?? status ?? '—'}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-white/80">
                      <div>{getAdminTableLabel(b)}</div>
                      <div>{formatAdminSeatLabel(b)}</div>
                      <div>Категория: {getAdminCategoryLabel(b)}</div>
                      <div>Сумма: {(b.totalAmount ?? b.total_amount ?? 0) > 0 ? `${b.totalAmount ?? b.total_amount} ₽` : '—'}</div>
                    </div>

                    <div className="border-t border-white/10 pt-3 space-y-1 text-xs text-white/60">
                      <div>Покупатель: {userPhone || '—'}</div>
                      <div>Telegram ID: {typeof telegramId === 'number' ? telegramId : '—'}</div>
                      <div>Создано: {formatAdminDate(b.created_at)}</div>
                    </div>

                    {canConfirm && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => confirmBooking(b.id)}
                          disabled={confirmingId !== null || cancellingId !== null || isExpired(b.expiresAt ?? b.expires_at)}
                          className="px-4 py-2 rounded-xl text-sm font-medium bg-[#C6A75E] text-black hover:bg-[#D4B86A] disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          {confirmingId === b.id ? UI_TEXT.booking.confirming : isExpired(b.expiresAt ?? b.expires_at) ? UI_TEXT.booking.expired : 'Подтвердить оплату'}
                        </button>
                        <button
                          onClick={() => cancelBookingAction(b.id)}
                          disabled={confirmingId !== null || cancellingId !== null}
                          className="px-4 py-2 rounded-xl text-sm font-medium bg-white/5 text-white border border-white/20 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          {cancellingId === b.id ? 'Отмена…' : 'Отменить'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {mode === 'layout' && (
        <div className="grid grid-cols-1 gap-4">
          <div className="admin-card p-4 mb-4">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                onClick={loadEvents}
                disabled={eventsLoading || creatingEvent}
                className="px-3 py-2 text-sm border rounded"
              >
                {UI_TEXT.admin.refresh}
              </button>
              <button
                onClick={createEvent}
                disabled={eventsLoading || creatingEvent}
                className="px-3 py-2 text-sm border rounded"
              >
                {creatingEvent ? UI_TEXT.admin.creatingEvent : UI_TEXT.admin.createEvent}
              </button>
            </div>
            {eventsLoading && (
              <div className="space-y-3 mt-2" aria-label={UI_TEXT.admin.loadingEvents}>
                <EventCardSkeleton />
                <EventCardSkeleton />
                <EventCardSkeleton />
                <EventCardSkeleton />
              </div>
            )}
            {!eventsLoading && hasEvents && (
              <div className="relative mb-4">
                <div ref={eventTabsScrollRef} className="overflow-x-auto no-scrollbar scroll-smooth">
                  <div className="relative flex gap-2 min-w-max px-2">
                    <motion.div
                      animate={{ left: activeTabLeft, width: activeTabWidth }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className="absolute top-0 h-full bg-[#FFC107] rounded-xl z-0 pointer-events-none"
                    />
                    {[
                      { key: 'published' as const, label: 'Опубликованные', count: eventCounts.published },
                      { key: 'draft' as const, label: 'Черновики', count: eventCounts.draft },
                      { key: 'archived' as const, label: 'Архив', count: eventCounts.archived },
                      { key: 'deleted' as const, label: 'Удалённые', count: eventCounts.deleted },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        ref={(el) => { eventTabRefs.current[tab.key] = el; }}
                        type="button"
                        onClick={() => setEventStatusFilter(tab.key)}
                        className={`relative z-10 shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                          eventStatusFilter !== tab.key ? 'border border-white/10 hover:border-white/20' : 'border border-transparent'
                        }`}
                        style={{
                          color: eventStatusFilter === tab.key ? '#000' : '#fff',
                          backgroundColor: eventStatusFilter === tab.key ? 'transparent' : '#1A1A1A',
                        }}
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          {tab.label}
                          <span
                            className={`text-xs px-2 py-[2px] rounded-full ${
                              eventStatusFilter === tab.key
                                ? 'bg-black/20 text-black'
                                : 'bg-[#FFC107]/20 text-[#FFC107]'
                            }`}
                          >
                            {tab.count}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
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
                  <EventCard
                    key={ev.id}
                    event={ev}
                    mode="admin"
                    selected={ev.id === selectedEventId}
                    onClick={() => {
                      setSelectedEventId(ev.id);
                      setSelectedEvent(null);
                      setError(null);
                      setSuccessMessage(null);
                      loadEvent(ev.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {selectedEvent && (
            <>
              <div className="flex justify-end gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setOpenSections([])}
                  className="text-xs text-muted hover:text-[#C6A75E] transition"
                >
                  Свернуть всё
                </button>
                <button
                  type="button"
                  onClick={() => setOpenSections([...sectionOrder])}
                  className="text-xs text-muted hover:text-[#C6A75E] transition"
                >
                  Развернуть всё
                </button>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                  {sectionOrder.map((key) => {
                    if (key === 'basic') return (
                      <SortableSection key="basic" id="basic" title="Основная информация" sectionKey="basic" dirtyIndicator>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.title}</div>
                    <input
                      type="text"
                      value={eventTitle}
                      onChange={(e) => { setEventTitle(e.target.value); markDirty(); }}
                      placeholder={UI_TEXT.event.titlePlaceholder}
                      className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.description}</div>
                    <textarea
                      value={eventDescription}
                      onChange={(e) => { setEventDescription(e.target.value); markDirty(); }}
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
                        onChange={(e) => { setEventDate(e.target.value); markDirty(); }}
                        placeholder={UI_TEXT.event.eventDatePlaceholder}
                        className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-1">{UI_TEXT.event.eventTime}</div>
                      <input
                        type="time"
                        value={eventTime}
                        onChange={(e) => { setEventTime(e.target.value); markDirty(); }}
                        placeholder={UI_TEXT.event.eventTimePlaceholder}
                        className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.venue}</div>
                    <input
                      type="text"
                      value={venue}
                      onChange={(e) => { setVenue(e.target.value); markDirty(); }}
                      placeholder={UI_TEXT.event.venuePlaceholder}
                      className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.organizerPhone}</div>
                    <input
                      type="text"
                      value={eventPhone}
                      onChange={(e) => { setEventPhone(e.target.value); markDirty(); }}
                      placeholder={UI_TEXT.event.phonePlaceholder}
                      className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                    />
                  </div>
                </div>
                      </SortableSection>
                    );
                    if (key === 'categories') return (
                      <SortableSection key="categories" id="categories" title={`Категории (${selectedEvent?.ticketCategories?.length ?? 0})`} sectionKey="categories">
                <div className="text-sm font-semibold mb-3">Категории билетов</div>
                <div className="space-y-4">
                  {(selectedEvent?.ticketCategories ?? []).map((cat) => {
                    const styleTokens = TICKET_STYLES[cat.styleKey as keyof typeof TICKET_STYLES] ?? TICKET_STYLES.gold;
                    return (
                      <div key={cat.id} className="p-3 rounded-lg border border-[#2A2A2A] bg-[#141414] space-y-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded border border-[#2A2A2A] shrink-0"
                            style={{ backgroundColor: styleTokens.base }}
                            title={cat.styleKey}
                          />
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
                              markDirty();
                            }}
                            placeholder="Название"
                            className="flex-1 border rounded px-2 py-1 text-sm bg-[#0F0F0F] border-[#2A2A2A] text-[#EAE6DD]"
                          />
                          <label className="flex items-center gap-1 text-xs text-[#6E6A64]">
                            <input
                              type="checkbox"
                              checked={cat.isActive}
                              onChange={(e) => {
                                setSelectedEvent((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        ticketCategories: (prev.ticketCategories ?? []).map((c) =>
                                          c.id === cat.id ? { ...c, isActive: e.target.checked } : c
                                        ),
                                      }
                                    : null
                                );
                                markDirty();
                              }}
                            />
                            Активна
                          </label>
                          <DangerButton
                            type="button"
                            onClick={() => {
                              const isUsed = (selectedEvent?.tables ?? []).some((t) => t.ticketCategoryId === cat.id);
                              if (isUsed) {
                                alert('Нельзя отключить категорию, к которой привязаны столы.');
                                return;
                              }
                              setSelectedEvent((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      ticketCategories: (prev.ticketCategories ?? []).map((c) =>
                                        c.id === cat.id ? { ...c, isActive: false } : c
                                      ),
                                    }
                                  : null
                              );
                              markDirty();
                            }}
                            className="px-2 py-1 text-xs"
                            title="Отключить (soft delete)"
                          >
                            ✕
                          </DangerButton>
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
                                markDirty();
                              }}
                              className="w-full border rounded px-2 py-1 text-sm bg-[#0F0F0F] border-[#2A2A2A] text-[#EAE6DD]"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-[#6E6A64] block mb-1">Стиль</label>
                            <select
                              value={cat.styleKey}
                              onChange={(e) => {
                                const val = e.target.value as TicketCategory['styleKey'];
                                setSelectedEvent((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        ticketCategories: (prev.ticketCategories ?? []).map((c) =>
                                          c.id === cat.id ? { ...c, styleKey: val } : c
                                        ),
                                      }
                                    : null
                                );
                                markDirty();
                              }}
                              className="w-full border rounded px-2 py-1 text-sm bg-[#0F0F0F] border-[#2A2A2A] text-[#EAE6DD]"
                            >
                              {(Object.keys(TICKET_STYLES) as (keyof typeof TICKET_STYLES)[]).map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                            </select>
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
                              markDirty();
                            }}
                            placeholder="Описание категории"
                            rows={2}
                            className="w-full border rounded px-2 py-1 text-sm bg-[#0F0F0F] border-[#2A2A2A] text-[#EAE6DD]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <PrimaryButton
                  type="button"
                  onClick={() => {
                    const newCat: TicketCategory = {
                      id: crypto.randomUUID(),
                      name: 'Новая категория',
                      price: 1000,
                      description: '',
                      styleKey: 'gold',
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
                    markDirty();
                  }}
                  className="mt-3"
                >
                  + Добавить категорию
                </PrimaryButton>
                      </SortableSection>
                    );
                    if (key === 'publish') return (
                      <SortableSection key="publish" id="publish" title="Публикация" sectionKey="publish">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-[#6E6A64]">{UI_TEXT.admin.statusLabel}</span>
                  <span className="px-2 py-1 text-xs rounded-md bg-[#1A1A1A] text-[#C6A75E] border border-[#2A2A2A]">
                    {selectedEvent?.status === 'published' ? UI_TEXT.admin.published : selectedEvent?.status === 'archived' ? UI_TEXT.admin.archived : UI_TEXT.admin.draft}
                  </span>
                  {selectedEvent?.status === 'draft' && (
                    <PrimaryButton
                      type="button"
                      onClick={async () => {
                        if (!selectedEventId || !selectedEvent) return;
                        const rawTables = selectedEvent?.tables ?? [];
                        const numErr = validateTableNumbers(rawTables);
                        if (numErr) { setError(numErr); return; }
                        const rectErr = validateRectTables(rawTables);
                        if (rectErr) { setError(rectErr); return; }
                        setStatusActionLoading(true);
                        setError(null);
                        setSuccessMessage(null);
                        try {
                          const payload: Partial<EventData> = {
                            status: 'published' as const,
                            ticketCategories: selectedEvent?.ticketCategories ?? [],
                            tables: rawTables.map((t, idx) => tableForBackend(t, idx)),
                          };
                          await StorageService.updateAdminEvent(selectedEvent.id, payload);
                          setSuccessMessage(UI_TEXT.admin.eventPublished);
                          await loadEvent(selectedEventId);
                        } catch (e) {
                          console.error('[AdminPanel] Publish failed', e);
                          setError(toFriendlyError(e));
                        } finally {
                          setStatusActionLoading(false);
                        }
                      }}
                      disabled={statusActionLoading}
                      className="px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      {statusActionLoading ? '…' : UI_TEXT.admin.publishEvent}
                    </PrimaryButton>
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
                          console.error('[AdminPanel] Archive failed', e);
                          setError(toFriendlyError(e));
                        } finally {
                          setStatusActionLoading(false);
                        }
                      }}
                      disabled={statusActionLoading}
                      className="px-4 py-2 rounded-xl disabled:opacity-50"
                    >
                      {statusActionLoading ? '…' : UI_TEXT.admin.archiveEvent}
                    </DangerButton>
                )}
                  {selectedEvent?.status === 'archived' && (
                    <PrimaryButton
                      type="button"
                      onClick={async () => {
                        if (!selectedEventId || !selectedEvent) return;
                        const rawTables = selectedEvent?.tables ?? [];
                        const numErr = validateTableNumbers(rawTables);
                        if (numErr) { setError(numErr); return; }
                        const rectErr = validateRectTables(rawTables);
                        if (rectErr) { setError(rectErr); return; }
                        setStatusActionLoading(true);
                        setError(null);
                        setSuccessMessage(null);
                        try {
                          const payload: Partial<EventData> = {
                            status: 'published' as const,
                            ticketCategories: selectedEvent?.ticketCategories ?? [],
                            tables: rawTables.map((t, idx) => tableForBackend(t, idx)),
                          };
                          await StorageService.updateAdminEvent(selectedEvent.id, payload);
                          setSuccessMessage(UI_TEXT.admin.eventPublishedAgain);
                          await loadEvent(selectedEventId);
                        } catch (e) {
                          console.error('[AdminPanel] Publish again failed', e);
                          setError(toFriendlyError(e));
                        } finally {
                          setStatusActionLoading(false);
                        }
                      }}
                      disabled={statusActionLoading}
                      className="disabled:opacity-50"
                    >
                      {statusActionLoading ? '…' : UI_TEXT.admin.publishAgain}
                    </PrimaryButton>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm mt-3">
                  <input
                    type="checkbox"
                    checked={eventPublished}
                    onChange={(e) => { setEventPublished(e.target.checked); markDirty(); }}
                  />
                  {UI_TEXT.admin.publishedCheckbox}
                </label>
                {selectedEvent?.id && (
                  <div className="mt-4 space-y-2">
                    {selectedEvent?.status !== 'published' && (
                      <p className="text-xs text-[#6E6A64]">Черновик — доступен только вам</p>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          `${window.location.origin}/event/${selectedEvent?.id}`,
                          '_blank'
                        )
                      }
                      className="bg-[#1A1A1A] border border-white/10 text-white px-4 py-2 rounded-xl text-sm hover:border-white/20 transition"
                    >
                      👁 Просмотреть как пользователь
                    </button>
                  </div>
                )}
                      </SortableSection>
                    );
                    if (key === 'tables') return (
                      <SortableSection key="tables" id="tables" title={`Столы (${selectedEvent?.tables?.length ?? 0})`} sectionKey="tables">
                <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{UI_TEXT.tables.tables}</div>
                  <PrimaryButton
                    onClick={addTable}
                    disabled={addingTable || savingLayout}
                  >
                    {addingTable ? UI_TEXT.common.loading : UI_TEXT.tables.addTable}
                  </PrimaryButton>
                </div>
                {(selectedEvent?.tables ?? []).length === 0 && (
                  <div className="text-xs text-muted">{UI_TEXT.tables.noTablesYet}</div>
                )}
                {(selectedEvent?.tables ?? []).map((t, idx) => (
                  <div key={t.id} className="flex flex-wrap gap-2 items-center">
                    <div className="text-xs text-muted">#{idx + 1}</div>
                    <label className="text-xs text-[#6E6A64]">
                      {UI_TEXT.tables.tableNumber}
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={t.number ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, number: 1 } : it) } : null);
                            markDirty();
                            return;
                          }
                          const parsed = parseInt(raw, 10);
                          const val = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, number: val } : it) } : null);
                          markDirty();
                        }}
                        className="ml-1 w-16 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-[#6E6A64]">
                      <input
                        type="checkbox"
                        checked={t.isAvailable === true}
                        onChange={() => {
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, isAvailable: !it.isAvailable } : it) } : null);
                        }}
                        className="rounded"
                      />
                      {UI_TEXT.tables.available}
                    </label>
                    <label className="text-xs text-[#6E6A64]">
                      X
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={t.x ?? t.centerX ?? 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, x: val, centerX: val } : it) } : null);
                          markDirty();
                        }}
                        className="ml-1 w-20 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-[#6E6A64]">
                      Y
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={t.y ?? t.centerY ?? 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, y: val, centerY: val } : it) } : null);
                          markDirty();
                        }}
                        className="ml-1 w-20 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-[#6E6A64]">
                      {UI_TEXT.tables.sizePercent}
                      <input
                        type="number"
                        min={1}
                        max={20}
                        step={1}
                        value={t.sizePercent ?? 6}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(20, Number(e.target.value) || 6));
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, sizePercent: val } : it) } : null);
                          markDirty();
                        }}
                        className="ml-1 w-14 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-[#6E6A64]">
                      {UI_TEXT.tables.seats}
                      <input
                        type="number"
                        min={0}
                        value={t.seatsTotal}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, seatsTotal: val, seatsAvailable: val } : it) } : null);
                          markDirty();
                        }}
                        className="ml-1 w-20 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-[#6E6A64]">
                      {UI_TEXT.tables.shape}
                      <select
                        value={t.shape ?? 'circle'}
                        onChange={(e) => {
                          const val = e.target.value === 'rect' ? 'rect' : 'circle';
                          const defaults = val === 'rect'
                            ? { widthPercent: (t as { widthPercent?: number }).widthPercent ?? 8, heightPercent: (t as { heightPercent?: number }).heightPercent ?? 6, rotationDeg: (t as { rotationDeg?: number }).rotationDeg ?? 0 }
                            : {};
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, shape: val, ...defaults } : it) } : null);
                          markDirty();
                        }}
                        className="ml-1 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="circle">{UI_TEXT.tables.shapeCircle}</option>
                        <option value="rect">{UI_TEXT.tables.shapeRect}</option>
                      </select>
                    </label>
                    {(t.shape ?? 'circle') !== 'circle' && (
                      <>
                        <label className="text-xs text-[#6E6A64]">
                          {UI_TEXT.tables.widthPercent}
                          <input
                            type="number"
                            min={0.1}
                            step={0.5}
                            value={(t as { widthPercent?: number }).widthPercent ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw === '' ? undefined : Math.max(0.1, Number(raw));
                              setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, widthPercent: val } : it) } : null);
                              markDirty();
                            }}
                            className="ml-1 w-14 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </label>
                        <label className="text-xs text-[#6E6A64]">
                          {UI_TEXT.tables.heightPercent}
                          <input
                            type="number"
                            min={0.1}
                            step={0.5}
                            value={(t as { heightPercent?: number }).heightPercent ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw === '' ? undefined : Math.max(0.1, Number(raw));
                              setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, heightPercent: val } : it) } : null);
                              markDirty();
                            }}
                            className="ml-1 w-14 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </label>
                        <label className="text-xs text-[#6E6A64]">
                          {UI_TEXT.tables.rotationDeg}
                          <input
                            type="number"
                            min={-180}
                            max={180}
                            step={1}
                            value={(t as { rotationDeg?: number }).rotationDeg ?? 0}
                            onChange={(e) => {
                              const val = Math.max(-180, Math.min(180, Number(e.target.value) || 0));
                              setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, rotationDeg: val } : it) } : null);
                              markDirty();
                            }}
                            className="ml-1 w-14 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </label>
                      </>
                    )}
                    <label className="text-xs text-[#6E6A64]">
                      {UI_TEXT.tables.tableCategory}
                      <select
                        value={t.ticketCategoryId ?? ''}
                        onChange={(e) => {
                          const val = e.target.value || undefined;
                          setSelectedEvent((prev) =>
                            prev ? { ...prev, tables: (prev.tables ?? []).map((it) => (it.id === t.id ? { ...it, ticketCategoryId: val } : it)) } : null
                          );
                          markDirty();
                        }}
                        className="ml-1 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="">—</option>
                        {(selectedEvent?.ticketCategories ?? [])
                          .filter((c) => c.isActive)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="text-xs text-[#6E6A64]" title={UI_TEXT.tables.visibleFromPlaceholder}>
                      {UI_TEXT.tables.visibleFrom}
                      <input
                        type="datetime-local"
                        value={toDatetimeLocal(t.visibleFrom ?? undefined)}
                        onChange={(e) => {
                          const val = e.target.value ? new Date(e.target.value).toISOString() : '';
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, visibleFrom: val || null } : it) } : null);
                          markDirty();
                        }}
                        className="ml-1 w-36 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="text-xs text-[#6E6A64]" title={UI_TEXT.tables.visibleUntilPlaceholder}>
                      {UI_TEXT.tables.visibleUntil}
                      <input
                        type="datetime-local"
                        value={toDatetimeLocal(t.visibleUntil ?? undefined)}
                        onChange={(e) => {
                          const val = e.target.value ? new Date(e.target.value).toISOString() : '';
                          setSelectedEvent((prev) => prev ? { ...prev, tables: (prev.tables ?? []).map((it) => it.id === t.id ? { ...it, visibleUntil: val || null } : it) } : null);
                          markDirty();
                        }}
                        className="ml-1 w-36 border rounded px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    {(() => {
                      const hasBookings = tableIdsWithBookings.has(t.id);
                      return (
                        <DangerButton
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(UI_TEXT.tables.deleteConfirm)) return;
                            await deleteTable(t.id);
                          }}
                          disabled={savingLayout}
                          title={hasBookings ? UI_TEXT.tables.deleteWithBookingsTooltip : undefined}
                          className="px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          🗑 {UI_TEXT.tables.delete}
                        </DangerButton>
                      );
                    })()}
                  </div>
                ))}
                </div>
                      </SortableSection>
                    );
                    if (key === 'layout') return (
                      <SortableSection key="layout" id="layout" title="План зала" sectionKey="layout">
                <div>
                <div className="text-sm font-semibold mb-1">{UI_TEXT.event.posterLabel}</div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !selectedEvent?.id) return;
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
                      e.target.value = '';
                    }
                  }}
                  disabled={posterUploadLoading || !selectedEvent?.id}
                  className="w-full max-w-full border rounded px-3 py-2 text-sm box-border file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-surface file:cursor-pointer"
                />
                {posterUploadLoading && <div className="text-xs text-muted mt-1">{UI_TEXT.common.loading}</div>}
                {posterUploadError && <div className="text-xs text-[#6E6A64] mt-1">{posterUploadError}</div>}
                <div className="text-xs text-muted mt-1">
                  Загрузите изображение афиши (обложка события).
                </div>
                {eventPosterUrl && (
                  <div className="mt-2">
                    <div className="rounded border overflow-hidden bg-surface max-h-32">
                      <img src={eventPosterUrl} alt="" className="w-full h-auto max-h-32 object-contain" onError={() => {}} />
                    </div>
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">{UI_TEXT.tables.layoutImageUrl}</div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !selectedEvent?.id) return;
                    setLayoutUploadLoading(true);
                    setLayoutUploadError(null);
                    try {
                      const { url, version } = await StorageService.uploadLayoutImage(selectedEvent.id, file);
                      setLayoutUrl(url);
                      setLayoutUploadVersion(version ?? null);
                      markDirty();
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
                {layoutUploadLoading && <div className="text-xs text-muted mt-1">{UI_TEXT.common.loading}</div>}
                {layoutUploadError && <div className="text-xs text-[#6E6A64] mt-1">{layoutUploadError}</div>}
                <input
                  type="text"
                  value={layoutUrl}
                  onChange={(e) => { setLayoutUrl(e.target.value); setLayoutUploadError(null); setLayoutUploadVersion(null); markDirty(); }}
                  placeholder={UI_TEXT.tables.layoutImagePlaceholder}
                  className="w-full max-w-full border rounded px-3 py-2 text-sm box-border mt-2"
                />
                <div className="text-xs text-muted mt-1">
                  {UI_TEXT.tables.layoutImageHint}
                </div>
                {layoutUrl && (
                  <div className="mt-2">
                    <div className="rounded border overflow-hidden bg-surface max-h-32">
                      <img src={layoutUrl} alt="" className="w-full h-auto max-h-32 object-contain" onError={() => {}} />
                    </div>
                    {layoutUploadVersion != null && (
                      <div className="text-xs text-muted mt-1">v{layoutUploadVersion}</div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2 flex-col md:flex-row">
                  <PrimaryButton
                    onClick={saveLayout}
                    disabled={savingLayout}
                    className="w-full md:w-auto"
                  >
                    {savingLayout ? UI_TEXT.common.saving : UI_TEXT.common.save}
                  </PrimaryButton>
                  <SecondaryButton
                    onClick={() => { setLayoutUrl(selectedEvent?.layoutImageUrl || ''); setLayoutUploadVersion(null); }}
                    className="w-full md:w-auto"
                  >
                    {UI_TEXT.common.reset}
                  </SecondaryButton>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">{UI_TEXT.tables.layoutPreview}</div>
                {/* Layout container: same aspect ratio as image so admin and user coordinates match 1:1. */}
                <div
                  ref={layoutPreviewRef}
                  className="relative w-full border border-[#242424] rounded-xl bg-[#111111] overflow-hidden"
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: layoutAspectRatio ?? 16 / 9,
                    minHeight: layoutAspectRatio == null ? '18rem' : undefined,
                    padding: 0,
                    backgroundImage: layoutUrl ? `url(${layoutUrl})` : 'none',
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'top left',
                  }}
                >
                  {!layoutUrl && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted pointer-events-none">
                      {UI_TEXT.tables.noLayoutImage}
                    </div>
                  )}
                  {[...(selectedEvent?.tables ?? [])].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity)).map((raw) => {
                    const table = mapTableFromDb(raw);
                    const available = typeof table.seatsAvailable === 'number' ? table.seatsAvailable : table.seatsTotal ?? 0;
                    const total = typeof table.seatsTotal === 'number' ? table.seatsTotal : 4;
                    const category = table.ticketCategoryId
                      ? (selectedEvent?.ticketCategories ?? []).find((c) => c.id === table.ticketCategoryId)
                      : null;
                    const goldTone = category
                      ? getGoldToneFromStyleKey(category.styleKey)
                      : getGoldToneByCategory(table.color);
                    const effectiveWidth =
                      layoutPreviewWidth && layoutPreviewWidth > 0
                        ? layoutPreviewWidth
                        : 320;
                    const sizes = computeTableSizes(effectiveWidth, {
                      sizePercent: table.sizePercent,
                      widthPercent: table.widthPercent,
                      heightPercent: table.heightPercent,
                    });
                    const borderRadius = sizes.borderRadius === '50%' ? '50%' : 12;
                    const shapeStyle = {
                      ...goldTone,
                      width: sizes.width,
                      height: sizes.height,
                      borderRadius,
                      background: 'linear-gradient(145deg, var(--gold-light), var(--gold-base))',
                      border: '1.5px solid var(--gold-dark)',
                    };
                    return (
                      <div
                        key={table.id}
                        className="table-wrapper"
                        style={{
                          position: 'absolute',
                          left: `${table.centerX}%`,
                          top: `${table.centerY}%`,
                          transform: `translate(-50%, -50%) rotate(${table.rotationDeg}deg)`,
                          transformOrigin: 'center',
                        }}
                      >
                        <div className="table-shape table-shape-gold" style={shapeStyle} />
                        <div className="table-label">
                          <TableNumber number={table.number ?? 0} fontSize={`${sizes.fontNumber}px`} />
                          <SeatInfo available={available} total={total} fontSize={`${sizes.fontSub}px`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-muted mt-2">
                  {UI_TEXT.tables.layoutHint}
                </div>
              </div>
                      </SortableSection>
                    );
                    return null;
                  })}
                </SortableContext>
              </DndContext>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;