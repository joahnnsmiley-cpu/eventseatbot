/**
 * Payment repository - in-memory storage
 * Persists to JSON file (same pattern as bookings)
 */

import fs from 'fs';
import path from 'path';
import { PaymentIntent, PaymentStatus } from './payment.types';

export type { PaymentIntent, PaymentStatus };

const PAYMENTS_FILE = path.join(__dirname, '../../..', 'data', 'payments.json');

interface PaymentDatabase {
  payments: PaymentIntent[];
}

function ensureDataDir(): void {
  const dataDir = path.dirname(PAYMENTS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readPaymentsDb(): PaymentDatabase {
  ensureDataDir();
  if (!fs.existsSync(PAYMENTS_FILE)) {
    const initial: PaymentDatabase = { payments: [] };
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const content = fs.readFileSync(PAYMENTS_FILE, 'utf-8');
    return JSON.parse(content) as PaymentDatabase;
  } catch {
    const initial: PaymentDatabase = { payments: [] };
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function writePaymentsDb(db: PaymentDatabase): void {
  ensureDataDir();
  fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(db, null, 2));
}

/**
 * Create a new payment intent
 */
export function createPaymentIntent(
  id: string,
  bookingId: string,
  amount: number,
): PaymentIntent {
  const db = readPaymentsDb();
  const intent: PaymentIntent = {
    id,
    bookingId,
    amount,
    status: 'pending',
    createdAt: Date.now(),
  };
  db.payments.push(intent);
  writePaymentsDb(db);
  return intent;
}

/**
 * Find payment intent by ID
 */
export function findPaymentById(id: string): PaymentIntent | null {
  const db = readPaymentsDb();
  return db.payments.find((p) => p.id === id) || null;
}

/**
 * Find all payment intents for a booking
 */
export function findPaymentsByBookingId(bookingId: string): PaymentIntent[] {
  const db = readPaymentsDb();
  return db.payments.filter((p) => p.bookingId === bookingId);
}

/**
 * Update payment status with optional confirmation details
 */
export function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  details?: {
    method?: string;
    confirmedBy?: string;
    confirmedAt?: string;
  },
): PaymentIntent | null {
  const db = readPaymentsDb();
  const payment = db.payments.find((p) => p.id === id);
  if (!payment) return null;
  payment.status = status;
  if (details) {
    if (details.method) payment.method = details.method as any;
    if (details.confirmedBy) payment.confirmedBy = details.confirmedBy;
    if (details.confirmedAt) payment.confirmedAt = details.confirmedAt;
  }
  writePaymentsDb(db);
  return payment;
}

/**
 * Get all payment intents
 */
export function getAllPayments(): PaymentIntent[] {
  const db = readPaymentsDb();
  return db.payments;
}
