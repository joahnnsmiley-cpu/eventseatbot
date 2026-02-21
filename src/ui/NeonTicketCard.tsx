import React from 'react';

type StatusType = 'paid' | 'reserved' | 'pending' | 'awaiting_payment' | 'awaiting_confirmation' | 'payment_submitted' | 'cancelled' | 'expired';

type NeonTicketCardProps = {
  eventTitle: string;
  date: string;
  time: string;
  tableLabel: string;
  seatLabel: string;
  status: StatusType;
  ticketImageUrl: string;
  posterImageUrl?: string;
  onClick: () => void;
};

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  paid: { label: 'Оплачено', className: 'bg-[#C6A75E] text-white' },
  reserved: { label: 'Ожидаем оплаты', className: 'bg-[#ECE6DD] text-[#1C1C1C]' },
  pending: { label: 'Ожидаем оплаты', className: 'bg-[#ECE6DD] text-[#1C1C1C]' },
  awaiting_payment: { label: 'Ожидаем оплаты', className: 'bg-[#ECE6DD] text-[#1C1C1C]' },
  awaiting_confirmation: { label: 'Ожидаем подтверждения', className: 'bg-amber-200 text-amber-900' },
  payment_submitted: { label: 'Ожидаем подтверждения', className: 'bg-amber-200 text-amber-900' },
  cancelled: { label: 'Отменено', className: 'bg-[#E8CFCF] text-[#7A2E2E]' },
  expired: { label: 'Истекло', className: 'bg-neutral-300 text-neutral-700' },
};

export default function NeonTicketCard({
  eventTitle,
  date,
  time,
  tableLabel,
  seatLabel,
  status,
  ticketImageUrl,
  posterImageUrl,
  onClick,
}: NeonTicketCardProps) {
  const { label, className } = statusConfig[status] ?? statusConfig.reserved;
  const hasTicket = Boolean(ticketImageUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left rounded-2xl overflow-hidden bg-black border border-white/10 ring-1 ring-white/10 ${hasTicket ? 'aspect-[2/1] min-h-[180px]' : ''}`}
    >
      {hasTicket ? (
        <>
          <img
            src={ticketImageUrl}
            alt="Билет"
            className="absolute inset-0 block"
            style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
            loading="lazy"
          />
          <div className="absolute top-3 right-3">
            <span className={`text-xs px-2 py-1 rounded shrink-0 ${className}`}>{label}</span>
          </div>
        </>
      ) : (
        <>
          {posterImageUrl && (
            <>
              <img
                src={posterImageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover brightness-90"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
            </>
          )}
          {!posterImageUrl && <div className="absolute inset-0 bg-black" />}
          <div className="relative z-10 p-4">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold text-white pr-2">{eventTitle}</h3>
              <span className={`text-xs px-2 py-1 rounded shrink-0 ${className}`}>{label}</span>
            </div>
            <div className="text-[#FFC107] text-sm mb-3">
              {date}{time ? `, ${time}` : ''}
            </div>
            <div className="h-px bg-white/10 mb-4" />
            <div className="text-xs text-muted-light">
              <div>{tableLabel}</div>
              <div>{seatLabel}</div>
            </div>
          </div>
        </>
      )}
    </button>
  );
}
