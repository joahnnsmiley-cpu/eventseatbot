import React from 'react';

export type TicketStatus = 'paid' | 'reserved' | 'awaiting_confirmation' | 'cancelled' | 'expired';

type Props = {
  eventTitle: string;
  date: string;
  time: string;
  tableLabel: string;
  seatLabel: string;
  status: TicketStatus;
  posterUrl?: string | null;
  /** Payment details, countdown, "Я оплатил" — whatever this ticket still needs. */
  children?: React.ReactNode;
  footer?: React.ReactNode;
};

const STATUS: Record<TicketStatus, { label: string; style: React.CSSProperties; border: string }> = {
  paid: { label: 'Оплачено', style: { background: 'rgba(87,199,155,0.14)', color: '#57C79B' }, border: 'rgba(87,199,155,0.35)' },
  reserved: { label: 'Ждём оплату', style: { background: '#FF5A2C', color: '#1C0A04' }, border: 'rgba(255,90,44,0.35)' },
  awaiting_confirmation: { label: 'Проверяем оплату', style: { background: '#1F1C19', color: '#BDB5A8' }, border: '#2B2723' },
  cancelled: { label: 'Отменено', style: { background: '#1F1C19', color: '#8C8477' }, border: '#2B2723' },
  expired: { label: 'Время вышло', style: { background: '#1F1C19', color: '#8C8477' }, border: '#2B2723' },
};

/**
 * One booking, readable at a glance.
 *
 * The old card printed the title and the date over the poster, where a bright
 * photo ate both, and the status badge landed on top of the text. The poster
 * stays as a thumbnail; everything you need to read sits on a dark surface.
 */
export default function TicketCard({
  eventTitle,
  date,
  time,
  tableLabel,
  seatLabel,
  status,
  posterUrl,
  children,
  footer,
}: Props) {
  const s = STATUS[status] ?? STATUS.reserved;
  const faded = status === 'cancelled' || status === 'expired';
  return (
    <article
      className="flex flex-col gap-3.5 p-4 rounded-[20px] bg-[#161412]"
      style={{ border: `1px solid ${s.border}`, opacity: faded ? 0.65 : 1 }}
    >
      <div className="flex items-start gap-3">
        {posterUrl && (
          <img src={posterUrl} alt="" loading="lazy" className="w-14 h-14 shrink-0 rounded-xl object-cover" />
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <h3 className="text-[17px] font-semibold text-white leading-tight">{eventTitle}</h3>
          <span className="text-[12.5px] text-[#8C8477]">
            {date}{time ? `, ${time}` : ''} · {tableLabel} · {seatLabel}
          </span>
        </div>
        <span className="h-[26px] px-2.5 shrink-0 flex items-center rounded-full text-[11.5px] font-semibold" style={s.style}>
          {s.label}
        </span>
      </div>
      {children}
      {footer}
    </article>
  );
}
