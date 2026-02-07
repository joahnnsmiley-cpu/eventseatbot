# Manual Payment Confirmation Model

## Overview

Extended the `PaymentIntent` model to support manual confirmation with audit trail tracking. Enables admin-initiated payment confirmations with who-and-when tracking.

## Changes

### 1. Extended PaymentIntent Type
**File:** [backend/src/domain/payments/payment.types.ts](backend/src/domain/payments/payment.types.ts)

Added fields for manual confirmation:
```typescript
export type PaymentMethod = 'manual';

export interface PaymentIntent {
  // ... existing fields
  method?: PaymentMethod;           // 'manual' for admin-confirmed payments
  confirmedBy?: string | null;      // Admin user who confirmed
  confirmedAt?: string | null;      // ISO timestamp of confirmation
  createdAt: number;
}
```

### 2. Updated Payment Service
**File:** [backend/src/domain/payments/payment.service.ts](backend/src/domain/payments/payment.service.ts)

`markPaid()` now requires confirmation details:
```typescript
export function markPaid(
  paymentId: string,
  confirmedBy: string,          // REQUIRED: who confirms
  method: 'manual' = 'manual',  // REQUIRED: defaults to 'manual'
): ServiceResponse<PaymentIntent>
```

**Validation:**
- `confirmedBy` is required (400 if missing)
- Sets `confirmedAt` to current ISO timestamp
- Sets `method` to 'manual'
- Status flow unchanged: `pending → paid | cancelled`

### 3. Updated Payment Repository
**File:** [backend/src/domain/payments/payment.repository.ts](backend/src/domain/payments/payment.repository.ts)

Enhanced `updatePaymentStatus()` to accept confirmation details:
```typescript
export function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  details?: {
    method?: string;
    confirmedBy?: string;
    confirmedAt?: string;
  },
): PaymentIntent | null
```

### 4. Updated API Routes
**File:** [backend/src/routes/publicPayments.ts](backend/src/routes/publicPayments.ts)

POST endpoint now requires `confirmedBy` in request body:
```typescript
POST /public/payments/:id/pay
Content-Type: application/json

{
  "confirmedBy": "admin@example.com"
}

Response (200):
{
  "id": "pay-123",
  "bookingId": "bk-456",
  "amount": 1000,
  "status": "paid",
  "method": "manual",
  "confirmedBy": "admin@example.com",
  "confirmedAt": "2026-02-07T12:34:56.789Z",
  "createdAt": 1707318896000
}
```

## Status Flow

**Unchanged from previous:**
```
pending → paid | cancelled
```

**New requirement for paid state:**
- Must have `confirmedBy` (non-null)
- Must have `confirmedAt` (ISO timestamp)
- Must have `method: 'manual'`

## Test Coverage

**Updated Tests:** 19 total

### Payment Domain Tests (11/11)
```
✓ createPaymentIntent creates payment with pending status
✓ createPaymentIntent rejects invalid input
✓ markPaid transitions payment to paid         (NEW: verifies confirmation fields)
✓ markPaid rejects missing confirmedBy         (NEW)
✓ markPaid twice returns 409
✓ cancelPayment transitions payment to cancelled
✓ markPaid on cancelled payment returns 409
✓ cancelPayment twice returns 409
✓ markPaid updates related booking status to paid
✓ markPaid fails if booking is already paid
✓ cancelPayment does not update booking status
```

### Payment API Tests (8/8)
```
✓ POST /public/payments creates payment for confirmed booking
✓ POST /public/payments returns 404 for missing booking
✓ POST /public/payments returns 400 for non-confirmed booking
✓ POST /public/payments/:id/pay marks payment as paid     (NEW: requires confirmedBy)
✓ POST /public/payments/:id/pay twice returns 409
✓ POST /public/payments/:id/cancel cancels payment
✓ Cannot pay cancelled payment (returns 409)
✓ Paid payment updates related booking status
```

## Backward Compatibility

- `method`, `confirmedBy`, `confirmedAt` are **optional** on read
- Existing payments in database will have these fields as `null` or `undefined`
- `markPaid()` is the only place that requires `confirmedBy`

## Examples

### Create Payment (unchanged)
```bash
POST /public/payments
{
  "bookingId": "bk-123",
  "amount": 1000
}
```

### Mark as Paid (NEW - requires confirmation)
```bash
POST /public/payments/pay-456/pay
{
  "confirmedBy": "admin.user@company.com"
}
```

### Response
```json
{
  "id": "pay-456",
  "bookingId": "bk-123",
  "amount": 1000,
  "status": "paid",
  "method": "manual",
  "confirmedBy": "admin.user@company.com",
  "confirmedAt": "2026-02-07T12:34:56.789Z",
  "createdAt": 1707318896000
}
```

## Design Notes

- **No External SDK**: Uses plain TypeScript fields, no payment provider integration
- **Audit Trail**: `confirmedBy` + `confirmedAt` enables audit logging
- **Simple State**: Only supports 'manual' method (no webhook/async provider states)
- **Soft Booking Coupling**: Payment → Booking status update happens only on manual confirmation
- **Type Safety**: Full TypeScript coverage with required validation

## Running Tests

```bash
npm run test:payment-domain    # 11 tests (includes new confirmation tests)
npm run test:payment-api       # 8 tests (includes new endpoint validation)
npm run test:all              # 43 tests total (all suites)
npx tsc --noEmit              # Verify compilation
```
