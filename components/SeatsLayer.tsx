import React, { useMemo } from 'react';

const DEFAULT_SEAT_RADIUS_PX = 4;
const DEFAULT_PADDING_PX = 4;

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

function getSeatPositions(
  count: number,
  shape: 'circle' | 'rect',
  tableSizePx: number,
  seatRadiusPx: number,
  paddingPx: number
): { x: number; y: number }[] {
  if (count <= 0) return [];
  const positions: { x: number; y: number }[] = [];
  const centerX = tableSizePx / 2;
  const centerY = tableSizePx / 2;

  if (shape === 'circle') {
    const radius = Math.max(0, centerX - seatRadiusPx - paddingPx);
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI / count) * i - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      positions.push({ x, y });
    }
    return positions;
  }

  // rect: internal grid layout (e.g. 2x2, 3x2, 4x2)
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = tableSizePx / cols;
  const cellH = tableSizePx / rows;
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col + 0.5) * cellW;
    const y = (row + 0.5) * cellH;
    positions.push({ x, y });
  }
  return positions;
}

/** Renders seat dots inside table-shape. Circle = radial; rect = internal grid. Used only in SeatPicker. */
const SeatsLayer: React.FC<SeatsLayerProps> = ({
  seatsTotal,
  seatsAvailable,
  tableShape,
  sizePercent = 5,
  tableSizePx,
  seatRadiusPx = DEFAULT_SEAT_RADIUS_PX,
  paddingPx = DEFAULT_PADDING_PX,
  selectedIndices,
  occupiedIndices = new Set(),
  onSeatClick,
  allSeatsDisabled = false,
}) => {
  const count = Math.max(0, Number(seatsTotal) || 0);
  const soldCount = Math.max(0, count - (seatsAvailable ?? count));
  const isInteractive = !allSeatsDisabled && typeof onSeatClick === 'function';
  const selectedSet = selectedIndices ?? new Set<number>();

  const sizePx = tableSizePx ?? 24 + (Number(sizePercent) || 5) * 4;
  const positions = useMemo(
    () => getSeatPositions(count, tableShape, sizePx, seatRadiusPx, paddingPx),
    [count, tableShape, sizePx, seatRadiusPx, paddingPx]
  );

  return (
    <div
      className={`seats-layer ${isInteractive ? 'seats-layer--interactive' : ''}`}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: isInteractive ? 'auto' : 'none',
      }}
    >
      {positions.map((pos, i) => {
        const isOccupied = occupiedIndices.has(i);
        const isSold = allSeatsDisabled || i < soldCount;
        const isDisabled = isSold || isOccupied;
        const isSelected = !isDisabled && selectedSet.has(i);
        const isClickable = isInteractive && !isDisabled;
        return (
          <div
            key={i}
            className={`seat ${isSelected ? 'seat--selected' : ''} ${isSold ? 'seat--sold' : ''} ${isOccupied ? 'seat--occupied' : ''}`}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
              cursor: isDisabled ? 'not-allowed' : undefined,
            }}
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
          />
        );
      })}
    </div>
  );
};

export default SeatsLayer;
