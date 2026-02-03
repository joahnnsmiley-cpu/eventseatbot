import React, { useState, useEffect } from 'react';
import { EventData, Booking, Table, Seat } from '../types';
import * as StorageService from '../services/storageService';
import * as GeminiService from '../services/geminiService';
import SeatMap from './SeatMap';

interface AdminPanelProps {
  onBack: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [mode, setMode] = useState<'list' | 'create' | 'bookings'>('list');
  const [events, setEvents] = useState<EventData[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  
  // Creation State
  const [newEvent, setNewEvent] = useState<Partial<EventData>>({
    title: '',
    description: '',
    imageUrl: 'https://picsum.photos/1000/750', // Default placeholder
    tables: [],
    paymentPhone: '79990000000',
    maxSeatsPerBooking: 4
  });
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Table Editing State (for current newEvent)
  const [tableConfig, setTableConfig] = useState({ seats: 4, price: 1000, label: 'Table' });

  useEffect(() => {
    const load = async () => {
      try {
        const evts = await StorageService.getEvents();
        setEvents(evts);
        const bks = await StorageService.getAdminBookings();
        setBookings(bks);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  const handleCreateEvent = () => {
    // TODO: реализовать создание события через backend /admin/events при необходимости
    alert('Создание новых событий через UI пока не реализовано в backend.');
  };

  const handleGenerateDescription = async () => {
    setIsGeneratingAI(true);
    const desc = await GeminiService.generateEventDescription(
      newEvent.title || "Event", 
      newEvent.tables?.length || 0
    );
    setNewEvent(prev => ({ ...prev, description: desc }));
    setIsGeneratingAI(false);
  };

  const addTable = (x: number, y: number) => {
    const tableId = `t-${Date.now()}`;
    const seats: Seat[] = [];
    for (let i = 1; i <= tableConfig.seats; i++) {
      seats.push({
        id: `s-${Date.now()}-${i}`,
        number: i,
        status: 'free',
        price: tableConfig.price
      });
    }

    const newTable: Table = {
      id: tableId,
      x,
      y,
      label: `${tableConfig.label} ${newEvent.tables ? newEvent.tables.length + 1 : 1}`,
      seats
    };

    setNewEvent(prev => ({
      ...prev,
      tables: [...(prev.tables || []), newTable]
    }));
  };

  const removeTable = (tableId: string) => {
    setNewEvent(prev => ({
      ...prev,
      tables: (prev.tables || []).filter(t => t.id !== tableId)
    }));
  };

  const handleConfirmBooking = async (bookingId: string) => {
    try {
      await StorageService.confirmBooking(bookingId);
      const refreshed = await StorageService.getAdminBookings();
      setBookings(refreshed);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (mode === 'create') {
    return (
      <div className="p-4 bg-white min-h-screen">
        <h2 className="text-xl font-bold mb-4">Create New Event</h2>
        
        <div className="space-y-4 mb-6">
          <input 
            type="text" 
            placeholder="Event Name" 
            className="w-full p-2 border rounded"
            value={newEvent.title}
            onChange={e => setNewEvent({...newEvent, title: e.target.value})}
          />
          
          <div className="flex gap-2">
            <textarea 
              placeholder="Description" 
              className="w-full p-2 border rounded"
              value={newEvent.description}
              onChange={e => setNewEvent({...newEvent, description: e.target.value})}
            />
            <button 
              onClick={handleGenerateDescription}
              disabled={isGeneratingAI}
              className="bg-purple-600 text-white px-3 rounded text-sm disabled:opacity-50"
            >
              {isGeneratingAI ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-magic"></i> AI</>}
            </button>
          </div>

          <input 
            type="text" 
            placeholder="Payment Phone (SBP)" 
            className="w-full p-2 border rounded"
            value={newEvent.paymentPhone}
            onChange={e => setNewEvent({...newEvent, paymentPhone: e.target.value})}
          />
          
          <input 
            type="text" 
            placeholder="Floor Plan Image URL" 
            className="w-full p-2 border rounded"
            value={newEvent.imageUrl}
            onChange={e => setNewEvent({...newEvent, imageUrl: e.target.value})}
          />
        </div>

        <div className="border-t pt-4">
          <h3 className="font-semibold mb-2">Map Editor</h3>
          <p className="text-sm text-gray-500 mb-2">Tap on the map to place a table.</p>
          
          <div className="flex gap-2 mb-4 text-sm overflow-x-auto pb-2">
            <label className="flex items-center gap-1 whitespace-nowrap">
              Seats:
              <input type="number" value={tableConfig.seats} onChange={e => setTableConfig({...tableConfig, seats: parseInt(e.target.value)})} className="w-12 border rounded p-1" />
            </label>
            <label className="flex items-center gap-1 whitespace-nowrap">
              Price:
              <input type="number" value={tableConfig.price} onChange={e => setTableConfig({...tableConfig, price: parseInt(e.target.value)})} className="w-20 border rounded p-1" />
            </label>
          </div>

          <SeatMap 
            event={newEvent as EventData} 
            isEditable={true} 
            onTableAdd={addTable}
            onTableDelete={removeTable}
          />
        </div>

        <div className="flex gap-4 mt-6 pb-20">
          <button onClick={() => setMode('list')} className="flex-1 py-3 bg-gray-200 rounded-lg font-medium">Cancel</button>
          <button onClick={handleCreateEvent} className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium">Publish Event</button>
        </div>
      </div>
    );
  }

  if (mode === 'bookings') {
    return (
      <div className="p-4 bg-white min-h-screen pb-24">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Booking Requests</h2>
          <button onClick={() => setMode('list')} className="text-blue-600">Back</button>
        </div>

        <div className="space-y-4">
          {bookings.slice().reverse().map(booking => (
            <div key={booking.id} className={`border p-4 rounded-lg shadow-sm ${booking.status === 'paid' ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
              <div className="flex justify-between mb-2">
                <span className="font-bold">@{booking.username}</span>
                <span className={`text-sm px-2 py-0.5 rounded ${booking.status === 'paid' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                  {booking.status.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-600">Booking ID: <span className="font-mono">{booking.id}</span></p>
              <p className="text-sm text-gray-600">Seats: {booking.seatIds.length} | Total: {booking.totalAmount}₽</p>
              
              {booking.status === 'pending' && (
                <button 
                  onClick={() => handleConfirmBooking(booking.id)}
                  className="mt-3 w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700"
                >
                  Confirm Payment
                </button>
              )}
            </div>
          ))}
          {bookings.length === 0 && <p className="text-center text-gray-500 mt-10">No bookings yet.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <button onClick={onBack} className="text-sm text-gray-500 underline">Exit Admin</button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <button onClick={() => setMode('create')} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center gap-2 hover:bg-gray-50">
          <i className="fas fa-plus-circle text-3xl text-blue-500"></i>
          <span className="font-medium">New Event</span>
        </button>
        <button onClick={() => setMode('bookings')} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center gap-2 hover:bg-gray-50 relative">
          <i className="fas fa-ticket-alt text-3xl text-green-500"></i>
          <span className="font-medium">Bookings</span>
          {bookings.filter(b => b.status === 'pending').length > 0 && (
            <span className="absolute top-2 right-2 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
              {bookings.filter(b => b.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      <h3 className="font-bold text-lg mb-3">Active Events</h3>
      <div className="space-y-3">
        {events.map(evt => (
          <div key={evt.id} className="bg-white p-4 rounded-lg shadow-sm border flex gap-4">
            <img src={evt.imageUrl} className="w-16 h-16 object-cover rounded bg-gray-200" alt="" />
            <div>
              <h4 className="font-bold">{evt.title}</h4>
              <p className="text-xs text-gray-500">{evt.tables.length} tables</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPanel;