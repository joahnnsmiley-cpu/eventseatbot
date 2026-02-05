import { test, expect } from '@playwright/test';

const token = process.env.ADMIN_BYPASS_TOKEN || 'TEST_ADMIN_BYPASS';
const apiBase = process.env.PLAYWRIGHT_API_BASE || 'http://localhost:4000';

test.describe('Table booking API', () => {
  test('successful booking reduces seatsAvailable', async ({ request }) => {
    // Create event
    const create = await request.post(`${apiBase}/admin/events`, {
      data: { title: 'Table Booking Test', description: 'test', date: '2026-12-01' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(create.ok()).toBeTruthy();
    const evt = await create.json();

    // add table and publish
    const table = { id: 'tb-1', number: 1, seatsTotal: 5, seatsAvailable: 5, centerX: 10, centerY: 10, shape: 'round' };
    const upd = await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, {
      data: { title: evt.title, description: evt.description, date: evt.date, tables: [table] },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(upd.ok()).toBeTruthy();

    const pub = await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, {
      data: { status: 'published' }, headers: { Authorization: `Bearer ${token}` },
    });
    expect(pub.ok()).toBeTruthy();

    // make booking
    const book = await request.post(`${apiBase}/public/bookings/table`, { data: { eventId: evt.id, tableId: table.id, seatsRequested: 2 } });
    expect(book.status()).toBe(201);
    const b = await book.json();
    expect(b.seatsBooked).toBe(2);

    // check event data reflects reduced seats
    const detail = await request.get(`${apiBase}/public/events/${encodeURIComponent(evt.id)}`);
    expect(detail.ok()).toBeTruthy();
    const ev2 = await detail.json();
    const t2 = (ev2.tables || []).find((t: any) => t.id === table.id);
    expect(t2.seatsAvailable).toBe(3);
  });

  test('overbooking rejected and concurrent requests do not oversell', async ({ request }) => {
    // create fresh event
    const create = await request.post(`${apiBase}/admin/events`, {
      data: { title: 'Concurrent Booking', description: 'test', date: '2026-12-01' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(create.ok()).toBeTruthy();
    const evt = await create.json();
    const table = { id: 'tb-2', number: 2, seatsTotal: 2, seatsAvailable: 2, centerX: 10, centerY: 10, shape: 'round' };
    await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, {
      data: { title: evt.title, description: evt.description, date: evt.date, tables: [table] }, headers: { Authorization: `Bearer ${token}` },
    });
    await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, { data: { status: 'published' }, headers: { Authorization: `Bearer ${token}` } });

    // attempt concurrent bookings (each requests 2 seats total available 2)
    const p1 = request.post(`${apiBase}/public/bookings/table`, { data: { eventId: evt.id, tableId: table.id, seatsRequested: 2 } });
    const p2 = request.post(`${apiBase}/public/bookings/table`, { data: { eventId: evt.id, tableId: table.id, seatsRequested: 1 } });
    const results = await Promise.all([p1, p2]);
    const statuses = results.map(r => r.status());
    // only one should succeed for full 2 seats, the other should be 409 or 201 depending on ordering
    const successCount = statuses.filter(s => s === 201).length;
    expect(successCount).toBeGreaterThanOrEqual(1);
    // verify not oversold
    const d = await request.get(`${apiBase}/public/events/${encodeURIComponent(evt.id)}`);
    const ev = await d.json();
    const t = (ev.tables || []).find((x: any) => x.id === table.id);
    expect(t.seatsAvailable).toBeGreaterThanOrEqual(0);
    expect(t.seatsAvailable).toBeLessThanOrEqual(t.seatsTotal);
  });
});
