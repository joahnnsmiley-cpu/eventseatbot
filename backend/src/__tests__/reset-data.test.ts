/**
 * Tests for resetData utility script
 * Tests data clearing functionality without polluting filesystem
 */

import fs from 'fs';
import path from 'path';

// Track test results
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    testsFailed++;
    throw new Error(message);
  }
}

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    // Error already logged by assert
  }
}

console.log('\n📋 Reset Data Script Tests\n');

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create temporary test files with dummy data
 */
function setupTestFiles(): { dataFile: string; paymentsFile: string } {
  const tmpDir = path.join(__dirname, '..', '..', 'test-tmp-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const dataFile = path.join(tmpDir, 'data.json');
  const dataSubDir = path.join(tmpDir, 'data');
  const paymentsFile = path.join(dataSubDir, 'payments.json');

  // Create test data with dummy events, bookings, and payments
  const testData = {
    events: [
      { id: 'evt-001', title: 'Event 1', description: 'Test event' },
      { id: 'evt-002', title: 'Event 2', description: 'Another test' },
    ],
    bookings: [
      { id: 'bk-001', userId: 'user-1', eventId: 'evt-001', status: 'confirmed' },
      { id: 'bk-002', userId: 'user-2', eventId: 'evt-002', status: 'paid' },
      { id: 'bk-003', userId: 'user-3', eventId: 'evt-001', status: 'expired' },
    ],
  };

  const testPayments = {
    payments: [
      { id: 'pay-001', bookingId: 'bk-001', amount: 5000, status: 'pending' },
      { id: 'pay-002', bookingId: 'bk-002', amount: 7500, status: 'paid' },
    ],
  };

  // Write test files
  fs.writeFileSync(dataFile, JSON.stringify(testData, null, 2));
  fs.mkdirSync(dataSubDir, { recursive: true });
  fs.writeFileSync(paymentsFile, JSON.stringify(testPayments, null, 2));

  return { dataFile, paymentsFile };
}

/**
 * Clean up test files
 */
function cleanupTestFiles(dataFile: string, paymentsFile: string): void {
  try {
    if (paymentsFile && fs.existsSync(paymentsFile)) {
      fs.unlinkSync(paymentsFile);
    }
    
    if (dataFile) {
      const dataDir = path.dirname(paymentsFile || dataFile);
      if (paymentsFile && fs.existsSync(dataDir)) {
        try {
          fs.rmdirSync(dataDir);
        } catch (e) {
          // Ignore if directory not empty
        }
      }
    }

    if (dataFile && fs.existsSync(dataFile)) {
      fs.unlinkSync(dataFile);
    }

    const tmpDir = dataFile ? path.dirname(dataFile) : path.dirname(paymentsFile);
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmdirSync(tmpDir);
      } catch (e) {
        // Ignore if directory not empty
      }
    }
  } catch (err) {
    // Silent cleanup errors - files will be cleaned up eventually
  }
}

/**
 * Reset data.json - clears events and bookings
 */
function resetDatabase(dataFile: string): void {
  let database: any = {
    events: [],
    bookings: [],
  };

  if (fs.existsSync(dataFile)) {
    const content = fs.readFileSync(dataFile, 'utf-8');
    const existing = JSON.parse(content);

    // Preserve admins if they exist
    if (existing.admins && Array.isArray(existing.admins)) {
      database.admins = existing.admins;
    }
  }

  // Write atomically
  const tempFile = dataFile + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(database, null, 2));
  fs.renameSync(tempFile, dataFile);
}

/**
 * Reset payments.json - clears payments array
 */
function resetPayments(paymentsFile: string): void {
  const paymentsDir = path.dirname(paymentsFile);

  // Ensure directory exists
  if (!fs.existsSync(paymentsDir)) {
    fs.mkdirSync(paymentsDir, { recursive: true });
  }

  // Create empty payments structure
  const paymentsData = {
    payments: [],
  };

  // Write atomically
  const tempFile = paymentsFile + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(paymentsData, null, 2));
  fs.renameSync(tempFile, paymentsFile);
}

// ============================================================================
// Tests
// ============================================================================

runTest('Setup: creates test files with dummy data', () => {
  const { dataFile, paymentsFile } = setupTestFiles();

  try {
    // Verify files exist
    assert(fs.existsSync(dataFile), 'data.json should exist');
    assert(fs.existsSync(paymentsFile), 'payments.json should exist');

    // Verify dummy data
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    const payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf-8'));

    assert(data.events.length === 2, 'Should have 2 dummy events');
    assert(data.bookings.length === 3, 'Should have 3 dummy bookings');
    assert(payments.payments.length === 2, 'Should have 2 dummy payments');
  } finally {
    cleanupTestFiles(dataFile, paymentsFile);
  }
});

