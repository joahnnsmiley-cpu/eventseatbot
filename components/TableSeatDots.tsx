import React from 'react';

type DotStatus = 'available' | 'sold' | 'selected';

interface TableSeatDotsProps {
  seatsTotal: number;
  seatsAvailable: number;
  selectedIndices?: number[];
  /** Category base color for selected/accent dots */
  accentColor?: string;
  /** For rect tables, use perimeter layout; for circle, use circular layout */
  tableShape?: 'circle' | 'rect';
  /** For rect: width/height ratio. Elongated tables need proportional distribution. */
  widthPercent?: number;
  heightPercent?: number;
}

/** Get (x, y) in 0-100 coords for seat i of count, placed along rectangle perimeter.
 * Uses width/height ratio so elongated tables get more seats on long edges. */
function getRectSeatPosition(
  i: number,
  count: number,
  inset: number,
  w: number,
  h: number
): { x: number; y: number } {
  const inW = 100 - 2 * inset;
  const inH = 100 - 2 * inset;
  const topLen = inW * w;
  const rightLen = inH * h;
  const bottomLen = topLen;
  const leftLen = rightLen;
  const total = 2 * topLen + 2 * rightLen;
  const t = (i / count) * total;

  if (t < topLen) {
    return { x: inset + (t / topLen) * inW, y: inset };
  }
  if (t < topLen + rightLen) {
    return { x: 100 - inset, y: inset + ((t - topLen) / rightLen) * inH };
  }
  if (t < topLen + rightLen + bottomLen) {
    const bt = t - topLen - rightLen;
    return { x: 100 - inset - (bt / bottomLen) * inW, y: 100 - inset };
  }
  const lt = t - topLen - rightLen - bottomLen;
  return { x: inset, y: 100 - inset - (lt / leftLen) * inH };
}

/** Apple-style seat dots. Circle: around center. Rect: along perimeter. */
export const TableSeatDots: React.FC<TableSeatDotsProps> = ({
  seatsTotal,
  seatsAvailable,
  selectedIndices = [],
  accentColor = '#FFC107',
  tableShape = 'circle',
  widthPercent = 10,
  heightPercent = 6,
}) => {
  const count = Math.max(0, Math.min(seatsTotal, 12));
  if (count === 0) return null;

  const soldCount = Math.max(0, seatsTotal - seatsAvailable);
  const selectedSet = new Set(selectedIndices);
  const radius = tableShape === 'rect' ? 28 : 38;

  const getPosition = (i: number): { x: number; y: number } => {
    if (tableShape === 'rect') {
      const w = Math.max(0.5, widthPercent);
      const h = Math.max(0.5, heightPercent);
      return getRectSeatPosition(i, count, 4, w, h);
    }
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: 50 + radius * Math.cos(angle),
      y: 50 + radius * Math.sin(angle),
    };
  };

  return (
    <div className="table-seat-dots" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const isSelected = selectedSet.has(i);
        const isSold = i < soldCount && !isSelected;
        const status: DotStatus = isSelected ? 'selected' : isSold ? 'sold' : 'available';
        const { x, y } = getPosition(i);
        return (
          <div
            key={i}
            className={`table-seat-dot table-seat-dot--${status}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              animationDelay: `${i * 25}ms`,
              ...(status === 'selected' ? { backgroundColor: accentColor } : {}),
            }}
          />
        );
      })}
    </div>
  );
};
