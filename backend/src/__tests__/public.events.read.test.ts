/**
 * Smoke test for public events read endpoint.
 * Run with: npx playwright test backend/src/__tests__/public.events.read.test.ts
 */

import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

const apiBase = process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:4000';
const lockFile = path.join(__dirname, '..', '..', 'data.json.test.lock');

async function acquireLock(retries = 40, delayMs = 250): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.closeSync(fd);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Failed to acquire data.json lock');
}

function releaseLock(): void {
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
  }
}

test.describe('public events read (API only)', () => {
  test('returns only published events with images and tables', async ({ request }) => {
    const dataFile = path.join(__dirname, '..', '..', 'data.json');
    const backupPath = `${dataFile}.bak-${Date.now()}`;
    const hasExisting = fs.existsSync(dataFile);

    await acquireLock();

    try {
      if (hasExisting) {
        fs.copyFileSync(dataFile, backupPath);
      }

      const runId = Date.now();
      const publishedEventId = `pub-${runId}`;
      const draftEventId = `draft-${runId}`;
      const coverImageUrl = `https://example.com/cover-${runId}.jpg`;
      const schemaImageUrl = `https://example.com/schema-${runId}.jpg`;

      const dbSeed = {
        events: [
          {
            id: publishedEventId,
            title: 'Published Event',
            description: 'Published event for public read test',
            date: new Date().toISOString(),
            imageUrl: coverImageUrl,
            schemaImageUrl,
            paymentPhone: '70000000000',
            maxSeatsPerBooking: 4,
            status: 'published',
            tables: [
              {
                id: `tbl-${runId}-1`,
                number: 1,
                seatsTotal: 6,
                seatsAvailable: 5,
                centerX: 40,
                centerY: 60,
                shape: 'round',
              },
            ],
          },
          {
            id: draftEventId,
            title: 'Draft Event',
            description: 'Draft event should not appear in public list',
            date: new Date().toISOString(),
            imageUrl: 'https://example.com/draft.jpg',
            schemaImageUrl: 'https://example.com/draft-schema.jpg',
            paymentPhone: '70000000000',
            maxSeatsPerBooking: 4,
            status: 'draft',
            tables: [],
          },
        ],
        bookings: [],
        admins: [],
      };

      fs.writeFileSync(dataFile, JSON.stringify(dbSeed, null, 2), 'utf-8');

      const res = await request.get(`${apiBase}/public/events`);
      expect(res.status()).toBe(200);
      const events = await res.json();

      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(1);
      expect(events[0].id).toBe(publishedEventId);

      const event = events[0];
      expect(event.coverImageUrl).toBe(coverImageUrl);
      expect(event.schemaImageUrl).toBe(schemaImageUrl);
      expect(Array.isArray(event.tables)).toBe(true);
      expect(event.tables.length).toBe(1);
      expect(event.tables[0].seatsAvailable).toBe(5);
    } finally {
      try {
        if (hasExisting && fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, dataFile);
          fs.unlinkSync(backupPath);
        } else if (!hasExisting && fs.existsSync(dataFile)) {
          fs.unlinkSync(dataFile);
        }
      } catch (err) {
        console.warn('Failed to restore data.json after test:', err);
      }
      releaseLock();
    }
  });
});
