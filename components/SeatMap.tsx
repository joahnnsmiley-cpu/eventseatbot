import React, { useEffect, useState } from 'react';
import { EventData } from '../types';
import { UI_TEXT } from '../constants/uiText';
import { getGoldToneByCategory } from '../src/ui/theme';
import { computeTableSizes } from '../src/ui/tableSizing';
import { useContainerWidth } from '../src/hooks/useContainerWidth';
import { mapTableFromDb } from '../src/utils/mapTableFromDb';
import { TableNumber, SeatInfo } from './TableLabel';

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
  const [layoutRef, layoutWidth] = useContainerWidth<HTMLDivElement>();

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

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditable || !onTableAdd) return;
    // Don't trigger if clicking on a table
    if ((e.target as HTMLElement).closest('.table-wrapper')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onTableAdd(x, y);
  };

  return (
    <div
      ref={layoutRef}
      className="relative w-full overflow-hidden bg-surface rounded-lg border border-gray-300"
      style={{
        width: '100%',
        aspectRatio: layoutAspectRatio ?? 16 / 9,
        minHeight: layoutAspectRatio == null ? '18rem' : undefined,
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        {layoutImageUrl && (
          <img
            src={layoutImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{ position: 'absolute', zIndex: 0 }}
          />
        )}
        {/* Pure coordinate container: same aspect ratio as admin so coordinates match 1:1. */}
        <div
          className="relative z-10"
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
            border: 'none',
            boxSizing: 'content-box',
            display: 'block',
            cursor: isEditable ? 'crosshair' : 'default',
          }}
          onClick={handleMapClick}
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
      {layoutWidth > 0 && mappedTables.map((table) => {
        const isAvailableForSale = table.isAvailable === true;
        const isSoldOut = !isEditable && table.seatsAvailable === 0;
        const isTableDisabled = !isEditable && (!isAvailableForSale || isSoldOut);
        const isSelected = selectedTableId === table.id;
        const sizes = computeTableSizes(layoutWidth, {
          sizePercent: table.sizePercent,
          widthPercent: table.widthPercent,
          heightPercent: table.heightPercent,
        });
        const goldTone = getGoldToneByCategory(table.color);
        const borderRadius = sizes.borderRadius === '50%' ? '50%' : 12;
        const shapeStyle = {
          ...goldTone,
          width: sizes.width,
          height: sizes.height,
          borderRadius,
          background: 'linear-gradient(145deg, var(--gold-light), var(--gold-base))',
          border: '1.5px solid var(--gold-dark)',
        };
        const fontNumber = `${sizes.fontNumber}px`;
        const fontSub = `${sizes.fontSub}px`;
        return (
          <div
            key={table.id}
            className={`table-wrapper ${isTableDisabled ? 'table-disabled' : ''} ${isSelected ? 'table-selected' : ''}`}
            style={{
              position: 'absolute',
              left: `${table.centerX}%`,
              top: `${table.centerY}%`,
              transform: `translate(-50%, -50%) rotate(${table.rotationDeg}deg)`,
              transformOrigin: 'center',
              cursor: isTableDisabled ? 'not-allowed' : 'pointer',
            }}
            onClick={(e) => {
                if (isTableDisabled) return;
                e.stopPropagation();
                if (onTableSelect) onTableSelect(table.id);
              }}
          >
              <div className="table-shape table-shape-gold" style={shapeStyle} />
              <div className="table-label">
                <TableNumber number={table.number ?? 0} fontSize={fontNumber} />
                <SeatInfo available={table.seatsAvailable} total={table.seatsTotal} fontSize={fontSub} />
              </div>
            {isEditable && (
              <button
                onClick={(e) => { e.stopPropagation(); onTableDelete && onTableDelete(table.id); }}
                className="absolute -top-2 -right-2 bg-[#141414] text-[#C6A75E] border border-[#2A2A2A] hover:border-[#C6A75E] hover:bg-[#1A1A1A] rounded-full w-6 h-6 flex items-center justify-center text-xs transition"
                aria-label={`${UI_TEXT.common.delete} ${UI_TEXT.tables.table} ${table.number}`}
              >
                ×
              </button>
            )}
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
    </div>
  );
};

export default SeatMap;