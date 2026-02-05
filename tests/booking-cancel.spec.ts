import { test, expect } from '@playwright/test';

const token = process.env.ADMIN_BYPASS_TOKEN || 'TEST_ADMIN_BYPASS';
const apiBase = process.env.PLAYWRIGHT_API_BASE || 'http://localhost:4000';

test.describe('Booking cancellation API', () => {
  test('cancelling booking restores seatsAvailable', async ({ request }) => {
    // create event + table + publish
    const create = await request.post(`${apiBase}/admin/events`, { data: { title: 'Cancel Test', description: 't', date: '2026-12-01', imageUrl: 'https://example.com/schema.png' }, headers: { Authorization: `Bearer ${token}` } });
    expect(create.ok()).toBeTruthy();
    const evt = await create.json();
    const table = { id: 'c-t1', number: 1, seatsTotal: 4, seatsAvailable: 4, centerX: 10, centerY: 10, shape: 'round' };
    await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, { data: { title: evt.title, description: evt.description, date: evt.date, tables: [table] }, headers: { Authorization: `Bearer ${token}` } });
    await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, { data: { status: 'published' }, headers: { Authorization: `Bearer ${token}` } });

    // book 2 seats
    const book = await request.post(`${apiBase}/public/bookings/table`, { data: { eventId: evt.id, tableId: table.id, seatsRequested: 2 } });
    expect(book.status()).toBe(201);
    const b = await book.json();
    expect(b.id).toBeTruthy();

    // cancel
    const cancel = await request.post(`${apiBase}/public/bookings/${encodeURIComponent(b.id)}/cancel`);
    expect(cancel.status()).toBe(200);

    // verify seats restored
    const detail = await request.get(`${apiBase}/public/events/${encodeURIComponent(evt.id)}`);
    const ev2 = await detail.json();
    const t = (ev2.tables || []).find((x: any) => x.id === table.id);
    expect(t.seatsAvailable).toBe(4);
  });

  test('double-cancel is rejected', async ({ request }) => {
    const create = await request.post(`${apiBase}/admin/events`, { data: { title: 'Double Cancel', description: 't', date: '2026-12-01', imageUrl: 'https://example.com/schema.png' }, headers: { Authorization: `Bearer ${token}` } });
    expect(create.ok()).toBeTruthy();
    const evt = await create.json();
    const table = { id: 'c-t2', number: 2, seatsTotal: 3, seatsAvailable: 3, centerX: 10, centerY: 10, shape: 'round' };
    await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, { data: { title: evt.title, description: evt.description, date: evt.date, tables: [table] }, headers: { Authorization: `Bearer ${token}` } });
    await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, { data: { status: 'published' }, headers: { Authorization: `Bearer ${token}` } });

    const book = await request.post(`${apiBase}/public/bookings/table`, { data: { eventId: evt.id, tableId: table.id, seatsRequested: 1 } });
    expect(book.status()).toBe(201);
    const b = await book.json();

    const c1 = await request.post(`${apiBase}/public/bookings/${encodeURIComponent(b.id)}/cancel`);
    expect(c1.status()).toBe(200);
    const c2 = await request.post(`${apiBase}/public/bookings/${encodeURIComponent(b.id)}/cancel`);
    expect(c2.status()).toBe(409);
  });

  test('concurrent cancel and book do not corrupt seatsAvailable', async ({ request }) => {
    const create = await request.post(`${apiBase}/admin/events`, { data: { title: 'Race', description: 't', date: '2026-12-01', imageUrl: 'https://example.com/schema.png' }, headers: { Authorization: `Bearer ${token}` } });
    const evt = await create.json();
    const table = { id: 'c-t3', number: 3, seatsTotal: 2, seatsAvailable: 2, centerX: 10, centerY: 10, shape: 'round' };
    await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, { data: { title: evt.title, description: evt.description, date: evt.date, tables: [table] }, headers: { Authorization: `Bearer ${token}` } });
    await request.put(`${apiBase}/admin/events/${encodeURIComponent(evt.id)}`, { data: { status: 'published' }, headers: { Authorization: `Bearer ${token}` } });

    // make a booking of 2 seats
    const book = await request.post(`${apiBase}/public/bookings/table`, { data: { eventId: evt.id, tableId: table.id, seatsRequested: 2 } });
    expect(book.status()).toBe(201);
    const b = await book.json();

    // concurrently cancel and try to book 1 seat
    const pCancel = request.post(`${apiBase}/public/bookings/${encodeURIComponent(b.id)}/cancel`);
    const pBook = request.post(`${apiBase}/public/bookings/table`, { data: { eventId: evt.id, tableId: table.id, seatsRequested: 1 } });
    const [rCancel, rBook] = await Promise.all([pCancel, pBook]);
    // one of these can succeed depending on ordering, but seatsAvailable must remain consistent
    const d = await request.get(`${apiBase}/public/events/${encodeURIComponent(evt.id)}`);
    const ev2 = await d.json();
    const t = (ev2.tables || []).find((x: any) => x.id === table.id);
    expect(t.seatsAvailable).toBeGreaterThanOrEqual(0);
    expect(t.seatsAvailable).toBeLessThanOrEqual(t.seatsTotal);
  });
});
