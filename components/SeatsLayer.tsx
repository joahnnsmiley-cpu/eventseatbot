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
  /** Dynamic accent color from the selected category. */
  accentColor?: string;
}

/** Renders seat grid for SeatPicker. */
const SeatsLayer: React.FC<SeatsLayerProps> = ({
  seatsTotal,
  selectedIndices,
  occupiedIndices = new Set(),
  onSeatClick,
  allSeatsDisabled = false,
  accentColor,
}) => {
  const count = Math.max(0, Number(seatsTotal) || 0);
  const isInteractive = !allSeatsDisabled && typeof onSeatClick === 'function';
  const selectedSet = selectedIndices ?? new Set<number>();
  const accent = accentColor || '#FFC107';

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

        const seatStyle: React.CSSProperties = isSelected
          ? { backgroundColor: accent, color: '#000', boxShadow: `0 0 15px ${accent}99`, transform: 'scale(1.05)' }
          : isOccupied || allSeatsDisabled
            ? { backgroundColor: '#111', opacity: 0.4, cursor: 'not-allowed' }
            : { backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' };

        const baseSeatClass = 'w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ease-out';
        const hoverClass = (!isSelected && !isDisabled) ? 'hover:scale-105' : '';
        const textClass = (isOccupied || allSeatsDisabled) ? 'text-muted' : isSelected ? '' : 'text-white';

        return (
          <div
            key={i}
            className={`${baseSeatClass} ${hoverClass} ${textClass}`}
            style={{
              ...seatStyle,
              ...((!isSelected && !isDisabled) ? { '--hover-border': accent } as React.CSSProperties : {}),
            }}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            aria-pressed={isClickable ? isSelected : undefined}
            onMouseEnter={(!isSelected && !isDisabled) ? (e) => {
              (e.currentTarget as HTMLElement).style.borderColor = accent;
            } : undefined}
            onMouseLeave={(!isSelected && !isDisabled) ? (e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
            } : undefined}
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
