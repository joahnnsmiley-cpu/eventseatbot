/**
 * Payment domain types
 */

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export interface PaymentIntent {
  id: string;
  bookingId: string;
  amount: number;
  status: PaymentStatus;
  createdAt: number;
}
