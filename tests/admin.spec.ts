import { test, expect } from '@playwright/test';

// NOTE: Admin UI tests are disabled by default to avoid running UI/browser
// orchestration during normal or CI test runs. This file will be skipped
// unless `RUN_UI_TESTS` is set to '1' in the environment. This preserves
// the tests in-place while isolating them from default Playwright runs.
//
// To run these UI tests locally or in a dedicated UI job, set:
//
//   RUN_UI_TESTS=1 npx playwright test tests/admin.spec.ts
//
const runUi = process.env.RUN_UI_TESTS === '1';
test.skip(!runUi, 'Admin UI tests are disabled by default. Set RUN_UI_TESTS=1 to run them.');

// Helper to create a fake JWT with payload
function makeToken(payload: Record<string, unknown>) {
  const hdr = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${hdr}.${p}.x`;
}

test.describe('Admin UI smoke', () => {
  test('admin can create and delete table on schema', async ({ page, baseURL }) => {
    // inject admin token before page load
    const token = makeToken({ role: 'admin', id: 'admin' });
    await page.addInitScript((t) => {
      try { sessionStorage.setItem('eventseatbot_jwt', t); } catch {}
    }, token);

    await page.goto('/');

    // Wait for admin header
    await expect(page.locator('text=Admin — Events')).toBeVisible();

    // Click New Event
    await page.click('button:has-text("New Event")');

    // Fill form
    await page.fill('input[placeholder=""] >> nth=0', ''); // noop to ensure form ready
    await page.fill('input', 'Test Event');
    await page.fill('textarea', 'Test description for admin event');
    await page.fill('input[placeholder="YYYY-MM-DD"]', '2026-12-01');
    // Image URL input (labelled Image URL)
    await page.fill('input[aria-label="Image URL"], input[role="textbox"]', 'https://picsum.photos/800/600').catch(() => {});
    // fallback: find by label text
    await page.fill('label:has-text("Image URL") input', 'https://picsum.photos/800/600').catch(() => {});

    // Set Payment Phone
    await page.fill('label:has-text("Payment Phone") input', '70000000000').catch(() => {});

    // Save
    await page.click('button:has-text("Save")');

    // Wait for events list to include our event
    await expect(page.locator('text=Test Event')).toBeVisible();

    // Open Layout (click Layout button)
    await page.click('button:has-text("Layout")');

    // Ensure markup modal visible
    await expect(page.locator('text=Layout Markup')).toBeVisible();

    // Handle dialogs for prompts: first table number, then seats count
    let promptCalls = 0;
    page.on('dialog', async (dialog) => {
      promptCalls++;
      if (promptCalls === 1) await dialog.accept('1');
      else if (promptCalls === 2) await dialog.accept('6');
      else await dialog.dismiss();
    });

    // Click image to add table
    await page.click('img[alt="layout"]');

    // assert overlay with table number visible
    await expect(page.locator('text=1')).toBeVisible();

    // Delete table (click ✕ button)
    await page.click('button:has-text("✕")');

    // assert table number no longer visible
    await expect(page.locator('text=1')).not.toBeVisible();
  });
});
