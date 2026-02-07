/**
 * Payment domain types
 */

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';
export type PaymentMethod = 'manual';

export interface PaymentIntent {
  id: string;
  bookingId: string;
  amount: number;
  status: PaymentStatus;
  method?: PaymentMethod;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  createdAt: number;
}
