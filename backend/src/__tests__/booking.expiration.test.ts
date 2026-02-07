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

  // Test 4: Seats are restored when booking expires
  await runTest('expired booking restores table seats', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.reset();

    // Clear
    db.setBookings([]);
    const events = db.getEvents();
    const cleanEvents = events.filter((e: any) => e.id !== 'exp-test-evt-4');
    db.saveEvents(cleanEvents);

    // Add test event
    const testEvent = {
      id: 'exp-test-evt-4',
      title: 'Test Event 4',
      description: '',
      date: new Date().toISOString(),
      imageUrl: 'https://example.com/image4.jpg',
      status: 'published',
      paymentPhone: '',
      maxSeatsPerBooking: 10,
      schemaImageUrl: 'https://example.com/schema4.jpg',
      tables: [
        {
          id: 'exp-test-tbl-4',
          number: 1,
          seatsTotal: 10,
          seatsAvailable: 5, // 5 booked by expired booking
          centerX: 50,
          centerY: 50,
        },
      ],
    } as any;
    const allEvents = db.getEvents();
    allEvents.push(testEvent);
    db.saveEvents(allEvents);

    // Add expired booking
    const now = new Date();
    const createdAt = new Date(now.getTime() - 20 * 60 * 1000);
    const expiresAt = calculateBookingExpiration(createdAt.getTime());

    const allBookings = db.getBookings();
    allBookings.push({
      id: 'exp-test-bk-4',
      eventId: 'exp-test-evt-4',
      tableId: 'exp-test-tbl-4',
      seatsBooked: 5,
      status: 'confirmed',
      createdAt: createdAt.getTime(),
      expiresAt,
      userTelegramId: 0,
      username: '',
      seatIds: [],
      totalAmount: 0,
    } as any);
    db.setBookings(allBookings);

    // Run expiration
    expireStaleBookings(now);

    // Verify seats restored
    const updatedEvents = db.getEvents();
    const updatedEvent = updatedEvents.find((e: any) => e.id === 'exp-test-evt-4');
    const table = (updatedEvent as any)?.tables?.[0];

    if (!table) {
      throw new Error('Table not found after expiration');
    }

    if (table.seatsAvailable !== 10) {
      throw new Error(
        `Expected seats restored to 10, got ${table.seatsAvailable}`,
      );
    }
  });

  // Test 5: Paid bookings are NOT cancelled on expiration
  await runTest('paid bookings are NOT cancelled on expiration', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.reset();

    // Clear
    db.setBookings([]);
    const events = db.getEvents();
    const cleanEvents = events.filter((e: any) => e.id !== 'exp-test-evt-5');
    db.saveEvents(cleanEvents);

    // Add test event
    const testEvent = {
      id: 'exp-test-evt-5',
      title: 'Test Event 5',
      description: '',
      date: new Date().toISOString(),
      imageUrl: 'https://example.com/image5.jpg',
      status: 'published',
      paymentPhone: '',
      maxSeatsPerBooking: 10,
      schemaImageUrl: 'https://example.com/schema5.jpg',
      tables: [
        {
          id: 'exp-test-tbl-5',
          number: 1,
          seatsTotal: 4,
          seatsAvailable: 2,
          centerX: 50,
          centerY: 50,
        },
      ],
    } as any;
    const allEvents = db.getEvents();
    allEvents.push(testEvent);
    db.saveEvents(allEvents);

    // Add paid booking (status: paid)
    const now = new Date();
    const createdAt = new Date(now.getTime() - 20 * 60 * 1000);
    const expiresAt = calculateBookingExpiration(createdAt.getTime());

    const allBookings = db.getBookings();
    allBookings.push({
      id: 'exp-test-bk-5',
      eventId: 'exp-test-evt-5',
      tableId: 'exp-test-tbl-5',
      seatsBooked: 2,
      status: 'paid', // NOT "confirmed"
      createdAt: createdAt.getTime(),
      expiresAt,
      userTelegramId: 0,
      username: '',
      seatIds: [],
      totalAmount: 100,
    } as any);
    db.setBookings(allBookings);

    // Run expiration
    const expiredCount = expireStaleBookings(now);

    // Verify booking was NOT expired
    if (expiredCount !== 0) {
      throw new Error(
        `Expected paid booking to NOT expire, but ${expiredCount} bookings expired`,
      );
    }

    // Verify booking still has status: paid
    const updatedBookings = db.getBookings();
    const updatedBooking = updatedBookings.find((b: any) => b.id === 'exp-test-bk-5');

    if (updatedBooking?.status !== 'paid') {
      throw new Error(
        `Expected booking status to remain 'paid', got ${updatedBooking?.status}`,
      );
    }

    // Verify no cancellation event emitted
    if (mockNotifier.callCount.bookingCancelled !== 0) {
      throw new Error(
        `Expected no bookingCancelled calls for paid booking, got ${mockNotifier.callCount.bookingCancelled}`,
      );
    }
  });

  // Test 6: Double expiration run (idempotency) - no double side-effects
  await runTest('double expiration run has no double side-effects', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.reset();

    // Clear
    db.setBookings([]);
    const events = db.getEvents();
    const cleanEvents = events.filter((e: any) => e.id !== 'exp-test-evt-6');
    db.saveEvents(cleanEvents);

    // Add test event
    const testEvent = {
      id: 'exp-test-evt-6',
      title: 'Test Event 6',
      description: '',
      date: new Date().toISOString(),
      imageUrl: 'https://example.com/image6.jpg',
      status: 'published',
      paymentPhone: '',
      maxSeatsPerBooking: 10,
      schemaImageUrl: 'https://example.com/schema6.jpg',
      tables: [
        {
          id: 'exp-test-tbl-6',
          number: 1,
          seatsTotal: 4,
          seatsAvailable: 2,
          centerX: 50,
          centerY: 50,
        },
      ],
    } as any;
    const allEvents = db.getEvents();
    allEvents.push(testEvent);
    db.saveEvents(allEvents);

    // Add expired booking
    const now = new Date();
    const createdAt = new Date(now.getTime() - 20 * 60 * 1000);
    const expiresAt = calculateBookingExpiration(createdAt.getTime());

    const allBookings = db.getBookings();
    allBookings.push({
      id: 'exp-test-bk-6',
      eventId: 'exp-test-evt-6',
      tableId: 'exp-test-tbl-6',
      seatsBooked: 2,
      status: 'confirmed',
      createdAt: createdAt.getTime(),
      expiresAt,
      userTelegramId: 0,
      username: '',
      seatIds: [],
      totalAmount: 0,
    } as any);
    db.setBookings(allBookings);

    // First run
    const expiredCount1 = expireStaleBookings(now);
    const notifCount1 = mockNotifier.callCount.bookingCancelled;

    if (expiredCount1 !== 1) {
      throw new Error(`First run: expected 1 booking expired, got ${expiredCount1}`);
    }

    // Second run (same time, already cancelled)
    const expiredCount2 = expireStaleBookings(now);
    const notifCount2 = mockNotifier.callCount.bookingCancelled;

    // Second run should find 0 bookings to expire (already cancelled)
    if (expiredCount2 !== 0) {
      throw new Error(
        `Second run: expected 0 bookings expired (idempotent), got ${expiredCount2}`,
      );
    }

    // Verify no duplicate notification
    if (notifCount2 !== notifCount1) {
      throw new Error(
        `Expected ${notifCount1} total notifications, got ${notifCount2} (duplicate!)`,
      );
    }

    // Verify seats only restored once
    const finalEvents = db.getEvents();
    const finalEvent = finalEvents.find((e: any) => e.id === 'exp-test-evt-6');
    const finalTable = (finalEvent as any)?.tables?.[0];

    if (finalTable?.seatsAvailable !== 4) {
      throw new Error(
        `Expected seats at 4 (restored once), got ${finalTable?.seatsAvailable}`,
      );
    }
  });

  // Test 7: Scheduler does not throw on errors
  await runTest('scheduler does not throw on notifier errors', async () => {
    // Create a notifier that throws
    const throwingNotifier: BookingEventNotifier = {
      async bookingCreated() {},
      async bookingCancelled() {
        throw new Error('Intentional notifier error');
      },
    };
    setBookingEventNotifier(throwingNotifier);

    // Clear and setup test data
    db.setBookings([]);
    const events = db.getEvents();
    const cleanEvents = events.filter((e: any) => e.id !== 'exp-test-evt-7');
    db.saveEvents(cleanEvents);

    // Add test event
    const testEvent = {
      id: 'exp-test-evt-7',
      title: 'Test Event 7',
      description: '',
      date: new Date().toISOString(),
      imageUrl: 'https://example.com/image7.jpg',
      status: 'published',
      paymentPhone: '',
      maxSeatsPerBooking: 10,
      schemaImageUrl: 'https://example.com/schema7.jpg',
      tables: [
        {
          id: 'exp-test-tbl-7',
          number: 1,
          seatsTotal: 4,
          seatsAvailable: 2,
          centerX: 50,
          centerY: 50,
        },
      ],
    } as any;
    const allEvents = db.getEvents();
    allEvents.push(testEvent);
    db.saveEvents(allEvents);

    // Add expired booking
    const now = new Date();
    const createdAt = new Date(now.getTime() - 20 * 60 * 1000);
    const expiresAt = calculateBookingExpiration(createdAt.getTime());

    const allBookings = db.getBookings();
    allBookings.push({
      id: 'exp-test-bk-7',
      eventId: 'exp-test-evt-7',
      tableId: 'exp-test-tbl-7',
      seatsBooked: 2,
      status: 'confirmed',
      createdAt: createdAt.getTime(),
      expiresAt,
      userTelegramId: 0,
      username: '',
      seatIds: [],
      totalAmount: 0,
    } as any);
    db.setBookings(allBookings);

    // Should NOT throw even though notifier throws
    let threw = false;
    try {
      expireStaleBookings(now);
    } catch {
      threw = true;
    }

    if (threw) {
      throw new Error('expireStaleBookings should not throw even if notifier throws');
    }

    // Verify booking was still expired and seats restored
    const finalBookings = db.getBookings();
    const finalBooking = finalBookings.find((b: any) => b.id === 'exp-test-bk-7');

    if (finalBooking?.status !== 'cancelled') {
      throw new Error(
        `Expected booking to be cancelled despite notifier error, got status: ${finalBooking?.status}`,
      );
    }
  });

  // Test 8: Uses injected now parameter (no real timers)
  await runTest('expireStaleBookings uses injected now parameter', async () => {
    setBookingEventNotifier(mockNotifier);
    mockNotifier.reset();

    // Clear
    db.setBookings([]);
    const events = db.getEvents();
    const cleanEvents = events.filter((e: any) => e.id !== 'exp-test-evt-8');
    db.saveEvents(cleanEvents);

    // Add test event
    const testEvent = {
      id: 'exp-test-evt-8',
      title: 'Test Event 8',
      description: '',
      date: new Date().toISOString(),
      imageUrl: 'https://example.com/image8.jpg',
      status: 'published',
      paymentPhone: '',
      maxSeatsPerBooking: 10,
      schemaImageUrl: 'https://example.com/schema8.jpg',
      tables: [
        {
          id: 'exp-test-tbl-8',
          number: 1,
          seatsTotal: 4,
          seatsAvailable: 2,
          centerX: 50,
          centerY: 50,
        },
      ],
    } as any;
    const allEvents = db.getEvents();
    allEvents.push(testEvent);
    db.saveEvents(allEvents);

    // Add booking that expires at specific time
    const injectedNow = new Date('2026-02-07T12:00:00Z');
    const expiresAt = '2026-02-07T11:50:00Z'; // 10 minutes before injectedNow

    const allBookings = db.getBookings();
    allBookings.push({
      id: 'exp-test-bk-8',
      eventId: 'exp-test-evt-8',
      tableId: 'exp-test-tbl-8',
      seatsBooked: 2,
      status: 'confirmed',
      createdAt: new Date('2026-02-07T11:40:00Z').getTime(),
      expiresAt,
      userTelegramId: 0,
      username: '',
      seatIds: [],
      totalAmount: 0,
    } as any);
    db.setBookings(allBookings);

    // Pass injected "now" - no real timers used
    const expiredCount = expireStaleBookings(injectedNow);

    // Verify it respects the injected time
    if (expiredCount !== 1) {
      throw new Error(
        `Expected 1 booking to expire with injected time, got ${expiredCount}`,
      );
    }

    // Verify booking was cancelled
    const finalBookings = db.getBookings();
    const finalBooking = finalBookings.find((b: any) => b.id === 'exp-test-bk-8');

    if (finalBooking?.status !== 'cancelled') {
      throw new Error(
        `Expected booking cancelled with injected time, got status: ${finalBooking?.status}`,
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
