import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { EventData, TableModel } from '../types';
import { UI_TEXT } from '../constants/uiText';
import { computeTableSizes } from '../src/ui/tableSizing';
import { TableNumber } from './TableLabel';
import PrimaryButton from '../src/ui/PrimaryButton';
import SecondaryButton from '../src/ui/SecondaryButton';
import DangerButton from '../src/ui/DangerButton';
import EventCard, { EventCardSkeleton } from './EventCard';
import AdminCard from '../src/ui/AdminCard';
import { mapTableFromDb } from '../src/utils/mapTableFromDb';
import { tableToApiPayload } from '../src/utils/tableToApiPayload';
import { deepClone } from '../src/utils/deepEqual';
import { DEFAULT_TICKET_CATEGORIES } from '../constants/ticketStyles';
import AdminTablesLayer from './AdminTablesLayer';
import TableEditPanel from './TableEditPanel';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { CATEGORY_COLORS, CATEGORY_COLOR_KEYS, getCategoryColor, resolveCategoryColorKey } from '../src/config/categoryColors';
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
  return tableToApiPayload(t, index);
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
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/** Validate table numbers: positive integer, unique within event. Returns error message or null. */
function validateTableNumbers(tables: TableModel[]): string | null {
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

/** Accordion section — defined outside AdminPanel to avoid remount on parent re-render (fixes scroll jump). */
const AccordionSection = React.memo(function AccordionSection({
    title,
    sectionKey,
    children,
    dirtyIndicator,
    dragHandle,
  openSections,
  toggleSection,
  sectionRefs,
  isDirty,
  }: {
    title: string;
    sectionKey: string;
    children: React.ReactNode;
    dirtyIndicator?: boolean;
    dragHandle?: React.ReactNode;
  openSections: string[];
  toggleSection: (key: string) => void;
  sectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  isDirty: boolean;
}) {
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
});

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
        openSections={openSections}
        toggleSection={toggleSection}
        sectionRefs={sectionRefs}
        isDirty={isDirty}
        >
          {children}
        </AccordionSection>
      </div>
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
  const [eventTicketTemplateUrl, setEventTicketTemplateUrl] = useState('');
  const [ticketTemplateUploadLoading, setTicketTemplateUploadLoading] = useState(false);
  const [ticketTemplateUploadError, setTicketTemplateUploadError] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [venue, setVenue] = useState('');
  const [eventPhone, setEventPhone] = useState('');
  const [eventPublished, setEventPublished] = useState(false);
  const [eventFeatured, setEventFeatured] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [eventStatusFilter, setEventStatusFilter] = useState<'published' | 'draft' | 'archived' | 'deleted'>('published');
  const [openSections, setOpenSections] = useState<string[]>(['basic']);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [sectionOrder, setSectionOrder] = useState(['basic', 'layout', 'tables', 'categories', 'publish']);
  const [exitConfirmPending, setExitConfirmPending] = useState<{ type: 'back' } | { type: 'switchMode'; mode: 'bookings' | 'layout' } | { type: 'switchEvent'; eventId: string } | null>(null);
  const [resyncLoading, setResyncLoading] = useState(false);
  const [layoutUploadLoading, setLayoutUploadLoading] = useState(false);
  const [layoutUploadError, setLayoutUploadError] = useState<string | null>(null);
  const [layoutUploadVersion, setLayoutUploadVersion] = useState<number | null>(null);
  const [eventTablesMap, setEventTablesMap] = useState<Record<string, TableModel[]>>({});
  const [eventDetailsMap, setEventDetailsMap] = useState<Record<string, EventData>>({});
  const [activeTabLeft, setActiveTabLeft] = useState(0);
  const [activeTabWidth, setActiveTabWidth] = useState(0);
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState<EventData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [tables, setTables] = useState<TableModel[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const initialTablesRef = useRef<TableModel[]>([]);
  const hasInitializedRef = useRef(false);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveLayoutRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);

  const isDirty = useMemo(
    () =>
      JSON.stringify(normalizeTables(tables)) !==
      JSON.stringify(normalizeTables(initialTablesRef.current)),
    [tables]
  );

  useEffect(() => {
    hasInitializedRef.current = false;
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (!selectedEvent?.tables) return;
    if (hasInitializedRef.current) return;
    const mapped = (selectedEvent.tables ?? []).map(mapTableFromDb);
    setTables(mapped);
    hasInitializedRef.current = true;
  }, [selectedEvent?.id]);

  const layoutPreviewRef = useRef<HTMLDivElement>(null);
  const layoutZoomResetRef = useRef<(() => void) | null>(null);
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
          map[eventId] = Array.isArray(ev?.tables) ? ev.tables.map(mapTableFromDb) : [];
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
    const mappedTables = (fresh.tables ?? []).map(mapTableFromDb);
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
    console.log("SAVE STARTED");
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
        isFeatured: eventFeatured,
        ticketCategories: selectedEvent?.ticketCategories ?? [],
        tables: (rawTables ?? []).map((t, idx) => tableForBackend(t, idx)),
      };
      console.log("FULL SAVE PAYLOAD JSON:", JSON.stringify(payload, null, 2));
      const response = await StorageService.updateAdminEvent(selectedEvent.id, payload);
      console.log("SAVE RESPONSE:", response);
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
      console.error("SAVE ERROR:", e);
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

  const addTable = (percentX = 50, percentY = 50) => {
    if (!selectedEvent?.id) return;
    const defaultCategoryId = (selectedEvent?.ticketCategories ?? []).find((c) => c.isActive)?.id ?? '';
    const newTable = {
      id: crypto.randomUUID(),
      centerXPercent: percentX,
      centerYPercent: percentY,
      centerX: percentX,
      centerY: percentY,
      widthPercent: 8,
      heightPercent: 8,
      sizePercent: 8,
      shape: 'circle' as const,
      rotationDeg: 0,
      seatsCount: 4,
      seatsTotal: 4,
      seatsAvailable: 4,
      categoryId: defaultCategoryId,
      ticketCategoryId: defaultCategoryId,
      isActive: true,
      isAvailable: true,
    };
    setTables((prev) => {
      const maxNumber = prev.length ? Math.max(...prev.map((t) => t.number ?? 0)) : 0;
      const nextNumber = maxNumber + 1;
      const withNumber = { ...newTable, number: nextNumber };
      const next = [...prev, withNumber];
      console.log('NEXT TABLES COUNT:', next.length);
      const numErr = validateTableNumbers(next);
      if (numErr) {
        console.log('VALIDATION ERROR:', numErr);
        setError(numErr);
        return prev;
      }
      const rectErr = validateRectTables(next);
      if (rectErr) {
        console.log('VALIDATION ERROR:', rectErr);
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
  const uniqueBookingStatuses = useMemo(
    () => [...new Set(bookings.map((b) => b.status).filter(Boolean))].sort(),
    [bookings]
  );

  useEffect(() => {
    if (bookings.length && statusFilter && !uniqueBookingStatuses.includes(statusFilter)) {
      setStatusFilter('');
    }
  }, [bookings.length, statusFilter, uniqueBookingStatuses]);

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

  const getActiveBookingsCount = useCallback((eventId: string) => {
    const active = ['reserved', 'pending', 'awaiting_confirmation', 'paid', 'payment_submitted'];
    return bookings.filter(
      (b) => (b.event_id ?? b.event?.id) === eventId && active.includes(String(b.status ?? ''))
    ).length;
  }, [bookings]);

  const executeExitAction = useCallback((pending: NonNullable<typeof exitConfirmPending>) => {
    setExitConfirmPending(null);
    if (pending.type === 'back') onBack?.();
    else if (pending.type === 'switchMode') setMode(pending.mode);
    else if (pending.type === 'switchEvent') {
      setSelectedEventId(pending.eventId);
      setSelectedEvent(null);
      setError(null);
      setSuccessMessage(null);
      loadEvent(pending.eventId);
    }
  }, [onBack]);

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
      console.error('[AdminPanel] Failed to delete event', e);
      setError(toFriendlyError(e));
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteConfirmEvent, selectedEventId, loadEvents]);

  return (
    <div className="admin-root min-h-screen p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex flex-col">
            <h1 className="text-2xl font-semibold tracking-wide bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              {UI_TEXT.admin.title}
            </h1>
            <span className="text-xs text-white/40 mt-1">{UI_TEXT.admin.subtitle}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {isDirty && (
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
        <div className="flex gap-2 items-center flex-shrink-0">
          {onBack && (
            <button
              onClick={() => {
                if (isDirty) setExitConfirmPending({ type: 'back' });
                else onBack();
              }}
              disabled={loading || eventsLoading || savingLayout || confirmingId !== null || cancellingId !== null}
              className="h-10 px-4 py-2.5 rounded-xl text-sm text-[#6E6A64] whitespace-nowrap min-w-fit"
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
            className="h-10 px-4 py-2.5 rounded-xl text-sm whitespace-nowrap min-w-fit"
          >
            {UI_TEXT.admin.reload}
          </PrimaryButton>
          <SecondaryButton
            onClick={handleResyncSeats}
            disabled={resyncLoading || loading || eventsLoading}
            className="h-10 px-4 py-2.5 rounded-xl text-sm whitespace-nowrap min-w-fit bg-[#ECE6DD] text-[#1C1C1C] hover:bg-[#DDD6CC] border-0"
          >
            {resyncLoading ? UI_TEXT.common.loading : UI_TEXT.admin.resyncSeats}
          </SecondaryButton>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => {
            if (isDirty && selectedEvent) setExitConfirmPending({ type: 'switchMode', mode: 'bookings' });
            else setMode('bookings');
          }}
          className={`px-3 py-2 rounded-lg text-sm ${mode === 'bookings' ? 'bg-[#C6A75E] text-black' : 'bg-[#1A1A1A] text-[#EAE6DD] border border-[#2A2A2A]'}`}
        >
          {UI_TEXT.admin.bookings}
        </button>
        <button
          onClick={() => {
            if (isDirty && selectedEvent) setExitConfirmPending({ type: 'switchMode', mode: 'layout' });
            else setMode('layout');
          }}
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
            <div className="flex flex-wrap gap-2 bg-[#141414] border border-white/10 rounded-xl p-1 mb-4">
              <button
                type="button"
                onClick={() => setStatusFilter('')}
                className={`px-3 py-2 text-sm rounded-lg transition-all ${
                  !statusFilter
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {UI_TEXT.booking.statusFilterAll}
              </button>
              {uniqueBookingStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-2 text-sm rounded-lg transition-all ${
                    statusFilter === s
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {UI_TEXT.booking.statusLabels[s] ?? s}
                </button>
              ))}
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

                    {(() => {
                      const comment = b.user_comment ?? b.userComment;
                      if (!comment || typeof comment !== 'string' || comment.trim() === '') return null;
                      return (
                        <div className="mt-3 bg-[#1c1c1c] border border-white/10 rounded-xl p-3 text-sm text-white/80 italic">
                          <div className="text-white/50 text-xs mb-1">Комментарий пользователя</div>
                          {comment}
                        </div>
                      );
                    })()}

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
                        data-active={eventStatusFilter === tab.key ? 'true' : undefined}
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
                      if (isDirty && selectedEventId && ev.id !== selectedEventId) {
                        setExitConfirmPending({ type: 'switchEvent', eventId: ev.id });
                      } else {
                      setSelectedEventId(ev.id);
                      setSelectedEvent(null);
                      setError(null);
                      setSuccessMessage(null);
                      loadEvent(ev.id);
                      }
                    }}
                    onDelete={() => setDeleteConfirmEvent(ev)}
                  />
                ))}
              </div>
            )}
          </div>

          {selectedEvent && (
            <>
              {selectedTableId && (
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
                      <SortableSectionInner key="basic" id="basic" title="Основная информация" sectionKey="basic" dirtyIndicator openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
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
                        className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-1">{UI_TEXT.event.eventTime}</div>
                      <input
                        type="time"
                        value={eventTime}
                        onChange={(e) => { setEventTime(e.target.value); }}
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
                      onChange={(e) => { setVenue(e.target.value); }}
                      placeholder={UI_TEXT.event.venuePlaceholder}
                      className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.organizerPhone}</div>
                    <input
                      type="text"
                      value={eventPhone}
                      onChange={(e) => { setEventPhone(e.target.value); }}
                      placeholder={UI_TEXT.event.phonePlaceholder}
                      className="w-full max-w-full border rounded px-3 py-2 text-sm box-border"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">{UI_TEXT.event.posterSectionLabel}</div>
                    {eventPosterUrl ? (
                      <div className="space-y-2">
                        <div className="rounded border overflow-hidden bg-surface max-h-32">
                          <img src={eventPosterUrl} alt="" className="w-full h-auto max-h-32 object-contain" onError={() => {}} />
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
                          <img src={eventTicketTemplateUrl} alt="" className="w-full h-auto max-h-32 object-contain" onError={() => {}} />
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
                      <SortableSectionInner key="categories" id="categories" title={`Категории (${selectedEvent?.ticketCategories?.length ?? 0})`} sectionKey="categories" openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
                <div className="text-sm font-semibold mb-3">Категории билетов</div>
                <div className="space-y-4">
                  {(selectedEvent?.ticketCategories ?? []).map((cat) => {
                    const colorKey = resolveCategoryColorKey(cat);
                    const colorConfig = getCategoryColor(colorKey);
                    return (
                      <div key={cat.id} className="p-3 rounded-lg border border-[#2A2A2A] bg-[#141414] space-y-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded border border-[#2A2A2A] shrink-0"
                            style={{ background: colorConfig.gradient }}
                            title={colorConfig.label}
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
                              }}
                            />
                            Активна
                          </label>
                          <DangerButton
                            type="button"
                            onClick={() => {
                              const isUsed = tables.some((t) => t.ticketCategoryId === cat.id);
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
                              }}
                              className="w-full border rounded px-2 py-1 text-sm bg-[#0F0F0F] border-[#2A2A2A] text-[#EAE6DD]"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-[#6E6A64] block mb-2">Цвет</label>
                            <div className="grid grid-cols-3 gap-3">
                              {CATEGORY_COLOR_KEYS.map((key) => {
                                const config = CATEGORY_COLORS[key];
                                const isSelected = (cat.color_key ?? cat.styleKey ?? 'gold') === key;
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
                                                c.id === cat.id ? { ...c, color_key: key } : c
                                        ),
                                      }
                                    : null
                                );
                                    }}
                                    className={`h-10 w-10 rounded-full transition-all hover:scale-105 ${
                                      isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141414]' : ''
                                    }`}
                                    style={{
                                      background: config.gradient,
                                      boxShadow: isSelected ? config.glow : 'none',
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
                  }}
                  className="mt-3"
                >
                  + Добавить категорию
                </PrimaryButton>
                      </SortableSectionInner>
                    );
                    if (key === 'publish') return (
                      <SortableSectionInner key="publish" id="publish" title="Публикация" sectionKey="publish" openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
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
                        const rawTables = tables;
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
                        const rawTables = tables;
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
                <div className="flex flex-wrap gap-4 mt-3">
                  <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={eventPublished}
                      onChange={(e) => { setEventPublished(e.target.checked); }}
                  />
                  {UI_TEXT.admin.publishedCheckbox}
                </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={eventFeatured}
                      onChange={(e) => { setEventFeatured(e.target.checked); }}
                    />
                    {UI_TEXT.admin.featuredCheckbox}
                  </label>
                </div>
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
                      </SortableSectionInner>
                    );
                    if (key === 'tables') return (
                      <SortableSectionInner key="tables" id="tables" title={`Столы (${tables.length})`} sectionKey="tables" openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
                <div className="space-y-3">
                <p className="text-xs text-muted">
                  Кликните на плане зала для добавления. Выберите стол для редактирования.
                </p>
                {tables.length === 0 && (
                  <div className="text-xs text-muted">{UI_TEXT.tables.noTablesYet}</div>
                )}
                {tables.map((t, idx) => (
                  <button
                    key={t.id}
                          type="button"
                    onClick={() => setSelectedTableId(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                      selectedTableId === t.id
                        ? 'border-[#C6A75E] bg-[#C6A75E]/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <span className="text-sm font-medium text-white">
                      {UI_TEXT.tables.table} {t.number ?? idx + 1}
                    </span>
                    <span className="text-xs text-muted ml-2">
                      {t.seatsTotal ?? 0} мест
                    </span>
                  </button>
                ))}
                </div>
                      </SortableSectionInner>
                    );
                    if (key === 'layout') return (
                      <SortableSectionInner key="layout" id="layout" title="План зала" sectionKey="layout" openSections={openSections} toggleSection={toggleSection} sectionRefs={sectionRefs} isDirty={isDirty}>
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
                  onChange={(e) => { setLayoutUrl(e.target.value); setLayoutUploadError(null); setLayoutUploadVersion(null); }}
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
                <div className="mt-3">
                  <SecondaryButton
                    onClick={() => { setLayoutUrl(selectedEvent?.layoutImageUrl || ''); setLayoutUploadVersion(null); }}
                    className="w-full md:w-auto"
                  >
                    {UI_TEXT.common.reset}
                  </SecondaryButton>
                </div>
              </div>

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
                    panning={{ velocityDisabled: false }}
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
                            }}
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (target.closest('[data-table-id]')) return;
                              const rect = layoutPreviewRef.current?.getBoundingClientRect();
                              if (!rect) return;
                              const percentX = ((e.clientX - rect.left) / rect.width) * 100;
                              const percentY = ((e.clientY - rect.top) / rect.height) * 100;
                              addTable(percentX, percentY);
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
                              selectedTableId={selectedTableId}
                              onTableSelect={(id) => setSelectedTableId(id)}
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
                  {UI_TEXT.tables.layoutHint}
                </div>
                <div className="mt-2">
                  <PrimaryButton onClick={() => addTable()}>
                    {UI_TEXT.tables.addTable}
                  </PrimaryButton>
              </div>
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

      {selectedEvent && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 max-w-[420px] mx-auto bg-black/95 border-t border-white/10 p-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={!isDirty || savingLayout}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-semibold shadow-lg shadow-yellow-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingLayout ? UI_TEXT.common.saving : UI_TEXT.common.save}
          </button>
        </div>
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