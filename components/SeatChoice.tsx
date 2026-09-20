import React from 'react';
import type { Table } from '../types';

interface SeatChoiceProps {
  table: Table;
  selectedIndices: number[];
  onToggleSeat: (seatIndex: number) => void;
  /** All seats render as taken and nothing is selectable (table closed for sale). */
  tableDisabled?: boolean;
  occupiedIndices?: Set<number>;
  accentColor?: string;
}

/**
 * Seats as a row of numbered buttons, 48px each.
 *
 * They used to be 24px dots arranged around a drawing of the table — pretty,
 * but a thumb could not hit them, and a second control ("количество мест") sat
 * underneath doing the same job. One control, one tap each.
 */
const SeatChoice: React.FC<SeatChoiceProps> = ({
  table,
  selectedIndices,
  onToggleSeat,
  tableDisabled = false,
  occupiedIndices = new Set(),
  accentColor = '#C6A75E',
}) => {
  const count = Math.max(0, Number(table.seatsTotal) || 0);
  const selected = new Set(selectedIndices);

  const press = (index: number) => {
    if (tableDisabled || occupiedIndices.has(index)) return;
    if (!selected.has(index)) {
      try { window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch { /* not in Telegram */ }
    }
    onToggleSeat(index);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        {Array.from({ length: count }, (_, i) => {
          const taken = tableDisabled || occupiedIndices.has(i);
          const isSelected = selected.has(i);
          const label = `Место ${i + 1}${taken ? ', занято' : isSelected ? ', выбрано' : ''}`;
          return (
            <button
              key={i}
              type="button"
              onClick={() => press(i)}
              disabled={taken}
              aria-label={label}
              aria-pressed={isSelected}
              className="w-12 h-12 rounded-2xl text-base transition-colors disabled:cursor-not-allowed"
              style={
                taken
                  ? { background: 'transparent', border: '1px solid #2B2723', color: '#8C8477', textDecoration: 'line-through' }
                  : isSelected
                    ? { background: accentColor, border: `1px solid ${accentColor}`, color: '#16130D', fontWeight: 700 }
                    : { background: '#1F1C19', border: '1px solid #2B2723', color: '#F3EEE6' }
              }
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="flex gap-4 text-[11.5px] text-[#8C8477]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: accentColor }} />
          выбрано
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: '#1F1C19', border: '1px solid #2B2723' }} />
          свободно
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-[#2B2723]" />
          занято
        </span>
      </div>
    </div>
  );
};

export default SeatChoice;
