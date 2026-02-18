import React from 'react';

type DotStatus = 'available' | 'sold' | 'selected';

interface TableSeatDotsProps {
  seatsTotal: number;
  seatsAvailable: number;
  selectedIndices?: number[];
  /** Category base color for selected/accent dots */
  accentColor?: string;
}

/** Apple-style seat dots arranged in a circle around the table center. */
export const TableSeatDots: React.FC<TableSeatDotsProps> = ({
  seatsTotal,
  seatsAvailable,
  selectedIndices = [],
  accentColor = '#FFC107',
}) => {
  const count = Math.max(0, Math.min(seatsTotal, 12));
  if (count === 0) return null;

  const soldCount = Math.max(0, seatsTotal - seatsAvailable);
  const selectedSet = new Set(selectedIndices);

  return (
    <div className="table-seat-dots" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const isSelected = selectedSet.has(i);
        const isSold = i < soldCount && !isSelected;
        const status: DotStatus = isSelected ? 'selected' : isSold ? 'sold' : 'available';
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        const x = 50 + 38 * Math.cos(angle);
        const y = 50 + 38 * Math.sin(angle);
        return (
          <div
            key={i}
            className={`table-seat-dot table-seat-dot--${status}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              ...(status === 'selected' ? { backgroundColor: accentColor } : {}),
            }}
          />
        );
      })}
    </div>
  );
};
