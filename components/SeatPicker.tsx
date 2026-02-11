import React from 'react';
import SeatsLayer from './SeatsLayer';
import type { Table } from '../types';

interface SeatPickerProps {
  table: Table;
  selectedIndices: number[];
  onToggleSeat: (seatIndex: number) => void;
  /** When true, all seats render as occupied and are not selectable (e.g. table not available for sale). */
  tableDisabled?: boolean;
  /** Occupied seat indices (from backend) — these are disabled and get seat--occupied class. */
  occupiedIndices?: Set<number>;
}

/**
 * Renders the selected table only, with large clickable seats.
 * Used inside the table panel; seat selection happens here only.
 */
const SeatPicker: React.FC<SeatPickerProps> = ({
  table,
  selectedIndices,
  onToggleSeat,
  tableDisabled = false,
  occupiedIndices = new Set(),
}) => {
  const count = Math.max(0, Number(table.seatsTotal) || 0);
  const selectedSet = new Set(selectedIndices);

  return (
    <div className="seat-picker">
      <SeatsLayer
        seatsTotal={count}
        seatsAvailable={table.seatsAvailable}
        tableShape={isRect ? 'rect' : 'circle'}
        tableSizePx={200}
        seatRadiusPx={12}
        paddingPx={12}
        selectedIndices={selectedSet}
        occupiedIndices={occupiedIndices}
        onSeatClick={tableDisabled ? undefined : onToggleSeat}
        allSeatsDisabled={tableDisabled}
      />
    </div>
  );
};

export default SeatPicker;
