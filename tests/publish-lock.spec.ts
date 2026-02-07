import { test, expect } from '@playwright/test';

// Use a bypass header token for tests when running without JWT_SECRET.
// The backend accepts `ADMIN_BYPASS_TOKEN` (or default 'TEST_ADMIN_BYPASS')
// when NODE_ENV !== 'production'.
const makeAdminToken = () => process.env.ADMIN_BYPASS_TOKEN || 'TEST_ADMIN_BYPASS';

test.describe('Publish lock behavior', () => {
  test('published event rejects modifications and deletion', async ({ request }) => {
    const token = makeAdminToken();
    const apiBase = process.env.PLAYWRIGHT_API_BASE || 'http://localhost:4000';

    // 1) Create event
    const createRes = await request.post(`${apiBase}/admin/events`, {
      data: {
        title: 'Publish Lock Test',
        description: 'Testing publish locks',
        date: '2026-12-01',
        imageUrl: 'https://picsum.photos/800/600',
      },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    expect(created.id).toBeTruthy();

    const eventId = created.id as string;

    // 2) Add tables (update event)
    const tables = [
      { id: 't1', number: 1, seatsTotal: 6, seatsAvailable: 6, centerX: 10, centerY: 10, shape: 'round' },
    ];
    const updRes = await request.put(`${apiBase}/admin/events/${encodeURIComponent(eventId)}`, {
      data: { title: 'Publish Lock Test', description: 'With tables', date: '2026-12-01', tables },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(updRes.ok()).toBeTruthy();

    // 3) Publish the event (draft -> published)
    const pubRes = await request.post(`${apiBase}/admin/events/${encodeURIComponent(eventId)}/publish`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pubRes.status()).toBe(200);

    // 3b) Second publish attempt should return 409
    const pubAgainRes = await request.post(`${apiBase}/admin/events/${encodeURIComponent(eventId)}/publish`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pubAgainRes.status()).toBe(409);

    // 4) Admin can GET published event
    const getRes = await request.get(`${apiBase}/admin/events/${encodeURIComponent(eventId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.id).toBe(eventId);
    expect(getBody.status).toBe('published');
    expect(getBody.imageUrl).toBeTruthy();
    expect(getBody.schemaImageUrl).toBeTruthy();
    expect(Array.isArray(getBody.tables)).toBeTruthy();
    expect(getBody.tables.length).toBe(1);
    expect(getBody.tables[0].seatsTotal).toBe(6);
    expect(getBody.tables[0].seatsAvailable).toBe(6);

    // 5) Attempt to modify tables -> expect 403
    const modifyRes = await request.put(`${apiBase}/admin/events/${encodeURIComponent(eventId)}`, {
      data: { title: 'Attempt modify after publish', description: 'Should be rejected', date: '2026-12-01', tables: [] },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(modifyRes.status()).toBe(403);
    const modifyBody = await modifyRes.json().catch(() => ({}));
    expect(modifyBody.error).toBeTruthy();

    // 6) Attempt to delete -> expect 403
    const delRes = await request.delete(`${apiBase}/admin/events/${encodeURIComponent(eventId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status()).toBe(403);
    const delBody = await delRes.json().catch(() => ({}));
    expect(delBody.error).toBeTruthy();
  });
});
