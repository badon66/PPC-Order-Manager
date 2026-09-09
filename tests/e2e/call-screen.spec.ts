import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The seven checks from docs/call-view-prompt.md, at 3440×1440, against a
 * fresh list built from the sample sheet. Serial: each test leaves the
 * screen where the next one expects it.
 */
test.describe.configure({ mode: 'serial' });

const CODE = process.env.ADMIN_ACCESS_CODE ?? (existsSync('admin-code.txt') ? readFileSync('admin-code.txt', 'utf8').trim() : '');
let listId = '';

async function unlock(page: Page) {
  await page.goto('/sales');
  if (page.url().includes('/unlock')) {
    await page.locator('input[type="password"]').fill(CODE);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForURL(/\/sales/);
  }
}

async function openCall(page: Page) {
  await unlock(page);
  await page.goto(`/sales/${listId}/call`);
  await expect(page.getByTestId('call-columns')).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await unlock(page);
  await page.getByPlaceholder(/Beer league/).fill('E2E ultrawide');
  await page.getByRole('button', { name: 'Create list' }).click();
  await page.waitForURL(/\/sales\/[0-9a-f-]{36}$/);
  listId = page.url().split('/').pop()!;
  await page.locator('input[type="file"]').setInputFiles('tests/sales/fixtures/sample-list.xlsx');
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText(/4 added/)).toBeVisible();
  await page.close();
});

test('the page does not scroll and all four columns span the screen', async ({ page }) => {
  await openCall(page);
  const m = await page.evaluate(() => {
    const cols = ['col-contact', 'col-script', 'col-objections', 'col-outcome'].map((t) => {
      const r = document.querySelector(`[data-testid=${t}]`)!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    });
    return { noScroll: document.documentElement.scrollHeight <= window.innerHeight, innerHeight: window.innerHeight, innerWidth: window.innerWidth, cols };
  });
  expect(m.noScroll, `scrollHeight must fit in ${m.innerHeight}`).toBe(true);
  for (const c of m.cols) {
    expect(c.width).toBeGreaterThan(300);
    expect(c.bottom).toBeLessThanOrEqual(m.innerHeight + 1);
  }
  const spanned = Math.max(...m.cols.map((c) => c.right)) - Math.min(...m.cols.map((c) => c.left));
  expect(spanned).toBeGreaterThan(m.innerWidth * 0.9);
});

test('Opening collapses and Discovery takes the space', async ({ page }) => {
  await openCall(page);
  const before = await page.getByTestId('discovery-q1').boundingBox();
  await expect(page.getByTestId('opening-body')).toBeVisible();
  await page.getByTestId('opening-toggle').click();
  await expect(page.getByTestId('opening-body')).toBeHidden();
  await expect(page.getByLabel('Opening done')).toBeVisible();
  const after = await page.getByTestId('discovery-q1').boundingBox();
  expect(after!.y).toBeLessThan(before!.y);
  await page.getByTestId('opening-toggle').click();
  await expect(page.getByTestId('opening-body')).toBeVisible();
});

test('an objection chip expands its response and collapses again', async ({ page }) => {
  await openCall(page);
  const chips = page.getByTestId('objection-chips').getByRole('button');
  const count = await chips.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(8);
  const first = (await chips.first().textContent())!.trim();
  await chips.first().click();
  const open = page.getByTestId('objection-open');
  await expect(open).toBeVisible();
  await expect(open).toContainText(first);
  await expect(open.locator('p')).not.toHaveText('');
  await page.getByRole('button', { name: 'Back to objections' }).click();
  await expect(page.getByTestId('objection-chips')).toBeVisible();
});

test('each of the five questions records against the call log', async ({ page }) => {
  await openCall(page);
  const name = await page.locator('main h2').first().textContent();
  await page.getByTestId('discovery-q1').getByRole('button', { name: 'Them' }).click();
  await page.getByTestId('discovery-q2').getByRole('radio', { name: '1–2 yrs' }).click();
  await page.getByTestId('discovery-q3').getByRole('radio', { name: '4 stars' }).click();
  await page.getByTestId('discovery-q3').getByLabel('If you could change one thing').fill('lighter fabric');
  await page.getByTestId('discovery-q4').getByRole('button', { name: 'Full set' }).click();
  await page.getByTestId('discovery-q4').getByRole('button', { name: /Home/ }).click();
  await page.getByTestId('discovery-q5').getByRole('button', { name: /Turnaround/ }).click();
  await page.getByTestId('discovery-q5').getByRole('button', { name: /Price/ }).click();
  await page.locator('[data-outcome=send_info]').click();
  await expect(page.getByTestId('outcome-strip')).toBeVisible();
  await page.getByTestId('log-button').click();
  await expect(page.locator('main h2').first()).not.toHaveText(name!);
  // Back to the contact we just logged: the board shows the log, history shows the typed answers.
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.locator('main h2').first()).toHaveText(name!);
  await expect(page.getByTestId('outcome-board')).toContainText('Logged as');
  const history = page.getByTestId('col-outcome');
  await expect(history).toContainText('redone 1–2 yrs');
  await expect(history).toContainText('happy 4/5');
  await expect(history).toContainText('lighter fabric');
  await expect(history).toContainText('Full set (home)');
  await expect(history).toContainText('cares about Turnaround, also Price');
  await expect(history).toContainText('Handles the jerseys themselves');
});

test('Callback shows the follow-up strip; No answer does not', async ({ page }) => {
  await openCall(page);
  await expect(page.getByTestId('outcome-strip')).toHaveCount(0);
  await page.locator('[data-outcome=callback]').click();
  await expect(page.getByTestId('outcome-strip')).toBeVisible();
  await expect(page.getByTestId('outcome-strip')).toContainText('Call back on');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByTestId('outcome-strip')).toHaveCount(0);
});

test('one outcome click logs the call and advances the queue', async ({ page }) => {
  await openCall(page);
  const name = await page.locator('main h2').first().textContent();
  const position = await page.getByTestId('queue-position').textContent();
  await page.locator('[data-outcome=no_answer]').click();
  await expect(page.getByTestId('outcome-strip')).toHaveCount(0);
  await expect(page.locator('main h2').first()).not.toHaveText(name!);
  await expect(page.getByTestId('queue-position')).not.toHaveText(position!);
  await expect(page.getByTestId('col-outcome')).toContainText('Calls');
});
