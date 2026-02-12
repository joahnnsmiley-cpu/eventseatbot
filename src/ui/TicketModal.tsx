import React from 'react';

type TicketModalProps = {
  ticketImageUrl: string;
  isOpen?: boolean;
  onClose: () => void;
};

export default function TicketModal({ ticketImageUrl, isOpen = true, onClose }: TicketModalProps) {
  if (!isOpen) return null;
  const handleDownload = async () => {
    if (!ticketImageUrl) return;
    try {
      const response = await fetch(ticketImageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ticket.png';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="relative flex flex-col items-center max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-12 right-0 text-white text-3xl hover:opacity-80"
          aria-label="Close"
        >
          ✕
        </button>
        {ticketImageUrl ? (
          <img
            src={ticketImageUrl}
            alt="Ticket"
            className="max-w-[90%] rounded-xl object-contain"
          />
        ) : (
          <div className="w-64 h-80 rounded-xl bg-gray-800 flex items-center justify-center text-muted text-sm">
            Нет изображения билета
          </div>
        )}
        {ticketImageUrl && (
          <button
            type="button"
            onClick={handleDownload}
            className="mt-4 px-6 py-2 rounded-lg bg-[#FFC107] text-black font-medium"
          >
            Сохранить на телефон
          </button>
        )}
      </div>
    </div>
  );
}
