import React, { useEffect, useState, useRef } from 'react';
import { TransformWrapper, TransformComponent, MiniMap } from 'react-zoom-pan-pinch';
import { EventData } from '../types';
import { UI_TEXT } from '../constants/uiText';
import { CATEGORY_COLORS, resolveCategoryColorKey } from '../src/config/categoryColors';
import { useContainerWidth } from '../src/hooks/useContainerWidth';
import { mapTableFromDb } from '../src/utils/mapTableFromDb';
import { TableNumber } from './TableLabel';

const ArrowIcon = () => <span style={{ color: '#C6A75E', fontSize: '1.2em' }}>›</span>;

type SeatStatus = 'available' | 'reserved' | 'sold';

export type SeatModel = {
  id: string;
  tableId: string;
  number: number;
  price: number;
  status: SeatStatus;
};

export type TableModel = {
  id: string;
  number: number;
  seatsTotal: number;
  seatsAvailable: number;
  /** When absent, treat as false. */
  isAvailable?: boolean;
  x?: number;
  y?: number;
  centerX: number;
  centerY: number;
  shape?: string;
};

export type SeatSelectionState = {
  tables: TableModel[];
  seats: SeatModel[];
  selectedSeats: string[]; // Array of "tableId-seatId"
  activeTableId?: string | null;
};

/** selectedSeatsByTable[tableId] = selected seat indices. Main map displays only; panel SeatPicker toggles. */
interface SeatMapProps {
  event: EventData;
  /** When provided, use these tables instead of deriving from event/seatState. Ensures fresh render. */
  tables?: EventData['tables'];
  isEditable?: boolean; // For Admin
  seatState?: SeatSelectionState;
  selectedSeatsByTable?: Record<string, number[]>;
  selectedTableId?: string | null;
  onSeatToggle?: (seat: SeatModel) => void;
  onSelectedSeatsChange?: (selectedSeats: string[]) => void;
  onTableAdd?: (x: number, y: number) => void;
  onTableDelete?: (tableId: string) => void;
  onTableSelect?: (tableId: string) => void;
}

