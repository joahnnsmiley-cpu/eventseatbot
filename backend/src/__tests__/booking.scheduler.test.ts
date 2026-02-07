/**
 * Unit tests for booking expiration scheduler
 * Run with: npx ts-node src/__tests__/booking.scheduler.test.ts
 */

import {
  startBookingExpirationJob,
  stopBookingExpirationJob,
  isBookingExpirationJobRunning,
} from '../infra/scheduler';
import { setBookingEventNotifier, type BookingEventNotifier } from '../domain/bookings';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

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
  console.log('\n📋 Booking Expiration Scheduler Tests\n');

  // Setup NOOP notifier to prevent errors
  const noopNotifier: BookingEventNotifier = {
    async bookingCreated() {},
    async bookingCancelled() {},
  };
  setBookingEventNotifier(noopNotifier);

  // Test 1: Scheduler starts successfully
  await runTest('startBookingExpirationJob starts without throwing', async () => {
    // Stop any existing scheduler first
    stopBookingExpirationJob();

    // Should not throw
    startBookingExpirationJob();

    // Verify it's running
    if (!isBookingExpirationJobRunning()) {
      throw new Error('Scheduler should be running after start');
    }

    // Cleanup
    stopBookingExpirationJob();
  });

  // Test 2: Scheduler can be stopped
  await runTest('stopBookingExpirationJob stops the scheduler', async () => {
    // Start scheduler
    startBookingExpirationJob();

    if (!isBookingExpirationJobRunning()) {
      throw new Error('Scheduler should be running after start');
    }

    // Stop it
    stopBookingExpirationJob();

    if (isBookingExpirationJobRunning()) {
      throw new Error('Scheduler should be stopped after stop');
    }
  });

  // Test 3: Multiple start calls are idempotent
  await runTest('multiple startBookingExpirationJob calls are safe (idempotent)', async () => {
    // Stop first
    stopBookingExpirationJob();

    // Start multiple times
    startBookingExpirationJob();
    startBookingExpirationJob(); // Should not create duplicate intervals
    startBookingExpirationJob();

    if (!isBookingExpirationJobRunning()) {
      throw new Error('Scheduler should be running');
    }

    // Cleanup
    stopBookingExpirationJob();
  });

  // Test 4: Scheduler state tracking works
  await runTest('isBookingExpirationJobRunning correctly tracks state', async () => {
    // Should start as stopped
    stopBookingExpirationJob();

    if (isBookingExpirationJobRunning()) {
      throw new Error('Scheduler should be stopped initially');
    }

    // Start
    startBookingExpirationJob();

    if (!isBookingExpirationJobRunning()) {
      throw new Error('Scheduler should be running after start');
    }

    // Stop
    stopBookingExpirationJob();

    if (isBookingExpirationJobRunning()) {
      throw new Error('Scheduler should be stopped after stop');
    }
  });

  // Test 5: Scheduler does not throw on start/stop even with bad state
  await runTest('startBookingExpirationJob is resilient to errors', async () => {
    stopBookingExpirationJob();

    // Should not throw even if called in various orders
    let threw = false;
    try {
      startBookingExpirationJob();
      stopBookingExpirationJob();
      stopBookingExpirationJob(); // Stop when already stopped
      startBookingExpirationJob();
      startBookingExpirationJob(); // Start when already running
      stopBookingExpirationJob();
    } catch {
      threw = true;
    }

    if (threw) {
      throw new Error('Scheduler operations should never throw');
    }

    // Cleanup
    stopBookingExpirationJob();
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
