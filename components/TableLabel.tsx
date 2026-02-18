import React from 'react';

export const TableNumber: React.FC<{ number: number; fontSize?: string }> = ({ number, fontSize }) => (
  <div className="table-number" style={fontSize ? { fontSize } : undefined}>{number}</div>
);