const SeatMap: React.FC<SeatMapProps> = ({ 
  event, 
  tables: tablesProp,
  isEditable = false, 
  seatState,
  selectedTableId = null,
  onSeatToggle,
  onSelectedSeatsChange,
  onTableAdd,
  onTableDelete,
  onTableSelect,
  selectedSeatsByTable,
}) => {
  const selectedSeats = seatState?.selectedSeats ?? [];
  // When tables prop provided, use it (ensures fresh event.tables). Else: seatState.tables or event.tables
  const rawTables = Array.isArray(tablesProp)
    ? tablesProp
    : Array.isArray(seatState?.tables)
      ? seatState.tables
      : Array.isArray(event?.tables)
        ? event.tables
        : [];
  const tables = rawTables
    .filter((t: { is_active?: boolean }) => t.is_active !== false)
    .sort((a: { number?: number }, b: { number?: number }) => (a.number ?? Infinity) - (b.number ?? Infinity));
  const mappedTables = tables.map(mapTableFromDb);
  const seats = seatState?.seats ?? [];
  const selectedSet = new Set(selectedSeats);
  const layoutImageUrl = (event?.layout_image_url ?? event?.layoutImageUrl ?? '').trim();
  const [layoutAspectRatio, setLayoutAspectRatio] = useState<number | null>(null);
  const [layoutRef] = useContainerWidth<HTMLDivElement>();
  const zoomApiRef = useRef<{ zoomToElement?: (el: HTMLElement | string, scale?: number, time?: number, easing?: string) => void; centerView?: (scale?: number, time?: number, easing?: string) => void }>({});
  const hasAutoZoomedRef = useRef(false);

  const totalSeats = Object.values(selectedSeatsByTable ?? {}).reduce((n, arr) => n + arr.length, 0);
  const lastSelectedTableId = totalSeats > 0
    ? (Object.entries(selectedSeatsByTable ?? {}).find(([, seats]) => (seats?.length ?? 0) > 0)?.[0] ?? null)
    : null;

  useEffect(() => {
    if (!layoutImageUrl) {
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
    img.src = layoutImageUrl;
  }, [layoutImageUrl]);

  useEffect(() => {
    if (totalSeats === 0) hasAutoZoomedRef.current = false;
  }, [totalSeats]);

  useEffect(() => {
    if (!lastSelectedTableId || hasAutoZoomedRef.current) return;
    const zoomToElement = zoomApiRef.current.zoomToElement;
    if (!zoomToElement) return;
    const el = document.getElementById(`table-${lastSelectedTableId}`);
    if (el) {
      hasAutoZoomedRef.current = true;
      zoomToElement(el, 1.6, 300, 'easeOut');
    }
  }, [lastSelectedTableId]);

  const canSelectSeat = (seat: SeatModel) => seat.status === 'available';

  const toggleSeat = (seat: SeatModel) => {
    if (!canSelectSeat(seat)) return;
    const key = `${seat.tableId}-${seat.id}`;
    const next = selectedSet.has(key)
      ? selectedSeats.filter((id) => id !== key)
      : [...selectedSeats, key];
    onSelectedSeatsChange?.(next);
    onSeatToggle?.(seat);
  };

  const handleMapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditable || !onTableAdd) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-table-id]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onTableAdd(x, y);
  };

  return (
    <div
      ref={layoutRef}
      className="relative w-full overflow-hidden rounded-2xl"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        aspectRatio: layoutAspectRatio ?? 16 / 9,
        minHeight: layoutAspectRatio == null ? '18rem' : undefined,
        margin: '0 auto',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)',
      }}
    >
      <div className="layout-wrapper absolute inset-0 min-w-0 min-h-0">
        <TransformWrapper
          minScale={0.8}
          maxScale={3}
          initialScale={1}
          limitToBounds={true}
          centerOnInit={true}
          wheel={{ step: 0.08 }}
          pinch={{ step: 5 }}
          doubleClick={{ disabled: true }}
          panning={{ velocityDisabled: false }}
          alignmentAnimation={{
            sizeX: 200,
            sizeY: 200,
          }}
          velocityAnimation={{
            sensitivity: 1,
            animationTime: 200,
          }}
        >
          {({ resetTransform, zoomToElement, centerView }) => {
            zoomApiRef.current = { zoomToElement, centerView };
            return (
            <>
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: '100%', height: '100%', position: 'relative' }}
              >
                <div
                  className="layout-image-layer"
                  style={{ width: '100%', height: '100%', position: 'relative', touchAction: 'none' }}
                >
                  {layoutImageUrl && (
                    <img
                      src={layoutImageUrl}
                      alt=""
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    />
                  )}
                </div>
              </TransformComponent>

              <div
                className="tables-layer"
                style={{
                  position: 'absolute',
                  zIndex: 10,
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: '100%',
                  height: '100%',
                  padding: 0,
                  margin: 0,
                }}
              >
                {totalSeats > 0 && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      zIndex: 4,
                      background: 'rgba(0,0,0,0.35)',
                      transition: 'opacity 0.2s',
                    }}
                  />
                )}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    zIndex: 5,
                    background:
                      'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 20%, rgba(0,0,0,0) 40%)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    zIndex: 10,
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    width: '100%',
                    height: '100%',
                    padding: 0,
                    margin: 0,
                    cursor: isEditable ? 'crosshair' : 'default',
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={handleMapPointerDown}
                >
      {!layoutImageUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted pointer-events-none">
          {UI_TEXT.seatMap.noLayoutImage}
        </div>
      )}

      {mappedTables.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted pointer-events-none">
          {UI_TEXT.seatMap.noTablesYet}
        </div>
      )}
      {mappedTables.map((table) => {
        const isAvailableForSale = table.isAvailable === true;
        const isSoldOut = !isEditable && table.seatsAvailable === 0;
        const isTableDisabled = !isEditable && (!isAvailableForSale || isSoldOut);
        const isSelected = selectedTableId === table.id;
        const isCircle = table.shape === 'circle';
        const circleSize = `${table.widthPercent ?? table.sizePercent ?? 6}%`;
        const widthPct = isCircle ? circleSize : (table.widthPercent ? `${table.widthPercent}%` : `${table.sizePercent ?? 6}%`);
        const heightPct = isCircle ? circleSize : (table.heightPercent ? `${table.heightPercent}%` : `${table.sizePercent ?? 6}%`);
        const borderRadius = isCircle ? '50%' : 0;
        const category = event?.ticketCategories?.find((c) => c.id === table.ticketCategoryId);
        const palette = category ? CATEGORY_COLORS[resolveCategoryColorKey(category)] : null;
        const background = palette
          ? `radial-gradient(circle at 35% 30%, ${(palette as { soft?: string }).soft ?? palette.base}55, transparent 70%), linear-gradient(145deg, #1b1b1b, #0f0f0f)`
          : 'linear-gradient(145deg, #1b1b1b, #0f0f0f)';
        const border = palette ? palette.border.replace('1.5px', '2px') : '1.5px solid #3a3a3a';
        const boxShadow = palette
          ? `0 0 18px ${(palette as { glowColor?: string }).glowColor ?? 'rgba(198,167,94,0.5)'}, inset 0 0 8px rgba(255,255,255,0.05)`
          : '0 0 8px rgba(0,0,0,0.6)';
        const shapeStyle: React.CSSProperties = isCircle
          ? {
              width: '100%',
              background,
              border,
              boxShadow,
            }
          : {
              width: '100%',
              height: '100%',
              borderRadius,
              background,
              border,
              boxShadow,
            };
        const hasSelectedSeats = (selectedSeatsByTable?.[table.id]?.length ?? 0) > 0;
        const innerButtonStyle: React.CSSProperties = {
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '55%',
          aspectRatio: '1 / 1',
          borderRadius: table.shape === 'circle' ? '50%' : 12,
          background: 'rgba(40,40,40,0.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          cursor: 'pointer',
          pointerEvents: 'auto',
        };
        const wrapperStyle: React.CSSProperties = {
          position: 'absolute',
          left: `${table.centerX}%`,
          top: `${table.centerY}%`,
          width: widthPct,
          ...(isCircle ? {} : { height: heightPct }),
          transform: `translate(-50%, -50%) rotate(${table.rotationDeg ?? 0}deg)`,
          transformOrigin: 'center',
          cursor: isTableDisabled ? 'not-allowed' : 'pointer',
          opacity: totalSeats > 0 ? (hasSelectedSeats ? 1 : 0.7) : 1,
          transition: 'opacity 0.2s',
          pointerEvents: 'auto',
        };
        return (
          <div
            key={table.id}
            data-table-id={table.id}
            id={`table-${table.id}`}
            className={`table-wrapper ${isTableDisabled ? 'table-disabled' : ''} ${isSelected ? 'table-selected' : ''}`}
            style={wrapperStyle}
            onClick={(e) => {
                if (isTableDisabled) return;
                e.stopPropagation();
                if (window?.Telegram?.WebApp?.HapticFeedback) {
                  window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }
                if (onTableSelect) onTableSelect(table.id);
              }}
          >
              <div className={`table-shape table-shape-gold ${isCircle ? 'table-shape-circle' : ''}`} style={shapeStyle}>
                <div className="table-overlay">
                  <div className="table-label">
                    <TableNumber number={table.number ?? 0} />
                  </div>
                  {isEditable && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onTableDelete && onTableDelete(table.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTableDelete?.(table.id); } }}
                      aria-label={`${UI_TEXT.common.delete} ${UI_TEXT.tables.table} ${table.number}`}
                      style={innerButtonStyle}
                    >
                      <ArrowIcon />
                    </div>
                  )}
                </div>
              </div>
          </div>
        );
      })}

      {!isEditable && seats.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-[#0B0B0B] border-t border-white/10 p-4">
          <div className="text-xs uppercase tracking-widest text-muted-light mb-3">{UI_TEXT.seatMap.seats}</div>
          <div className="grid grid-cols-6 gap-3">
            {seats.map((seat) => {
              const key = `${seat.tableId}-${seat.id}`;
              const isSelected = selectedSet.has(key);
              const isDisabled = seat.status !== 'available';
              const baseClass = 'w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ease-out';
              const statusClass = isSelected
                ? 'bg-[#FFC107] text-black shadow-[0_0_15px_rgba(255,193,7,0.6)] scale-105'
                : seat.status === 'available'
                  ? 'bg-[#1a1a1a] border border-white/10 text-white hover:border-[#FFC107] hover:scale-105'
                  : 'bg-[#111] text-muted opacity-40 cursor-not-allowed';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSeat(seat)}
                  disabled={isDisabled && !isSelected}
                  className={`${baseClass} ${statusClass}`}
                  aria-pressed={isSelected}
                  aria-disabled={isDisabled && !isSelected}
                  title={`${UI_TEXT.tables.seat} ${seat.number}`}
                  aria-label={`${UI_TEXT.tables.seat} ${seat.number}`}
                >
                  {seat.number}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#1a1a1a] border border-white/10 inline-block" />{UI_TEXT.seatMap.available}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#FFC107] inline-block" />{UI_TEXT.seatMap.selected}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#111] opacity-40 inline-block" />{UI_TEXT.seatMap.sold}</span>
          </div>
        </div>
      )}
                </div>
              </div>

              {/* Reset Zoom Button */}
              <button
                type="button"
                onClick={() => {
                  resetTransform(300, 'easeOut');
                  centerView?.(1, 300, 'easeOut');
                }}
                className="absolute top-3 right-3 z-20 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10 active:scale-95 transition"
              >
                Сбросить масштаб
              </button>

              {/* Mini-map preview - layout image only, lightweight */}
              {layoutImageUrl && (
                <div className="absolute bottom-3 right-3 z-30 overflow-hidden rounded-lg border border-white/10 bg-black/70 backdrop-blur-sm pointer-events-none">
                  <MiniMap width={96} height={64} borderColor="rgba(198,167,94,0.6)">
                    <img
                      src={layoutImageUrl}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  </MiniMap>
                </div>
              )}
            </>
            );
          }}
        </TransformWrapper>
      </div>
    </div>
  );
};

export default SeatMap;