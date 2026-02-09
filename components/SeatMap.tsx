import React, { useEffect } from 'react';
import { EventData } from '../types';

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

interface SeatMapProps {
  event: EventData;
  isEditable?: boolean; // For Admin
  seatState?: SeatSelectionState;
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
  onTableSelect
}) => {
  const selectedSeats = seatState?.selectedSeats ?? [];
  const tables = seatState?.tables ?? event.tables;
  const seats = seatState?.seats ?? [];
  const selectedSet = new Set(selectedSeats);
  const backgroundUrl = (event.layoutImageUrl || '').trim();

  useEffect(() => {
    console.log('[SEATING VIEW] layoutImageUrl =', event.layoutImageUrl);
  }, [event.layoutImageUrl]);

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
    if ((e.target as HTMLElement).closest('.table-node')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onTableAdd(x, y);
  };

  return (
    <div className="relative w-full overflow-hidden bg-gray-100 rounded-lg border border-gray-300">
      <div
        className="w-full h-full relative"
        style={{
          cursor: isEditable ? 'crosshair' : 'default',
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: 'contain',
        }}
        onClick={handleMapClick}
      >
        {!backgroundUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
            {console.log('[SEATING VIEW] No layout image because layoutImageUrl is empty/undefined')}
            No layout image
          </div>
        )}

        {/* Tables */}
        {tables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
            No tables yet. Please check back later.
          </div>
        )}
        {tables.map((table) => {
          const x = typeof table.x === 'number' ? table.x : table.centerX;
          const y = typeof table.y === 'number' ? table.y : table.centerY;
          const isSoldOut = !isEditable && table.seatsAvailable === 0;
          const sizePercent = Number((table as any).sizePercent) || 5;
          const isRect = (table as any).shape === 'rect';
          const bg = (table as any).color || '#3b82f6';
          return (
            <div
              key={table.id}
              className={`table-wrapper ${isRect ? 'rect' : 'circle'} ${isSoldOut ? 'opacity-60' : ''}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                ['--size' as any]: Number((table as any).sizePercent) || 5,
              }}
            >
              <div className="table-shape" style={{ backgroundColor: bg }} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTableSelect) onTableSelect(table.id);
                }}
                disabled={isSoldOut}
                className={`table-label ${isSoldOut ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                aria-label={`Table ${table.number}, free ${table.seatsAvailable}`}
              >
                <div className="font-semibold">Table {table.number}</div>
                <div className="text-[10px] text-white/90">Free {table.seatsAvailable}</div>
              </button>
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
      </div>

      {!isEditable && seats.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-white/95 border-t border-gray-200 p-3">
          <div className="text-xs text-gray-600 mb-2">Места</div>
          <div className="flex flex-wrap gap-2">
            {seats.map((seat) => {
              const key = `${seat.tableId}-${seat.id}`;
              const isSelected = selectedSet.has(key);
              const isDisabled = seat.status !== 'available';
              const baseClass = 'w-10 h-10 rounded-md text-xs font-semibold flex items-center justify-center';
              const statusClass = isSelected
                ? 'bg-blue-600 text-white'
                : seat.status === 'available'
                  ? 'bg-green-500 text-white'
                  : seat.status === 'reserved'
                    ? 'bg-yellow-400 text-gray-900'
                    : 'bg-red-500 text-white';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSeat(seat)}
                  disabled={isDisabled && !isSelected}
                  className={`${baseClass} ${statusClass} ${isDisabled && !isSelected ? 'opacity-60 cursor-not-allowed' : 'active:scale-95'}`}
                  aria-pressed={isSelected}
                  aria-disabled={isDisabled && !isSelected}
                  title={`${seat.tableId} • ${seat.number}`}
                >
                  {seat.number}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-600">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-sm inline-block" />доступно</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400 rounded-sm inline-block" />зарезервировано</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-sm inline-block" />продано</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-600 rounded-sm inline-block" />выбрано</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeatMap;