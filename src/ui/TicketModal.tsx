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
        <div className="flex items-center justify-between w-full mb-4">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-2 rounded-lg border border-white/30 text-white hover:bg-white/10 transition"
          >
            Назад
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-white text-2xl hover:opacity-80 w-10 h-10 flex items-center justify-center"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
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
