/**
 * The payments table.
 *
 * Payment intents used to live in data/payments.json on the container's own
 * disk, which Render wipes on every deploy. Acquiring cannot work that way:
 * Robokassa's notification may arrive minutes or hours later, and the row it
 * refers to has to still be there. Hence a real table, and an InvId that comes
 * from a database identity column so it is unique for the life of the shop.
 */

import { supabase } from '../../supabaseClient';

export type RobokassaPaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export type PaymentRow = {
  id: string;
  bookingId: string;
  invId: number;
  provider: string;
  amount: number;
  status: RobokassaPaymentStatus;
  isTest: boolean;
  opKey: string | null;
  paymentMethod: string | null;
  fee: number | null;
  email: string | null;
  createdAt: string;
  paidAt: string | null;
  refundRequestId: string | null;
  refundState: string | null;
};

type DbRow = {
  id: string;
  booking_id: string;
  inv_id: number | string;
  provider: string;
  amount: number | string;
  status: string;
  is_test: boolean;
  op_key: string | null;
  payment_method: string | null;
  fee: number | string | null;
  email: string | null;
  created_at: string;
  paid_at: string | null;
  refund_request_id?: string | null;
  refund_state?: string | null;
};

function mapRow(row: DbRow): PaymentRow {
  return {
    id: row.id,
    bookingId: row.booking_id,
    invId: Number(row.inv_id),
    provider: row.provider,
    amount: Number(row.amount),
    status: row.status as RobokassaPaymentStatus,
    isTest: Boolean(row.is_test),
    opKey: row.op_key,
    paymentMethod: row.payment_method,
    fee: row.fee === null ? null : Number(row.fee),
    email: row.email,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    refundRequestId: row.refund_request_id ?? null,
    refundState: row.refund_state ?? null,
  };
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/**
 * A booking gets at most one live payment. Re-opening the payment screen must
 * reuse the same InvId rather than mint a new one, or the guest ends up with
 * several half-finished payments for the same seats.
 */
export async function findPendingPaymentForBooking(
  bookingId: string,
  isTest: boolean,
): Promise<PaymentRow | null> {
  const { data, error } = await client()
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('status', 'pending')
    .eq('is_test', isTest)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`payments.findPending: ${error.message}`);
  const row = (data as DbRow[] | null)?.[0];
  return row ? mapRow(row) : null;
}

export async function createPayment(input: {
  bookingId: string;
  amount: number;
  isTest: boolean;
  email?: string | null;
}): Promise<PaymentRow> {
  const { data, error } = await client()
    .from('payments')
    .insert({
      booking_id: input.bookingId,
      amount: input.amount,
      is_test: input.isTest,
      email: input.email ?? null,
      provider: 'robokassa',
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) throw new Error(`payments.create: ${error.message}`);
  return mapRow(data as DbRow);
}

export async function findPaymentByInvId(invId: number): Promise<PaymentRow | null> {
  const { data, error } = await client()
    .from('payments')
    .select('*')
    .eq('inv_id', invId)
    .limit(1);
  if (error) throw new Error(`payments.findByInvId: ${error.message}`);
  const row = (data as DbRow[] | null)?.[0];
  return row ? mapRow(row) : null;
}

export async function findPaymentsByBooking(bookingId: string): Promise<PaymentRow[]> {
  const { data, error } = await client()
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`payments.findByBooking: ${error.message}`);
  return ((data as DbRow[] | null) ?? []).map(mapRow);
}

/**
 * Marks the payment paid, but only if it is still pending.
 *
 * Robokassa retries ResultURL until it gets its OK, so the same notification
 * arrives more than once as a matter of course. The `.eq('status', 'pending')`
 * turns that into a no-op: the second call updates nothing and returns null,
 * and the caller knows not to issue the tickets twice.
 */
export async function markPaymentPaid(
  invId: number,
  details: {
    paymentMethod?: string | null;
    fee?: number | null;
    email?: string | null;
    opKey?: string | null;
    raw?: unknown;
  },
): Promise<PaymentRow | null> {
  const patch: Record<string, unknown> = {
    status: 'paid',
    paid_at: new Date().toISOString(),
  };
  if (details.paymentMethod) patch.payment_method = details.paymentMethod;
  if (details.fee !== undefined && details.fee !== null) patch.fee = details.fee;
  if (details.email) patch.email = details.email;
  if (details.opKey) patch.op_key = details.opKey;
  if (details.raw !== undefined) patch.raw = details.raw;

  const { data, error } = await client()
    .from('payments')
    .update(patch)
    .eq('inv_id', invId)
    .eq('status', 'pending')
    .select('*');
  if (error) throw new Error(`payments.markPaid: ${error.message}`);
  const row = (data as DbRow[] | null)?.[0];
  return row ? mapRow(row) : null;
}

