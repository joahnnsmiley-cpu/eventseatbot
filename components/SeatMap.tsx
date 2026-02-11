import React, { useEffect, useState } from 'react';
import { EventData } from '../types';
import { UI_TEXT } from '../constants/uiText';

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
  isEditable?: boolean; // For Admin
  seatState?: SeatSelectionState;
  selectedSeatsByTable?: Record<string, number[]>;
  onSeatToggle?: (seat: SeatModel) => void;
  onSelectedSeatsChange?: (selectedSeats: string[]) => void;
  onTableAdd?: (x: number, y: number) => void;
  onTableDelete?: (tableId: string) => void;
  onTableSelect?: (tableId: string) => void;
}

const SeatMap: React.FC<SeatMapProps> = ({ 
  event, 
  isEditable = false, 
  seatState,
  onSeatToggle,
  onSelectedSeatsChange,
  onTableAdd,
  onTableDelete,
  onTableSelect,
  selectedSeatsByTable,
}) => {
  const selectedSeats = seatState?.selectedSeats ?? [];
  // Рассадка: event.tables (backend event_tables); при отсутствии seatState берём event.tables
  const rawTables = Array.isArray(seatState?.tables)
    ? seatState.tables
    : Array.isArray(event?.tables)
      ? event.tables
      : [];
  const tables = rawTables.filter((t: { is_active?: boolean }) => t.is_active !== false);
  const seats = seatState?.seats ?? [];
  const selectedSet = new Set(selectedSeats);
  // Подложка зала — только event.layoutImageUrl (не imageUrl)
  const backgroundUrl = (event?.layoutImageUrl ?? '').trim();
  const [layoutAspectRatio, setLayoutAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!backgroundUrl) {
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
    img.src = backgroundUrl;
  }, [backgroundUrl]);

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
      className="relative w-full overflow-hidden bg-gray-100 rounded-lg border border-gray-300"
      style={{
        width: '100%',
        aspectRatio: layoutAspectRatio ?? 16 / 9,
        minHeight: layoutAspectRatio == null ? 300 : undefined,
      }}
    >
      {/* Pure coordinate container: same aspect ratio as admin so coordinates match 1:1. */}
      <div
        style={{
          position: 'absolute',
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
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'top left',
          backgroundSize: '100% 100%',
        }}
        onClick={handleMapClick}
      >
      {!backgroundUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 pointer-events-none">
          {UI_TEXT.seatMap.noLayoutImage}
        </div>
      )}

      {tables.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 pointer-events-none">
          {UI_TEXT.seatMap.noTablesYet}
        </div>
      )}
      {tables.map((table) => {
        const x = typeof table.x === 'number' ? table.x : table.centerX;
        const y = typeof table.y === 'number' ? table.y : table.centerY;
        const isAvailableForSale = (table as any).isAvailable === true;
        const isSoldOut = !isEditable && table.seatsAvailable === 0;
        const isTableDisabled = !isEditable && (!isAvailableForSale || isSoldOut);
        const isRect = (table as any).shape === 'rect';
        const bg = (table as any).color || '#3b82f6';
        return (
          <div
            key={table.id}
            className={`table-wrapper ${isRect ? 'rect' : 'circle'} ${isTableDisabled ? 'opacity-60' : ''}`}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              ['--size' as string]: Number((table as any).sizePercent) || 5,
              cursor: isTableDisabled ? 'not-allowed' : 'pointer',
            }}
            onClick={(e) => {
                if (isTableDisabled) return;
                e.stopPropagation();
                if (onTableSelect) onTableSelect(table.id);
              }}
            aria-label={`${UI_TEXT.seatMap.tableFree.replace('{number}', String(table.number)).replace('{free}', String(table.seatsAvailable))}${!isAvailableForSale ? UI_TEXT.seatMap.notAvailableForSale : ''}`}
          >
              <div
                className={`table-shape ${isRect ? 'rect' : 'circle'}`}
                style={{ backgroundColor: bg }}
              />
              <div className="table-label">
                <div className="font-semibold">{UI_TEXT.tables.table} {table.number}</div>
                <div className="text-[10px] text-white/90">{table.seatsAvailable} / {table.seatsTotal}</div>
              </div>
            {isEditable && (
              <button
                onClick={(e) => { e.stopPropagation(); onTableDelete && onTableDelete(table.id); }}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {!isEditable && seats.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-[#0B0B0B] border-t border-white/10 p-4">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">{UI_TEXT.seatMap.seats}</div>
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
                  : 'bg-[#111] text-gray-500 opacity-40 cursor-not-allowed';

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
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#1a1a1a] border border-white/10 inline-block" />{UI_TEXT.seatMap.available}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#FFC107] inline-block" />{UI_TEXT.seatMap.selected}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#111] opacity-40 inline-block" />{UI_TEXT.seatMap.sold}</span>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default SeatMap;