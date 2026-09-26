import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown, CaretUp, CreditCard, Timer } from '@phosphor-icons/react';
import { UI_TEXT } from '../../constants/uiText';
import * as StorageService from '../../services/storageService';
import { openExternal } from '../utils/openExternal';
import type { PaymentMethodKey } from '../../types';

export interface PendingBookingInfo {
    bookingId: string;
    eventId: string;
    totalAmount: number;
    paymentPhone: string;
    /** Narrowed by the public API to what the server can actually do. */
    paymentMethods?: PaymentMethodKey[];
    eventTitle: string;
    status: string;
    tableNumber?: number | string;
    seatIndices?: string;
    expiresAt?: string | number | null;
}

interface PaymentReminderBannerProps {
    pendingBookings: PendingBookingInfo[];
    onMarkPaid: (bookingId: string) => void;
    onRefresh?: () => void;
}

/** Reusable hook that ticks every second and returns ms remaining */
function useCountdown(expiresAt?: string | number | null): number {
    const target = expiresAt
        ? typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : Number(expiresAt)
        : 0;
    const [remaining, setRemaining] = useState(() =>
        target > 0 ? Math.max(0, target - Date.now()) : 0
    );

    useEffect(() => {
        if (target <= 0) return;
        const id = setInterval(() => {
            setRemaining(Math.max(0, target - Date.now()));
        }, 1000);
        return () => clearInterval(id);
    }, [target]);

    return remaining;
}

/** Single booking row — has its own countdown hook */
const BookingRow: React.FC<{
    b: PendingBookingInfo;
    submittingId: string | null;
    onPaid: (id: string) => void;
    payingId: string | null;
    payByCard: (id: string) => void;
    isLast: boolean;
    totalCount: number;
}> = ({ b, submittingId, onPaid, payingId, payByCard, isLast, totalCount }) => {
    const methods = b.paymentMethods?.length ? b.paymentMethods : ['transfer'];
    const byCard = methods.includes('robokassa');
    const byTransfer = methods.includes('transfer');
    const remainingMs = useCountdown(b.expiresAt);
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    const isExpired = remainingMs <= 0 && !!b.expiresAt;
    const isUrgent = remainingMs > 0 && remainingMs < 5 * 60 * 1000; // <5 min

    return (
        <div className="space-y-2.5">
            {/* Event title + amount */}
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-white/60 truncate">{b.eventTitle}</span>
                {b.totalAmount > 0 && (
                    <span className="text-sm font-bold text-amber-300 shrink-0 nums">
                        {b.totalAmount.toLocaleString('ru-RU')} ₽
                    </span>
                )}
            </div>

            {/* Table & seats */}
            {(b.tableNumber || b.seatIndices) && (
                <div className="flex items-center gap-3 text-xs text-white/50">
                    {b.tableNumber && <span>Стол {b.tableNumber}</span>}
                    {b.seatIndices && <span>Места: {b.seatIndices}</span>}
                </div>
            )}

            {/* Countdown timer */}
            {b.expiresAt && (
                <div
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{
                        background: isExpired
                            ? 'rgba(220,38,38,0.12)'
                            : isUrgent
                                ? 'rgba(239,68,68,0.1)'
                                : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isExpired ? 'rgba(220,38,38,0.3)' : isUrgent ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                >
                    <Timer
                        size={14}
                        className={isExpired ? 'text-red-400' : isUrgent ? 'text-orange-400' : 'text-white/40'}
                        weight="bold"
                    />
                    {isExpired ? (
                        <span className="text-xs font-semibold text-red-400">Бронь истекла</span>
                    ) : (
                        <>
                            <span className="text-xs text-white/50">Бронь действует ещё</span>
                            <span
                                className={`text-sm font-bold font-mono tabular-nums ml-auto ${isUrgent ? 'text-orange-400' : 'text-white/80'}`}
                            >
                                {mins}:{secs.toString().padStart(2, '0')}
                            </span>
                        </>
                    )}
                </div>
            )}

            {byCard && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void payByCard(b.bookingId); }}
                    disabled={payingId !== null}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                    style={{
                        background: 'linear-gradient(135deg, #F5BE3C 0%, #D4A030 100%)',
                        color: '#0B0A09',
                        boxShadow: '0 4px 16px rgba(245,190,60,0.25)',
                    }}
                >
                    {payingId === b.bookingId ? 'Открываем оплату…' : 'Оплатить картой или СБП'}
                </button>
            )}

            {/* SBP Payment details */}
            {byTransfer && b.paymentPhone ? (
                <div
                    className="rounded-xl px-3 py-2.5 space-y-1.5"
                    style={{
                        background: 'rgba(245,190,60,0.06)',
                        border: '1px solid rgba(245,190,60,0.15)',
                    }}
                >
                    <p className="text-xs text-amber-200/80">{UI_TEXT.booking.bannerPayViaSbp}</p>
                    <p className="text-base font-bold text-white tracking-wide font-mono">{b.paymentPhone}</p>
                    <p className="text-[10px] text-white/40 break-all">
                        {UI_TEXT.booking.bannerPaymentRef} {b.bookingId}
                    </p>
                </div>
            ) : byTransfer ? (
                <p className="text-xs text-muted-light">{UI_TEXT.booking.paymentNoPhoneFallback}</p>
            ) : null}

            {byTransfer && (
            <>
            {/* FIO reminder */}
            <p className="text-[11px] text-amber-300/70 italic">
                Не забудьте указать ФИО в комментарии к платежу
            </p>

            {/* I Paid button */}
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onPaid(b.bookingId); }}
                disabled={submittingId !== null}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                    background: 'linear-gradient(135deg, #F5BE3C 0%, #D4A030 100%)',
                    color: '#0B0A09',
                    boxShadow: '0 4px 16px rgba(245,190,60,0.25)',
                }}
            >
                {submittingId === b.bookingId ? '…' : UI_TEXT.booking.paidButtonCaps}
            </button>
            </>
            )}

            {/* Separator for multiple bookings */}
            {totalCount > 1 && !isLast && (
                <div className="border-t border-white/5 pt-2" />
            )}
        </div>
    );
};

