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
