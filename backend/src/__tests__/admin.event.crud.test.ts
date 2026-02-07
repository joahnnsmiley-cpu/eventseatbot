/**
 * Smoke test for admin event CRUD via API calls only.
 * Run with: npx playwright test backend/src/__tests__/admin.event.crud.test.ts
 */

import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

const apiBase = process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:4000';
const adminBypassToken = process.env.ADMIN_BYPASS_TOKEN;
if (!adminBypassToken) {
  throw new Error('ADMIN_BYPASS_TOKEN is required for admin CRUD tests.');
}
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

test.describe('admin event CRUD (API only)', () => {
  test('create, update tables, publish, and verify persistence', async ({ request }) => {
    const dataFile = path.join(__dirname, '..', '..', 'data.json');
    const backupPath = `${dataFile}.bak-${Date.now()}`;
    const hasExisting = fs.existsSync(dataFile);

    await acquireLock();

    const runId = Date.now();
    const coverImageUrl = `https://example.com/cover-${runId}.jpg`;
    const schemaImageUrl = `https://example.com/schema-${runId}.jpg`;
    const title = `Admin CRUD Test Event ${runId}`;
    const description = 'Event created by admin CRUD smoke test';
    const date = new Date().toISOString();

    try {
      if (hasExisting) {
        fs.copyFileSync(dataFile, backupPath);
      }

      const createRes = await request.post(`${apiBase}/admin/events`, {
        headers: { Authorization: `Bearer ${adminBypassToken}` },
        data: {
          title,
          description,
          date,
          coverImageUrl,
          schemaImageUrl,
        },
      });

      expect(createRes.status()).toBe(201);
      const created = await createRes.json();
      expect(created?.id).toBeTruthy();
      const eventId = created.id as string;

      const tables = [
        {
          id: `tbl-${runId}-1`,
          number: 1,
          seatsTotal: 6,
          seatsAvailable: 6,
          centerX: 35,
          centerY: 42,
          shape: 'round',
        },
        {
          id: `tbl-${runId}-2`,
          number: 2,
          seatsTotal: 8,
          seatsAvailable: 8,
          centerX: 60,
          centerY: 58,
          shape: 'round',
        },
      ];

      const updateRes = await request.put(`${apiBase}/admin/events/${eventId}`, {
        headers: { Authorization: `Bearer ${adminBypassToken}` },
        data: {
          title,
          description,
          date,
          coverImageUrl,
          schemaImageUrl,
          tables,
        },
      });

      expect(updateRes.status()).toBe(200);

      const publishRes = await request.put(`${apiBase}/admin/events/${eventId}`, {
        headers: { Authorization: `Bearer ${adminBypassToken}` },
        data: {
          status: 'published',
        },
      });

      expect(publishRes.status()).toBe(200);

      const fetchRes = await request.get(`${apiBase}/admin/events/${eventId}`, {
        headers: { Authorization: `Bearer ${adminBypassToken}` },
      });
      expect(fetchRes.status()).toBe(200);
      const body = await fetchRes.json();
      console.log('[DEBUG ADMIN GET BODY]', JSON.stringify(body, null, 2));
      const event =
        body?.event ??
        body?.data?.event ??
        body?.events?.[0] ??
        body?.items?.[0] ??
        body;
      const resolvedCoverImageUrl = event?.coverImageUrl ?? event?.imageUrl;

      expect(event?.id).toBe(eventId);
      expect(resolvedCoverImageUrl).toBe(coverImageUrl);
      expect(event?.schemaImageUrl).toBe(schemaImageUrl);

      const persistedTables = Array.isArray(event?.tables) ? event.tables : [];
      expect(persistedTables.length).toBe(2);

      const byId = new Map<string, any>(persistedTables.map((t: any) => [t.id, t]));
      const first = byId.get(`tbl-${runId}-1`);
      const second = byId.get(`tbl-${runId}-2`);

      expect(first).toBeTruthy();
      expect(first.seatsTotal).toBe(6);
      expect(first.centerX).toBe(35);
      expect(first.centerY).toBe(42);

      expect(second).toBeTruthy();
      expect(second.seatsTotal).toBe(8);
      expect(second.centerX).toBe(60);
      expect(second.centerY).toBe(58);
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

  test('admin can read published event with full payload', async ({ request }) => {
    const dataFile = path.join(__dirname, '..', '..', 'data.json');
    const backupPath = `${dataFile}.bak-${Date.now()}`;
    const hasExisting = fs.existsSync(dataFile);

    await acquireLock();

    const runId = Date.now();
    const coverImageUrl = `https://example.com/cover-${runId}.jpg`;
    const schemaImageUrl = `https://example.com/schema-${runId}.jpg`;
    const title = `Admin Read After Publish ${runId}`;
    const description = 'Event created for admin read-after-publish test';
    const date = new Date().toISOString();

    try {
      if (hasExisting) {
        fs.copyFileSync(dataFile, backupPath);
      }

      const createRes = await request.post(`${apiBase}/admin/events`, {
        headers: { Authorization: `Bearer ${adminBypassToken}` },
        data: {
          title,
          description,
          date,
          coverImageUrl,
          schemaImageUrl,
        },
      });

      expect(createRes.status()).toBe(201);
      const created = await createRes.json();
      expect(created?.id).toBeTruthy();
      const eventId = created.id as string;

      const tables = [
        {
          id: `tbl-${runId}-1`,
          number: 1,
          seatsTotal: 6,
          seatsAvailable: 6,
          centerX: 20,
          centerY: 80,
          shape: 'round',
        },
      ];

      const updateRes = await request.put(`${apiBase}/admin/events/${eventId}`, {
        headers: { Authorization: `Bearer ${adminBypassToken}` },
        data: {
          title,
          description,
          date,
          coverImageUrl,
          schemaImageUrl,
          tables,
        },
      });

      expect(updateRes.status()).toBe(200);

      const publishRes = await request.put(`${apiBase}/admin/events/${eventId}`, {
        headers: { Authorization: `Bearer ${adminBypassToken}` },
        data: {
          status: 'published',
        },
      });

      expect(publishRes.status()).toBe(200);

      const fetchRes = await request.get(`${apiBase}/admin/events/${eventId}`, {
        headers: { Authorization: `Bearer ${adminBypassToken}` },
      });

      expect(fetchRes.status()).toBe(200);
      const payload = await fetchRes.json();
      const event = payload?.event ?? payload?.data ?? payload;
      const resolvedCoverImageUrl = event?.coverImageUrl ?? event?.imageUrl;

      expect(event?.id).toBe(eventId);
      expect(event?.title).toBe(title);
      expect(event?.description).toBe(description);
      expect(resolvedCoverImageUrl).toBe(coverImageUrl);
      expect(event?.schemaImageUrl).toBe(schemaImageUrl);

      const persistedTables = Array.isArray(event?.tables) ? event.tables : [];
      expect(persistedTables.length).toBe(1);
      expect(persistedTables[0].seatsTotal).toBe(6);
      expect(persistedTables[0].seatsAvailable).toBe(6);
      expect(persistedTables[0].centerX).toBe(20);
      expect(persistedTables[0].centerY).toBe(80);
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
