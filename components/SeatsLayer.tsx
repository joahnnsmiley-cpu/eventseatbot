import React from 'react';

interface SeatsLayerProps {
  seatsTotal: number;
  /** When provided, first (seatsTotal - seatsAvailable) seats render as sold and are not clickable. */
  seatsAvailable?: number;
  tableShape: 'circle' | 'rect';
  /** Used to compute table size when tableSizePx not provided: 24 + sizePercent * 4 */
  sizePercent?: number;
  /** Override table size in px (e.g. SeatPicker uses 200). */
  tableSizePx?: number;
  /** Seat radius in px (e.g. 12 for SeatPicker 24px seats). Larger = more margin from table edge for circle. */
  seatRadiusPx?: number;
  /** Padding from table edge for circle layout. */
  paddingPx?: number;
  selectedIndices?: Set<number>;
  /** Occupied seat indices (from backend) — disabled, get seat--occupied class. */
  occupiedIndices?: Set<number>;
  onSeatClick?: (index: number) => void;
  /** When true, all seats render as sold/occupied and are not clickable. */
  allSeatsDisabled?: boolean;
}

/** Renders seat grid for SeatPicker. */
const SeatsLayer: React.FC<SeatsLayerProps> = ({
  seatsTotal,
  selectedIndices,
  occupiedIndices = new Set(),
  onSeatClick,
  allSeatsDisabled = false,
}) => {
  const count = Math.max(0, Number(seatsTotal) || 0);
  const isInteractive = !allSeatsDisabled && typeof onSeatClick === 'function';
  const selectedSet = selectedIndices ?? new Set<number>();

  const baseSeatClass = 'w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ease-out';

  return (
    <div
      className={`grid grid-cols-6 gap-3 ${isInteractive ? 'seats-layer--interactive' : ''}`}
      style={{ pointerEvents: isInteractive ? 'auto' : 'none' }}
    >
      {Array.from({ length: count }, (_, i) => {
        const isOccupied = occupiedIndices.has(i);
        const isDisabled = allSeatsDisabled || isOccupied;
        const isSelected = !isDisabled && selectedSet.has(i);
        const isClickable = isInteractive && !isDisabled;
        const seatClass =
          isSelected
            ? `${baseSeatClass} bg-[#FFC107] text-black shadow-[0_0_15px_rgba(255,193,7,0.6)] scale-105`
            : isOccupied || allSeatsDisabled
              ? `${baseSeatClass} bg-[#111] text-gray-500 opacity-40 cursor-not-allowed`
              : `${baseSeatClass} bg-[#1a1a1a] border border-white/10 text-white hover:border-[#FFC107] hover:scale-105`;
        return (
          <div
            key={i}
            className={seatClass}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            aria-pressed={isClickable ? isSelected : undefined}
            onClick={
              isClickable
                ? (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onSeatClick!(i);
                  }
                : undefined
            }
            onKeyDown={
              isClickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onSeatClick!(i);
                    }
                  }
                : undefined
            }
          >
            {i + 1}
          </div>
        );
      })}
    </div>
  );
};

export default SeatsLayer;
