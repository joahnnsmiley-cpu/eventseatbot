import React from 'react';

export const TableNumber: React.FC<{ number: number; fontSize?: string }> = ({ number, fontSize }) => (
  <div className="table-number" style={fontSize ? { fontSize } : undefined}>{number}</div>
);

export const SeatInfo: React.FC<{ available: number; total: number; fontSize?: string }> = ({ available, total, fontSize }) => (
  <div className="table-seats" style={fontSize ? { fontSize } : undefined}>({available}/{total})</div>
);
