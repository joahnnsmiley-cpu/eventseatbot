/**
 * Data Reset Utility for Local Development
 * Clears all data from database files while preserving structure
 *
 * Usage: npx ts-node src/scripts/resetData.ts
 */

import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(__dirname, '..', '..', 'data.json');
const PAYMENTS_FILE = path.join(__dirname, '..', '..', 'data', 'payments.json');

interface Database {
  events: any[];
  bookings: any[];
  admins?: any[];
}

interface PaymentsData {
  payments: any[];
}

/**
 * Reset data.json - clears events and bookings
 */
function resetDatabase(): void {
  try {
    // Read current file to preserve structure
    let database: Database = {
      events: [],
      bookings: [],
    };

    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const existing = JSON.parse(content);
      
      // Preserve admins if they exist
      if (existing.admins && Array.isArray(existing.admins)) {
        database.admins = existing.admins;
      }
    }

    // Write atomically
    const tempFile = DATA_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(database, null, 2));
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.error('Error resetting database:', err);
    throw err;
  }
}

/**
 * Reset payments.json - clears payments array
 */
function resetPayments(): void {
  try {
    const paymentsDir = path.dirname(PAYMENTS_FILE);

    // Ensure directory exists
    if (!fs.existsSync(paymentsDir)) {
      fs.mkdirSync(paymentsDir, { recursive: true });
    }

    // Create empty payments structure
    const paymentsData: PaymentsData = {
      payments: [],
    };

    // Write atomically
    const tempFile = PAYMENTS_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(paymentsData, null, 2));
    fs.renameSync(tempFile, PAYMENTS_FILE);
  } catch (err) {
    console.error('Error resetting payments:', err);
    throw err;
  }
}

/**
 * Main reset function
 */
function main(): void {
  // Guard: Prevent running in production
  if (process.env.NODE_ENV === 'production') {
    console.error('Error: Cannot reset data in production environment');
    process.exit(1);
  }

  try {
    resetDatabase();
    resetPayments();
    console.log('Data reset completed');
    process.exit(0);
  } catch (err) {
    console.error('Failed to reset data:', err);
    process.exit(1);
  }
}

main();
