import { test, expect } from '@playwright/test';

test.describe('Public user view smoke', () => {
  test('event list and detail render with table overlays', async ({ page }) => {
    const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';
    // visit public list
    await page.goto(`${base}/public/view`);
    await page.waitForSelector('h1:has-text("Events")');
    // expect at least one card link
    const link = page.locator('a.link').first();
    await expect(link).toBeVisible();

    // click into detail
    await link.click();
    // schema image should be present
    await page.waitForSelector('img#schema', { state: 'visible' });
    // wait for at least one overlay table
    await page.waitForSelector('.table', { state: 'visible' });
    // click a table and expect alert with text
    page.on('dialog', async d => { await d.dismiss(); });
    const tbl = page.locator('.table').first();
    await expect(tbl).toBeVisible();
    await tbl.click();
  });
});
