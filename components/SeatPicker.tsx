import React, { useState } from 'react';
import { motion } from 'framer-motion';
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
  /** Dynamic accent color from the selected category. */
  accentColor?: string;
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
  accentColor,
}) => {
  const count = Math.max(0, Number(table.seatsTotal) || 0);
  const selectedSet = new Set(selectedIndices);
  const isRect = (table.shape ?? 'circle') === 'rect';
  const [lastAddedSeat, setLastAddedSeat] = useState<{ seatIndex: number; timestamp: number } | null>(null);

  const handleSeatClick = (seatIndex: number) => {
    const wasSelected = selectedSet.has(seatIndex);
    if (!wasSelected && window?.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
    onToggleSeat(seatIndex);
    if (!wasSelected) {
      setLastAddedSeat({ seatIndex, timestamp: Date.now() });
    }
  };

  return (
    <div className="seat-picker relative">
      <SeatsLayer
        seatsTotal={count}
        seatsAvailable={table.seatsAvailable}
        tableShape={isRect ? 'rect' : 'circle'}
        tableSizePx={200}
        seatRadiusPx={12}
        paddingPx={12}
        selectedIndices={selectedSet}
        occupiedIndices={occupiedIndices}
        onSeatClick={tableDisabled ? undefined : handleSeatClick}
        allSeatsDisabled={tableDisabled}
        accentColor={accentColor}
      />
      {lastAddedSeat && (
        <motion.div
          key={lastAddedSeat.timestamp}
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none font-bold text-sm"
          style={{ color: accentColor || '#FFC107' }}
        >
          +1
        </motion.div>
      )}
    </div>
  );
};

export default SeatPicker;
