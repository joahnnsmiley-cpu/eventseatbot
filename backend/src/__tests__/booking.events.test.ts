/**
 * Unit tests for booking event notifications
 * Run with: npx ts-node src/__tests__/booking.events.test.ts
 */

import {
  emitBookingCreated,
  emitBookingCancelled,
  setBookingEventNotifier,
  type BookingEventNotifier,
  type BookingCreatedEvent,
  type BookingCancelledEvent,
} from '../domain/bookings';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

/**
 * Mock notifier for testing
 */
class MockBookingNotifier implements BookingEventNotifier {
  callCount = {
    bookingCreated: 0,
    bookingCancelled: 0,
  };
  lastPayload: any = null;
  shouldThrow = false;

  async bookingCreated(event: BookingCreatedEvent): Promise<void> {
    this.callCount.bookingCreated++;
    this.lastPayload = event;
    if (this.shouldThrow) {
      throw new Error('Mock notifier error');
    }
  }

  async bookingCancelled(event: BookingCancelledEvent): Promise<void> {
    this.callCount.bookingCancelled++;
    this.lastPayload = event;
    if (this.shouldThrow) {
      throw new Error('Mock notifier error');
    }
  }

  reset(): void {
    this.callCount = { bookingCreated: 0, bookingCancelled: 0 };
    this.lastPayload = null;
    this.shouldThrow = false;
  }
}

const mockNotifier = new MockBookingNotifier();

async function runTest(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    mockNotifier.reset();
    await fn();
    results.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`✗ ${name}`);
    if (error instanceof Error) {
      console.log(`  Error: ${error.message}`);
    }
  }
}

// ============================================
// TEST SUITE
// ============================================

async function runTests(): Promise<void> {
  console.log('\n📋 Booking Events Notification Tests\n');

  // Test 1: bookingCreated emits event
  await runTest('bookingCreated calls notifier once', async () => {
    setBookingEventNotifier(mockNotifier);
    const event: BookingCreatedEvent = {
      bookingId: 'bk-123',
      eventId: 'evt-456',
      seats: 4,
      totalAmount: 1000,
    };
    await emitBookingCreated(event);
    if (mockNotifier.callCount.bookingCreated !== 1) {
      throw new Error(
        `Expected 1 call, got ${mockNotifier.callCount.bookingCreated}`,
      );
    }
  });

  // Test 2: bookingCreated passes correct payload
  await runTest('bookingCreated passes correct payload', async () => {
    setBookingEventNotifier(mockNotifier);
    const event: BookingCreatedEvent = {
      bookingId: 'bk-789',
      eventId: 'evt-999',
      seats: 2,
      totalAmount: 500,
      username: 'john_doe',
    };
    await emitBookingCreated(event);
    if (JSON.stringify(mockNotifier.lastPayload) !== JSON.stringify(event)) {
      throw new Error('Payload mismatch');
    }
  });

  // Test 3: bookingCancelled emits event
  await runTest('bookingCancelled calls notifier once', async () => {
    setBookingEventNotifier(mockNotifier);
    const event: BookingCancelledEvent = {
      bookingId: 'bk-111',
      eventId: 'evt-222',
    };
    await emitBookingCancelled(event);
    if (mockNotifier.callCount.bookingCancelled !== 1) {
      throw new Error(
        `Expected 1 call, got ${mockNotifier.callCount.bookingCancelled}`,
      );
    }
  });

  // Test 4: bookingCancelled passes correct payload
  await runTest('bookingCancelled passes correct payload', async () => {
    setBookingEventNotifier(mockNotifier);
    const event: BookingCancelledEvent = {
      bookingId: 'bk-333',
      eventId: 'evt-444',
      username: 'jane_doe',
    };
    await emitBookingCancelled(event);
    if (JSON.stringify(mockNotifier.lastPayload) !== JSON.stringify(event)) {
      throw new Error('Payload mismatch');
    }
  });

  // Test 5: Notifier error does not propagate
  await runTest('bookingCreated catches notifier errors', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.shouldThrow = true;
    const event: BookingCreatedEvent = {
      bookingId: 'bk-err-1',
      eventId: 'evt-err-1',
    };
    // Should not throw
    await emitBookingCreated(event);
    // Verify notifier was called despite error
    if (mockNotifier.callCount.bookingCreated !== 1) {
      throw new Error('Notifier was not called');
    }
  });

  // Test 6: Notifier error on cancel does not propagate
  await runTest('bookingCancelled catches notifier errors', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.shouldThrow = true;
    const event: BookingCancelledEvent = {
      bookingId: 'bk-err-2',
      eventId: 'evt-err-2',
    };
    // Should not throw
    await emitBookingCancelled(event);
    // Verify notifier was called despite error
    if (mockNotifier.callCount.bookingCancelled !== 1) {
      throw new Error('Notifier was not called');
    }
  });

  // Test 7: Multiple emissions work correctly
  await runTest('multiple emissions tracked separately', async () => {
    setBookingEventNotifier(mockNotifier);
    await emitBookingCreated({ bookingId: 'bk-1', eventId: 'evt-1' });
    await emitBookingCreated({ bookingId: 'bk-2', eventId: 'evt-2' });
    await emitBookingCancelled({ bookingId: 'bk-3', eventId: 'evt-3' });

    if (mockNotifier.callCount.bookingCreated !== 2) {
      throw new Error(
        `Expected 2 bookingCreated calls, got ${mockNotifier.callCount.bookingCreated}`,
      );
    }
    if (mockNotifier.callCount.bookingCancelled !== 1) {
      throw new Error(
        `Expected 1 bookingCancelled call, got ${mockNotifier.callCount.bookingCancelled}`,
      );
    }
  });

  // Test 8: NOOP notifier by default (no env vars)
  await runTest('NOOP notifier works by default', async () => {
    // Reset to NOOP
    const noop: BookingEventNotifier = {
      async bookingCreated() {},
      async bookingCancelled() {},
    };
    setBookingEventNotifier(noop);
    await emitBookingCreated({ bookingId: 'bk-noop', eventId: 'evt-noop' });
    // Should not throw
  });

  // Test 9: Expired cancellation event with reason
  await runTest('bookingCancelled with reason:expired', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.shouldThrow = false;
    mockNotifier.reset();
    const event: BookingCancelledEvent = {
      bookingId: 'bk-expired-1',
      eventId: 'evt-exp-1',
      reason: 'expired',
    };
    await emitBookingCancelled(event);
    if (mockNotifier.lastPayload?.reason !== 'expired') {
      throw new Error(`Expected reason:expired, got ${mockNotifier.lastPayload?.reason}`);
    }
  });

  // Test 10: Manual cancellation event with reason
  await runTest('bookingCancelled with reason:manual', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.shouldThrow = false;
    mockNotifier.reset();
    const event: BookingCancelledEvent = {
      bookingId: 'bk-manual-1',
      eventId: 'evt-man-1',
      reason: 'manual',
    };
    await emitBookingCancelled(event);
    if (mockNotifier.lastPayload?.reason !== 'manual') {
      throw new Error(`Expected reason:manual, got ${mockNotifier.lastPayload?.reason}`);
    }
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log('\n' + '='.repeat(50));
  console.log(`Tests: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`\n❌ Failed tests:`);
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