const PaymentReminderBanner: React.FC<PaymentReminderBannerProps> = ({
    pendingBookings,
    onMarkPaid,
    onRefresh,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [payingId, setPayingId] = useState<string | null>(null);

    if (pendingBookings.length === 0) return null;

    const handlePaid = async (bookingId: string) => {
        setSubmittingId(bookingId);
        try {
            await StorageService.updateBookingStatus(bookingId, 'awaiting_confirmation');
            onMarkPaid(bookingId);
            onRefresh?.();
        } catch {
            // silent fail
        } finally {
            setSubmittingId(null);
        }
    };

    /** Leaves the mini app for Robokassa's page; the callback settles the booking. */
    const handlePayByCard = async (bookingId: string) => {
        setPayingId(bookingId);
        try {
            const { url } = await StorageService.createRobokassaPayment(bookingId);
            openExternal(url);
        } catch {
            // The booking card in «Мои билеты» shows the reason; this strip stays quiet.
        } finally {
            setPayingId(null);
        }
    };

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, type: 'spring', damping: 20 }}
            className="fixed left-0 right-0 z-30 max-w-[420px] mx-auto px-3"
            style={{ bottom: 'calc(90px + env(safe-area-inset-bottom))' }}
        >
            {/* Collapsed pill */}
            <div onClick={() => setExpanded(!expanded)} className="cursor-pointer select-none">
                <div
                    className="flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border transition-all duration-300"
                    style={{
                        background: expanded
                            ? 'linear-gradient(135deg, rgba(20,20,22,0.95) 0%, rgba(30,28,24,0.98) 100%)'
                            : 'linear-gradient(135deg, rgba(30,28,24,0.92) 0%, rgba(20,18,14,0.95) 100%)',
                        borderColor: 'rgba(245,190,60,0.3)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(245,190,60,0.08)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                    }}
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div
                            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #F5BE3C 0%, #D4A030 100%)',
                                boxShadow: '0 0 12px rgba(245,190,60,0.4)',
                            }}
                        >
                            <CreditCard size={16} className="text-black" weight="bold" />
                        </div>
                        <span className="text-sm font-medium text-amber-200 truncate">
                            {UI_TEXT.booking.bannerCollapsedLabel}
                        </span>
                    </div>
                    <div className="shrink-0 text-amber-400/70">
                        {expanded ? <CaretDown size={18} /> : <CaretUp size={18} />}
                    </div>
                </div>
            </div>

            {/* Expanded details */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div
                            className="mt-1 rounded-2xl border px-4 py-4 space-y-3"
                            style={{
                                background: 'linear-gradient(135deg, rgba(20,20,22,0.97) 0%, rgba(28,26,22,0.99) 100%)',
                                borderColor: 'rgba(245,190,60,0.2)',
                                boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                                backdropFilter: 'blur(24px)',
                                WebkitBackdropFilter: 'blur(24px)',
                            }}
                        >
                            {pendingBookings.map((b, i) => (
                                <BookingRow
                                    key={b.bookingId}
                                    b={b}
                                    submittingId={submittingId}
                                    onPaid={handlePaid}
                            payingId={payingId}
                            payByCard={handlePayByCard}
                                    isLast={i === pendingBookings.length - 1}
                                    totalCount={pendingBookings.length}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default PaymentReminderBanner;
