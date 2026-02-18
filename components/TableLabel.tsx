import React from 'react';

export const TableNumber: React.FC<{ number: number; fontSize?: string }> = ({ number, fontSize }) => (
  <div className="table-number" style={fontSize ? { fontSize } : undefined}>{number}</div>
);

export const SeatsDots: React.FC<{ total: number; available: number }> = ({ total, available }) => (
  <div className="seats-dots">
    {Array.from({ length: total }).map((_, i) => (
      <span
        key={i}
        className={i < available ? 'dot active' : 'dot inactive'}
      />
    ))}
  </div>
);
