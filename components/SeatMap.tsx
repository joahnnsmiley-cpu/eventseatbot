import React, { useState, useEffect } from 'react';
import { EventData } from '../types';

interface SeatMapProps {
  event: EventData;
  isEditable?: boolean; // For Admin
  onSeatSelect?: (seatId: string, tableId: string, price: number) => void;
  selectedSeats?: string[]; // Array of "tableId-seatId"
  onTableAdd?: (x: number, y: number) => void;
  onTableDelete?: (tableId: string) => void;
  onTableClick?: (tableId: string) => void;
}

const SeatMap: React.FC<SeatMapProps> = ({ 
  event, 
  isEditable = false, 
  onSeatSelect, 
  selectedSeats = [],
  onTableAdd,
  onTableDelete,
  onTableClick
}) => {
  const [scale, setScale] = useState(1);

  // Simple zoom handling
  const handleZoom = (delta: number) => {
    setScale(prev => Math.min(Math.max(prev + delta, 0.5), 3));
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditable || !onTableAdd) return;
    // Don't trigger if clicking on a table
    if ((e.target as HTMLElement).closest('.table-node')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onTableAdd(x, y);
  };

  return (
    <div className="relative w-full overflow-hidden bg-gray-100 rounded-lg h-[60vh] border border-gray-300">
      
      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-2">
        <button onClick={() => handleZoom(0.2)} className="bg-white p-2 rounded-full shadow text-gray-700 hover:bg-gray-50"><i className="fas fa-plus"></i></button>
        <button onClick={() => handleZoom(-0.2)} className="bg-white p-2 rounded-full shadow text-gray-700 hover:bg-gray-50"><i className="fas fa-minus"></i></button>
      </div>

      <div 
        className="w-full h-full overflow-auto relative touch-auto"
        style={{ cursor: isEditable ? 'crosshair' : 'default' }}
      >
        <div 
          className="relative origin-top-left transition-transform duration-200 ease-out"
          style={{ 
            width: '1000px', // Fixed base width for calculation consistency
            height: '750px', 
            transform: `scale(${scale})` 
          }}
          onClick={handleMapClick}
        >
          {/* Floor Plan Image */}
          <img 
            src={event.imageUrl} 
            alt="Floor Plan" 
            className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none"
          />

          {/* Tables (new model) */}
          {event.tables.map((table) => (
            <div
              key={table.id}
              className={`table-node absolute flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 ${!isEditable && table.seatsAvailable === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ left: `${table.centerX}%`, top: `${table.centerY}%` }}
              onClick={(e) => { e.stopPropagation(); if (!isEditable && onTableClick) onTableClick(table.id); }}
            >
              <div className="relative w-24 h-24 bg-white/90 rounded-full shadow-lg border-2 border-gray-400 flex items-center justify-center group">
                <div className="text-center">
                  <div className="font-bold text-gray-800 text-sm">{table.number}</div>
                  <div className="text-xs text-gray-500">{table.seatsAvailable}/{table.seatsTotal}</div>
                </div>
                {isEditable && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onTableDelete && onTableDelete(table.id); }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SeatMap;