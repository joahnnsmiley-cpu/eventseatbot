import React, { useMemo } from 'react';

const SEAT_RADIUS_PX = 4;
const PADDING_PX = 4;

interface SeatsLayerProps {
  seatsTotal: number;
  tableShape: 'circle' | 'rect';
  /** Used to compute table size when tableSizePx not provided: 24 + sizePercent * 4 */
  sizePercent?: number;
  /** Override table size in px (e.g. SeatPicker uses 200). */
  tableSizePx?: number;
  selectedIndices?: Set<number>;
  onSeatClick?: (index: number) => void;
}

function getSeatPositions(
  count: number,
  shape: 'circle' | 'rect',
  tableSizePx: number
): { x: number; y: number }[] {
  if (count <= 0) return [];
  const positions: { x: number; y: number }[] = [];
  const centerX = tableSizePx / 2;
  const centerY = tableSizePx / 2;

  if (shape === 'circle') {
    const radius = Math.max(0, centerX - SEAT_RADIUS_PX - PADDING_PX);
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI / count) * i - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      positions.push({ x, y });
    }
    return positions;
  }

  // rect: perimeter layout
  const w = tableSizePx;
  const h = tableSizePx;
  const perimeter = 2 * (w + h);
  const step = perimeter / count;
  for (let i = 0; i < count; i++) {
    const d = i * step;
    let x: number;
    let y: number;
    if (d < w) {
      x = d;
      y = 0;
    } else if (d < w + h) {
      x = w;
      y = d - w;
    } else if (d < 2 * w + h) {
      x = 2 * w + h - d;
      y = h;
    } else {
      x = 0;
      y = 2 * (w + h) - d;
    }
    positions.push({ x, y });
  }
  return positions;
}

/** Renders seat dots inside table-shape. Radial (circle) or perimeter (rect) layout. */
const SeatsLayer: React.FC<SeatsLayerProps> = ({
  seatsTotal,
  tableShape,
  sizePercent = 5,
  tableSizePx,
  selectedIndices,
  onSeatClick,
}) => {
  const count = Math.max(0, Number(seatsTotal) || 0);
  const isInteractive = typeof onSeatClick === 'function';
  const selectedSet = selectedIndices ?? new Set<number>();

  const sizePx = tableSizePx ?? 24 + (Number(sizePercent) || 5) * 4;
  const positions = useMemo(
    () => getSeatPositions(count, tableShape, sizePx),
    [count, tableShape, sizePx]
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
        const isSelected = selectedSet.has(i);
        return (
          <div
            key={i}
            className={`seat ${isSelected ? 'seat--selected' : ''}`}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
            }}
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            aria-pressed={isInteractive ? isSelected : undefined}
            onClick={
              isInteractive
                ? (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onSeatClick!(i);
                  }
                : undefined
            }
            onKeyDown={
              isInteractive
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
