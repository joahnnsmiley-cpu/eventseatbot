import React from 'react';

interface SeatsLayerProps {
  seatsTotal: number;
}

/** Renders seat dots inside table-shape. Visual only, no interaction. */
const SeatsLayer: React.FC<SeatsLayerProps> = ({ seatsTotal }) => {
  const count = Math.max(0, Number(seatsTotal) || 0);
  return (
    <div className="seats-layer">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="seat" aria-hidden="true" />
      ))}
    </div>
  );
};

export default SeatsLayer;
