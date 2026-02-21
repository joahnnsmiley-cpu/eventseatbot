import React, { useEffect, useState, useRef, useMemo, memo } from 'react';
import { TransformWrapper, TransformComponent, MiniMap } from 'react-zoom-pan-pinch';
import { EventData } from '../types';
import { UI_TEXT } from '../constants/uiText';
import { getCategoryColorFromCategory } from '../src/config/categoryColors';
import { useContainerWidth } from '../src/hooks/useContainerWidth';
import { mapTableFromDb } from '../src/utils/mapTableFromDb';
import { getTableShapeStyle, getTableLabelStyle } from '../src/utils/tableShapeStyles';
import { TableNumber } from './TableLabel';
import { TableSeatDots } from './TableSeatDots';

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
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const selectedSeats = seatState?.selectedSeats ?? [];
  // When tables prop provided, use it (ensures fresh event.tables). Else: seatState.tables or event.tables
  const rawTables = Array.isArray(tablesProp)
    ? tablesProp
    : Array.isArray(seatState?.tables)
      ? seatState.tables
      : Array.isArray(event?.tables)
        ? event.tables
        : [];
  const mappedTables = useMemo(() => {
    const filtered = rawTables.filter((t: { is_active?: boolean }) => t.is_active !== false);
    const sorted = [...filtered].sort((a: { number?: number }, b: { number?: number }) => (a.number ?? Infinity) - (b.number ?? Infinity));
    return sorted.map(mapTableFromDb);
  }, [tablesProp, seatState?.tables, event?.tables]);
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
        minHeight: layoutAspectRatio == null ? '12rem' : undefined,
        margin: '0 auto',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.8), 0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div
        className="layout-wrapper absolute inset-0 min-w-0 min-h-0"
        style={{ transform: 'translateZ(0)', willChange: 'transform' }}
      >
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
                  wrapperStyle={{ width: '100%', height: '100%', touchAction: 'none' }}
                  contentStyle={{ width: '100%', height: '100%', position: 'relative', touchAction: 'none' }}
                >
                  <div
                    className="layout-image-layer"
                    style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, touchAction: 'none' }}
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
                      touchAction: 'none',
                    }}
                  >
                    {totalSeats > 0 && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          zIndex: 4,
                          background: 'rgba(0,0,0,0.35)',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                          transition: 'opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                          animation: 'seatmap-overlay-fade-in 0.2s ease-out',
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
                        touchAction: 'none',
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
                        const category = event?.ticketCategories?.find((c) => c.id === table.ticketCategoryId);
                        const palette = category ? getCategoryColorFromCategory(category) : null;
                        const shapeStyle = getTableShapeStyle(palette, isCircle);
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
                          ...(isCircle ? { aspectRatio: '1 / 1' } : { height: heightPct }),
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
                            className={`table-wrapper ${isCircle ? 'table-wrapper-circle' : ''} ${isTableDisabled ? 'table-disabled' : ''} ${isSelected ? 'table-selected' : ''}`}
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
                            <div
                              className={`table-shape table-shape-gold ${isCircle ? 'table-shape-circle' : ''}`}
                              style={{
                                ...shapeStyle,
                                // Apple-style: desaturate + dim instead of overlaying
                                ...(isTableDisabled && !isEditable ? {
                                  filter: isSoldOut
                                    ? 'grayscale(0.85) brightness(0.38)'
                                    : 'grayscale(0.95) brightness(0.28)',
                                  transition: 'filter 0.2s ease',
                                } : {}),
                              }}
                            >
                              <div className="table-overlay">
                                {!isEditable && table.seatsTotal > 0 && (
                                  <TableSeatDots
                                    seatsTotal={table.seatsTotal}
                                    seatsAvailable={table.seatsAvailable ?? table.seatsTotal}
                                    selectedIndices={selectedSeatsByTable?.[table.id]}
                                    accentColor={palette?.base ?? '#FFC107'}
                                    tableShape={isCircle ? 'circle' : 'rect'}
                                    widthPercent={table.widthPercent}
                                    heightPercent={table.heightPercent}
                                  />
                                )}
                                <div className="table-label" style={getTableLabelStyle(palette ?? null)}>
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

                              {/* Sold-out micro-badge — only when fully booked, no emoji */}
                              {!isEditable && isSoldOut && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: '-10px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: 8,
                                    pointerEvents: 'none',
                                    whiteSpace: 'nowrap',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    fontSize: '0.52em',
                                    fontWeight: 600,
                                    letterSpacing: '0.04em',
                                    color: 'rgba(255,255,255,0.45)',
                                    background: 'rgba(0,0,0,0.55)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    backdropFilter: 'blur(4px)',
                                    WebkitBackdropFilter: 'blur(4px)',
                                  }}
                                >
                                  Занято
                                </div>
                              )}
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
                </TransformComponent>

                {/* Collapsible map controls — premium, не перекрывают столы */}
                <div
                  className="absolute bottom-3 left-3 z-20 flex flex-col gap-2"
                  style={{
                    transition: 'opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  {controlsExpanded ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          resetTransform(300, 'easeOut');
                          centerView?.(1, 300, 'easeOut');
                          window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/80 text-white text-xs backdrop-blur-md border border-white/10 hover:border-[#C6A75E]/40 active:scale-[0.98] transition-all"
                      >
                        <span style={{ opacity: 0.9 }}>⊞</span>
                        Сбросить масштаб
                      </button>
                      {layoutImageUrl && (
                        <div className="w-[48px] max-w-[48px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/80 backdrop-blur-md">
                          <MiniMap width={48} height={32} borderColor="rgba(198,167,94,0.5)">
                            <img src={layoutImageUrl} alt="" className="w-full h-full object-contain" />
                          </MiniMap>
                        </div>
                      )}
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setControlsExpanded((v) => !v);
                      window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                    }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center bg-black/80 backdrop-blur-md border border-white/10 hover:border-[#C6A75E]/40 active:scale-95 transition-all"
                    aria-label={controlsExpanded ? 'Скрыть управление' : 'Показать управление картой'}
                    title={controlsExpanded ? 'Скрыть' : 'Карта и масштаб'}
                  >
                    <span style={{ fontSize: 18, color: '#C6A75E', fontWeight: 300 }}>
                      {controlsExpanded ? '×' : '⋯'}
                    </span>
                  </button>
                </div>
              </>
            );
          }}
        </TransformWrapper>
      </div>
    </div>
  );
};

export default SeatMap;