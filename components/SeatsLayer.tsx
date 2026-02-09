import React from 'react';

interface SeatsLayerProps {
  seatsTotal: number;
  /** When provided, seats are clickable and show selected state (user view). Omit for admin (visual only). */
  selectedIndices?: Set<number>;
  onSeatClick?: (index: number) => void;
}

/** Renders seat dots inside table-shape. Optional selection (user only). */
const SeatsLayer: React.FC<SeatsLayerProps> = ({ seatsTotal, selectedIndices, onSeatClick }) => {
  const count = Math.max(0, Number(seatsTotal) || 0);
  const isInteractive = typeof onSeatClick === 'function';
  const selectedSet = selectedIndices ?? new Set<number>();

  return (
    <div
      className={`seats-layer ${isInteractive ? 'seats-layer--interactive' : ''}`}
      style={{ pointerEvents: isInteractive ? 'auto' : 'none' }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const isSelected = selectedSet.has(i);
        return (
          <div
            key={i}
            className={`seat ${isSelected ? 'seat--selected' : ''}`}
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