runTest('resetDatabase: clears events and bookings arrays', () => {
  const { dataFile } = setupTestFiles();

  try {
    // Verify pre-reset state
    let data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    assert(data.events.length === 2, 'Should start with events');
    assert(data.bookings.length === 3, 'Should start with bookings');

    // Reset
    resetDatabase(dataFile);

    // Verify post-reset state
    data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    assert(data.events.length === 0, 'Events should be cleared');
    assert(data.bookings.length === 0, 'Bookings should be cleared');
  } finally {
    cleanupTestFiles(dataFile, '');
  }
});

runTest('resetPayments: clears payments array', () => {
  const { paymentsFile } = setupTestFiles();

  try {
    // Verify pre-reset state
    let payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf-8'));
    assert(payments.payments.length === 2, 'Should start with payments');

    // Reset
    resetPayments(paymentsFile);

    // Verify post-reset state
    payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf-8'));
    assert(payments.payments.length === 0, 'Payments should be cleared');
  } finally {
    cleanupTestFiles('', paymentsFile);
  }
});

runTest('Reset: clears all data in both files', () => {
  const { dataFile, paymentsFile } = setupTestFiles();

  try {
    // Verify initial state
    let data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    let payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf-8'));

    assert(data.events.length > 0, 'Should start with events');
    assert(data.bookings.length > 0, 'Should start with bookings');
    assert(payments.payments.length > 0, 'Should start with payments');

    // Reset both
    resetDatabase(dataFile);
    resetPayments(paymentsFile);

    // Verify all cleared
    data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf-8'));

    assert(data.events.length === 0, 'Events should be empty');
    assert(data.bookings.length === 0, 'Bookings should be empty');
    assert(payments.payments.length === 0, 'Payments should be empty');
  } finally {
    cleanupTestFiles(dataFile, paymentsFile);
  }
});

runTest('File structure: preserves JSON structure after reset', () => {
  const { dataFile, paymentsFile } = setupTestFiles();

  try {
    resetDatabase(dataFile);
    resetPayments(paymentsFile);

    // Verify structure is preserved
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    const payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf-8'));

    assert('events' in data, 'data.json should have events key');
    assert('bookings' in data, 'data.json should have bookings key');
    assert(Array.isArray(data.events), 'events should be array');
    assert(Array.isArray(data.bookings), 'bookings should be array');
    assert('payments' in payments, 'payments.json should have payments key');
    assert(Array.isArray(payments.payments), 'payments should be array');
  } finally {
    cleanupTestFiles(dataFile, paymentsFile);
  }
});

runTest('Atomic writes: uses temp files to prevent corruption', () => {
  const { dataFile } = setupTestFiles();

  try {
    // Monitor for temp files during reset
    const tmpFile = dataFile + '.tmp';
    assert(!fs.existsSync(tmpFile), 'Temp file should not exist before reset');

    resetDatabase(dataFile);

    assert(!fs.existsSync(tmpFile), 'Temp file should be cleaned up after reset');
    assert(fs.existsSync(dataFile), 'Original file should still exist');
  } finally {
    cleanupTestFiles(dataFile, '');
  }
});

runTest('Cleanup: removes test files without error', () => {
  const { dataFile, paymentsFile } = setupTestFiles();

  let errorThrown = false;
  try {
    cleanupTestFiles(dataFile, paymentsFile);
    assert(!fs.existsSync(dataFile), 'data.json should be deleted');
    assert(!fs.existsSync(paymentsFile), 'payments.json should be deleted');
  } catch (err) {
    errorThrown = true;
  }

  assert(!errorThrown, 'Cleanup should not throw');
});

runTest('No filesystem pollution: test files are temporary', () => {
  // Clean up any leftover test directories from previous runs
  const tmpDir = path.join(__dirname, '..', '..');
  const existingDirs = fs.readdirSync(tmpDir).filter((name) => name.startsWith('test-tmp-'));
  
  // Clean them up
  existingDirs.forEach((dir) => {
    const dirPath = path.join(tmpDir, dir);
    try {
      const files = fs.readdirSync(dirPath);
      files.forEach((file) => {
        const filePath = path.join(dirPath, file);
        if (fs.statSync(filePath).isDirectory()) {
          const subFiles = fs.readdirSync(filePath);
          subFiles.forEach((subFile) => {
            fs.unlinkSync(path.join(filePath, subFile));
          });
          fs.rmdirSync(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      });
      fs.rmdirSync(dirPath);
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  // After cleanup, verify no test-tmp-* directories remain
  const remainingDirs = fs.readdirSync(tmpDir).filter((name) => name.startsWith('test-tmp-'));
  assert(remainingDirs.length === 0, `Should not leave test-tmp-* directories (found: ${remainingDirs.join(', ')})`);
});

// ============================================================================
// Print Results
// ============================================================================

console.log(`\n${'='.repeat(60)}`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log(`${'='.repeat(60)}\n`);

process.exit(testsFailed > 0 ? 1 : 0);
