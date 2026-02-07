/**
 * Unit tests for booking expiration with notifications
 * Run with: npx ts-node src/__tests__/booking.expiration.test.ts
 */

import { expireStaleBookings, calculateBookingExpiration, getBookingTtlMinutes } from '../domain/bookings/booking.expiration';
import { setBookingEventNotifier, type BookingEventNotifier, type BookingCancelledEvent } from '../domain/bookings';
import * as db from '../db';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

/**
 * Mock notifier for testing
 */
class MockExpirationNotifier implements BookingEventNotifier {
  callCount = {
    bookingCreated: 0,
    bookingCancelled: 0,
  };
  lastPayload: BookingCancelledEvent | null = null;
  allPayloads: BookingCancelledEvent[] = [];

  async bookingCreated(): Promise<void> {
    this.callCount.bookingCreated++;
  }

  async bookingCancelled(event: BookingCancelledEvent): Promise<void> {
    this.callCount.bookingCancelled++;
    this.lastPayload = event;
    this.allPayloads.push(event);
  }

  reset(): void {
    this.callCount = { bookingCreated: 0, bookingCancelled: 0 };
    this.lastPayload = null;
    this.allPayloads = [];
  }
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
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

async function runTests() {
  console.log('\n📋 Booking Expiration Notification Tests\n');

  const mockNotifier = new MockExpirationNotifier();

  // Test 1: expireStaleBookings emits cancellation event with reason:expired
  await runTest('expireStaleBookings emits bookingCancelled with reason:expired', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.reset();

    // Create expired booking in memory
    const events = db.getEvents();
    const bookings = db.getBookings();

    // Add a test event with a table
    const testEvent = {
      id: 'exp-test-evt-1',
      title: 'Test Event',
      description: '',
      date: new Date().toISOString(),
      imageUrl: 'https://example.com/image.jpg',
      status: 'published',
      paymentPhone: '',
      maxSeatsPerBooking: 10,
      schemaImageUrl: 'https://example.com/schema.jpg',
      tables: [
        {
          id: 'exp-test-tbl-1',
          number: 1,
          seatsTotal: 4,
          seatsAvailable: 2,
          centerX: 50,
          centerY: 50,
        },
      ],
    } as any;
    events.push(testEvent);
    db.saveEvents(events);

    // Add an expired confirmed booking
    const now = new Date();
    const createdAt = new Date(now.getTime() - 20 * 60 * 1000); // 20 minutes ago
    const expiresAt = calculateBookingExpiration(createdAt.getTime());

    const testBooking = {
      id: 'exp-test-bk-1',
      eventId: 'exp-test-evt-1',
      tableId: 'exp-test-tbl-1',
      seatsBooked: 2,
      status: 'confirmed',
      createdAt: createdAt.getTime(),
      expiresAt,
      userTelegramId: 0,
      username: '',
      seatIds: [],
      totalAmount: 0,
    } as any;
    bookings.push(testBooking);
    db.saveBookings(bookings);

    // Call expireStaleBookings
    const expiredCount = expireStaleBookings(now);

    // Verify 1 booking expired
    if (expiredCount !== 1) {
      throw new Error(`Expected 1 booking to expire, got ${expiredCount}`);
    }

    // Verify bookingCancelled was called once
    if (mockNotifier.callCount.bookingCancelled !== 1) {
      throw new Error(`Expected 1 bookingCancelled call, got ${mockNotifier.callCount.bookingCancelled}`);
    }

    // Verify reason is "expired"
    if (mockNotifier.lastPayload?.reason !== 'expired') {
      throw new Error(
        `Expected reason:expired, got ${mockNotifier.lastPayload?.reason}`,
      );
    }

    // Verify payload contains correct bookingId and eventId
    if (mockNotifier.lastPayload?.bookingId !== 'exp-test-bk-1') {
      throw new Error(`Expected bookingId exp-test-bk-1, got ${mockNotifier.lastPayload?.bookingId}`);
    }
    if (mockNotifier.lastPayload?.eventId !== 'exp-test-evt-1') {
      throw new Error(`Expected eventId exp-test-evt-1, got ${mockNotifier.lastPayload?.eventId}`);
    }
  });

