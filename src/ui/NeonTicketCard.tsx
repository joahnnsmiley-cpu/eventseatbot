import React from 'react';

type StatusType = 'paid' | 'reserved' | 'cancelled';

type NeonTicketCardProps = {
  eventTitle: string;
  date: string;
  time: string;
  tableLabel: string;
  seatLabel: string;
  status: StatusType;
  ticketImageUrl: string;
  onClick: () => void;
};

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  paid: { label: 'Оплачено', className: 'bg-green-600 text-white' },
  reserved: { label: 'Ожидает оплаты', className: 'bg-yellow-500 text-black' },
  cancelled: { label: 'Отменено', className: 'bg-red-600 text-white' },
};

export default function NeonTicketCard({
  eventTitle,
  date,
  time,
  tableLabel,
  seatLabel,
  status,
  ticketImageUrl,
  onClick,
}: NeonTicketCardProps) {
  const { label, className } = statusConfig[status] ?? statusConfig.reserved;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full text-left bg-[#0b0b0b] rounded-2xl p-6 border border-white/10 shadow-[0_0_40px_rgba(255,193,7,0.4)] overflow-hidden after:absolute after:inset-0 after:rounded-2xl after:blur-xl after:bg-gradient-to-r after:from-yellow-500/20 after:to-purple-600/20 after:pointer-events-none after:content-['']"
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-bold text-white pr-2">{eventTitle}</h3>
          <span className={`text-xs px-2 py-1 rounded shrink-0 ${className}`}>{label}</span>
        </div>
        <div className="text-[#FFC107] text-sm mb-3">
          {date} {time && `• ${time}`}
        </div>
        <div className="h-px bg-white/10 mb-4" />
        <div className="flex items-end justify-between">
          <div className="text-xs text-gray-400">
            <div>{tableLabel}</div>
            <div>{seatLabel}</div>
          </div>
          <div className="w-16 h-16 rounded-lg bg-gray-700/50 shrink-0" />
        </div>
      </div>
    </button>
  );
}
