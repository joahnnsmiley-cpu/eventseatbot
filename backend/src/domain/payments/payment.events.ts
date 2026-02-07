/**
 * Domain layer for payment events
 * Decouples domain from notification infrastructure
 */

export interface PaymentCreatedEvent {
  bookingId: string;
  eventId: string;
  tableId?: string | undefined;
  seatsBooked?: number | undefined;
  amount: number;
  method: 'manual';
  instruction: string;
}

export interface PaymentConfirmedEvent {
  bookingId: string;
  amount: number;
  confirmedBy: string;
  confirmedAt: string;
}

/**
 * Notifier interface for payment events
 * Can be implemented by any notification system (Telegram, Email, etc.)
 */
export interface PaymentEventNotifier {
  paymentCreated(event: PaymentCreatedEvent): Promise<void>;
  paymentConfirmed(event: PaymentConfirmedEvent): Promise<void>;
}

/**
 * NOOP notifier - does nothing by default
 * Prevents errors when no real notifier is configured
 */
const noopNotifier: PaymentEventNotifier = {
  async paymentCreated() {},
  async paymentConfirmed() {},
};

/**
 * Current notifier instance
 * Defaults to NOOP, can be injected via setPaymentEventNotifier()
 */
let notifier: PaymentEventNotifier = noopNotifier;

/**
 * Set the payment event notifier
 * Should be called during application initialization
 */
export function setPaymentEventNotifier(n: PaymentEventNotifier): void {
  notifier = n;
}

/**
 * Emit payment created event
 * Never throws - catches and logs all errors
 * Fire-and-forget pattern
 */
export async function emitPaymentCreated(event: PaymentCreatedEvent): Promise<void> {
  try {
    await notifier.paymentCreated(event);
  } catch (err) {
    console.error('[PaymentEvents] Error emitting paymentCreated:', err);
  }
}

/**
 * Emit payment confirmed event
 * Never throws - catches and logs all errors
 * Fire-and-forget pattern
 */
export async function emitPaymentConfirmed(event: PaymentConfirmedEvent): Promise<void> {
  try {
    await notifier.paymentConfirmed(event);
  } catch (err) {
    console.error('[PaymentEvents] Error emitting paymentConfirmed:', err);
  }
}