  // Test 2: No duplicate notifications on multiple expirations
  await runTest('multiple expiring bookings emit separate events (no duplication)', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.reset();

    const events = db.getEvents();
    const bookings = db.getBookings();

    // Clear previous test data
    db.setBookings([]);
    const cleanEvents = events.filter((e: any) => e.id !== 'exp-test-evt-2');
    db.saveEvents(cleanEvents);

    // Add test event
    const testEvent = {
      id: 'exp-test-evt-2',
      title: 'Test Event 2',
      description: '',
      date: new Date().toISOString(),
      imageUrl: 'https://example.com/image2.jpg',
      status: 'published',
      paymentPhone: '',
      maxSeatsPerBooking: 10,
      schemaImageUrl: 'https://example.com/schema2.jpg',
      tables: [
        {
          id: 'exp-test-tbl-2a',
          number: 1,
          seatsTotal: 4,
          seatsAvailable: 2,
          centerX: 50,
          centerY: 50,
        },
        {
          id: 'exp-test-tbl-2b',
          number: 2,
          seatsTotal: 4,
          seatsAvailable: 3,
          centerX: 60,
          centerY: 60,
        },
      ],
    } as any;
    const allEvents = db.getEvents();
    allEvents.push(testEvent);
    db.saveEvents(allEvents);

    // Add 3 expired bookings
    const now = new Date();
    const createdAt = new Date(now.getTime() - 20 * 60 * 1000);
    const expiresAt = calculateBookingExpiration(createdAt.getTime());

    const allBookings = db.getBookings();
    for (let i = 1; i <= 3; i++) {
      allBookings.push({
        id: `exp-test-bk-2-${i}`,
        eventId: 'exp-test-evt-2',
        tableId: i === 1 ? 'exp-test-tbl-2a' : 'exp-test-tbl-2b',
        seatsBooked: i,
        status: 'confirmed',
        createdAt: createdAt.getTime(),
        expiresAt,
        userTelegramId: 0,
        username: '',
        seatIds: [],
        totalAmount: 0,
      } as any);
    }
    db.setBookings(allBookings);

    // Call expireStaleBookings
    const expiredCount = expireStaleBookings(now);

    // Verify 3 bookings expired
    if (expiredCount !== 3) {
      throw new Error(`Expected 3 bookings to expire, got ${expiredCount}`);
    }

    // Verify exactly 3 separate cancellation events (no duplication)
    if (mockNotifier.callCount.bookingCancelled !== 3) {
      throw new Error(
        `Expected 3 separate bookingCancelled calls, got ${mockNotifier.callCount.bookingCancelled}`,
      );
    }

    // Verify each has reason:expired
    for (let i = 0; i < 3; i++) {
      if (mockNotifier.allPayloads[i]?.reason !== 'expired') {
        throw new Error(
          `Payload ${i} has reason:${mockNotifier.allPayloads[i]?.reason}, expected reason:expired`,
        );
      }
    }
  });

  // Test 3: Non-expired bookings do not emit events
  await runTest('non-expired confirmed bookings do not emit events', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.reset();

    const events = db.getEvents();
    const bookings = db.getBookings();

    // Clear
    db.setBookings([]);
    const cleanEvents = events.filter((e: any) => e.id !== 'exp-test-evt-3');
    db.saveEvents(cleanEvents);

    // Add test event
    const testEvent = {
      id: 'exp-test-evt-3',
      title: 'Test Event 3',
      description: '',
      date: new Date().toISOString(),
      imageUrl: 'https://example.com/image3.jpg',
      status: 'published',
      paymentPhone: '',
      maxSeatsPerBooking: 10,
      schemaImageUrl: 'https://example.com/schema3.jpg',
      tables: [
        {
          id: 'exp-test-tbl-3',
          number: 1,
          seatsTotal: 4,
          seatsAvailable: 4,
          centerX: 50,
          centerY: 50,
        },
      ],
    } as any;
    const allEvents = db.getEvents();
    allEvents.push(testEvent);
    db.saveEvents(allEvents);

    // Add a FUTURE booking (not expired)
    const now = new Date();
    const createdAt = new Date(now.getTime() - 5 * 60 * 1000); // only 5 minutes ago (default TTL is 15)
    const expiresAt = calculateBookingExpiration(createdAt.getTime());

    const allBookings = db.getBookings();
    allBookings.push({
      id: 'exp-test-bk-3',
      eventId: 'exp-test-evt-3',
      tableId: 'exp-test-tbl-3',
      seatsBooked: 1,
      status: 'confirmed',
      createdAt: createdAt.getTime(),
      expiresAt,
      userTelegramId: 0,
      username: '',
      seatIds: [],
      totalAmount: 0,
    } as any);
    db.setBookings(allBookings);

    // Call expireStaleBookings
    const expiredCount = expireStaleBookings(now);

    // Verify 0 bookings expired
    if (expiredCount !== 0) {
      throw new Error(`Expected 0 bookings to expire, got ${expiredCount}`);
    }

    // Verify no events emitted
    if (mockNotifier.callCount.bookingCancelled !== 0) {
      throw new Error(
        `Expected 0 bookingCancelled calls, got ${mockNotifier.callCount.bookingCancelled}`,
      );
    }
  });

  // ============================================
  // SUMMARY
  // ============================================

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
