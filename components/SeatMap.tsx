import React, { useState, useEffect } from 'react';
import { EventData, Table, Seat } from '../types';

interface SeatMapProps {
  event: EventData;
  isEditable?: boolean; // For Admin
  onSeatSelect?: (seatId: string, tableId: string, price: number) => void;
  selectedSeats?: string[]; // Array of "tableId-seatId"
  onTableAdd?: (x: number, y: number) => void;
  onTableDelete?: (tableId: string) => void;
}

const SeatMap: React.FC<SeatMapProps> = ({ 
  event, 
  isEditable = false, 
  onSeatSelect, 
  selectedSeats = [],
  onTableAdd,
  onTableDelete
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

          {/* Tables */}
          {event.tables.map((table) => (
            <div
              key={table.id}
              className="table-node absolute flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${table.x}%`, top: `${table.y}%` }}
            >
              {/* Table Shape */}
              <div className="relative w-24 h-24 bg-white/90 rounded-full shadow-lg border-2 border-gray-400 flex items-center justify-center group">
                <span className="font-bold text-gray-800 text-sm">{table.label}</span>
                
                {isEditable && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onTableDelete && onTableDelete(table.id); }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>

              {/* Seats around the table */}
              {table.seats.map((seat, index) => {
                const totalSeats = table.seats.length;
                const angle = (index / totalSeats) * 2 * Math.PI;
                const radius = 60; // Distance from center of table
                const seatX = Math.cos(angle) * radius;
                const seatY = Math.sin(angle) * radius;

                const uniqueId = `${table.id}-${seat.id}`;
                const isSelected = selectedSeats.includes(uniqueId);
                
                let seatColor = 'bg-green-500 hover:bg-green-600'; // Free
                if (seat.status === 'sold') seatColor = 'bg-red-500 cursor-not-allowed';
                if (seat.status === 'locked') seatColor = 'bg-yellow-500 cursor-not-allowed';
                if (isSelected) seatColor = 'bg-blue-500 ring-2 ring-blue-300';

                return (
                  <button
                    key={seat.id}
                    disabled={!isEditable && (seat.status === 'sold' || seat.status === 'locked')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isEditable && onSeatSelect) onSeatSelect(seat.id, table.id, seat.price);
                    }}
                    className={`absolute w-8 h-8 rounded-full shadow-md text-white text-xs font-bold flex items-center justify-center transition-all transform ${seatColor}`}
                    style={{
                      transform: `translate(${seatX}px, ${seatY}px)`
                    }}
                    title={`Seat ${seat.number} - ${seat.price}₽`}
                  >
                    {seat.number}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SeatMap;