export async function markPaymentCancelled(invId: number): Promise<void> {
  const { error } = await client()
    .from('payments')
    .update({ status: 'cancelled' })
    .eq('inv_id', invId)
    .eq('status', 'pending');
  if (error) throw new Error(`payments.markCancelled: ${error.message}`);
}

/**
 * Оплаченные платежи, которые стоит сверить с Робокассой.
 *
 * Только боевые: тестовые этим методом не опрашиваются. Только недавние:
 * возврат через полгода после концерта — случай для человека, а не для
 * подметания. Сначала те, кого давно не сверяли.
 */
export async function findPaidPaymentsToReconcile(
  sinceIso: string,
  limit: number,
): Promise<PaymentRow[]> {
  const { data, error } = await client()
    .from('payments')
    .select('*')
    .eq('status', 'paid')
    .eq('is_test', false)
    .gte('paid_at', sinceIso)
    .order('op_state_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`payments.findPaidToReconcile: ${error.message}`);
  return ((data as DbRow[] | null) ?? []).map(mapRow);
}

/** Запомнить, что ответила Робокасса о состоянии операции. */
export async function recordOpState(
  invId: number,
  state: { stateCode: number | null; opKey: string | null; raw: string },
): Promise<void> {
  const patch: Record<string, unknown> = {
    op_state_code: state.stateCode,
    op_state_at: new Date().toISOString(),
    op_state_raw: state.raw,
  };
  // OpKey не перезаписываем пустым: однажды полученный, он не меняется.
  if (state.opKey) patch.op_key = state.opKey;

  const { error } = await client().from('payments').update(patch).eq('inv_id', invId);
  if (error) throw new Error(`payments.recordOpState: ${error.message}`);
}

/** Пометить платёж возвращённым. */
export async function markPaymentRefunded(invId: number): Promise<boolean> {
  const { data, error } = await client()
    .from('payments')
    .update({ status: 'refunded' })
    .eq('inv_id', invId)
    .eq('status', 'paid')
    .select();
  if (error) throw new Error(`payments.markRefunded: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** Найти платёж по брони — любой, не только ожидающий. */
export async function findPaymentForBooking(bookingId: string): Promise<PaymentRow | null> {
  const { data, error } = await client()
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`payments.findForBooking: ${error.message}`);
  const row = (data as DbRow[] | null)?.[0];
  return row ? mapRow(row) : null;
}

/**
 * Записать поданную заявку на возврат.
 *
 * Условие по статусу — защита от двойного возврата: два нажатия подряд не
 * должны подать две заявки. Возвращает false, если заявка уже была.
 */
export async function recordRefundRequest(
  invId: number,
  requestId: string,
  requestedBy: string,
): Promise<boolean> {
  const { data, error } = await client()
    .from('payments')
    .update({
      refund_request_id: requestId,
      refund_state: 'processing',
      refund_requested_at: new Date().toISOString(),
      refund_requested_by: requestedBy,
    })
    .eq('inv_id', invId)
    .is('refund_request_id', null)
    .select();
  if (error) throw new Error(`payments.recordRefundRequest: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** Заявки, судьба которых ещё неизвестна. */
export async function findPendingRefunds(limit: number): Promise<PaymentRow[]> {
  const { data, error } = await client()
    .from('payments')
    .select('*')
    .eq('refund_state', 'processing')
    .not('refund_request_id', 'is', null)
    .limit(limit);
  if (error) throw new Error(`payments.findPendingRefunds: ${error.message}`);
  return ((data as DbRow[] | null) ?? []).map(mapRow);
}

/** Чем кончилась заявка. */
export async function recordRefundState(
  invId: number,
  state: 'finished' | 'canceled',
): Promise<void> {
  const patch: Record<string, unknown> = { refund_state: state };
  if (state === 'finished') patch.refunded_at = new Date().toISOString();
  const { error } = await client().from('payments').update(patch).eq('inv_id', invId);
  if (error) throw new Error(`payments.recordRefundState: ${error.message}`);
}
