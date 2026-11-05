import { readFileSync } from 'node:fs';
import { test, expect } from './helpers.mjs';

const journal = JSON.parse(readFileSync(new URL('../../data/journal.json', import.meta.url)));
const perDay = journal.trades.reduce((m, t) => m.set(t.closeTime.slice(0, 10), (m.get(t.closeTime.slice(0, 10)) ?? 0) + 1), new Map());

test.beforeEach(async ({ page }) => {
  await page.goto('/journal/');
});

test('the challenge panel shows progress and the $100 rule', async ({ page }) => {
  const goal = page.locator('.journal-goal');
  await expect(goal).toContainText('challenge');
  await expect(goal).toContainText('at least $100');
  await expect(goal).toContainText('cent account');
  const width = await goal.locator('.journal-goal__bar span').evaluate((el) => parseFloat(el.style.width));
  expect(width).toBeGreaterThanOrEqual(0);
  expect(width).toBeLessThanOrEqual(100);
});

test('the calendar shows each trading day and links to its phone view', async ({ page }) => {
  const [day] = [...perDay.keys()].sort().slice(-1);
  const cell = page.locator(`.cal__link[href="#day-${day}"]`);
  await expect(cell).toHaveCount(1);
  await cell.click();
  await expect(page).toHaveURL(new RegExp(`#day-${day}$`));
  await expect(page.locator(`#day-${day}`)).toBeInViewport();
});

test('every phone view lists every trade of its day, fully visible', async ({ page }) => {
  for (const [day, count] of perDay) {
    const phone = page.locator(`#day-${day}`);
    await expect(phone.locator('.mt5__row').filter({ hasText: 'XAUUSD' })).toHaveCount(count);
    const clipped = await phone.locator('.phone__screen').evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(clipped, day).toBe(false);
  }
  await expect(page.locator('.phone figcaption').first()).toContainText('Not a screenshot');
});

test('statistics are our own: no third-party brand named', async ({ page }) => {
  await expect(page.locator('#stats h2')).toHaveText('Performance, risk and activity');
  const text = await page.locator('main, body').first().innerText();
  expect(text).not.toMatch(/myfxbook/i);
  expect(text).not.toMatch(/MQL5 Signals/);
});

test('the trade list shows the most recent closed trades', async ({ page }) => {
  const rows = page.locator('#trades table.journal-trades').last().locator('tbody tr');
  await expect(rows).toHaveCount(Math.min(50, journal.trades.length));
});

test('why ProCent shows live swap and commission from the account', async ({ page }) => {
  const why = page.locator('#why-procent');
  await expect(why).toContainText('Commission paid');
  await expect(why).toContainText('Swap paid');
  await expect(why.getByRole('link', { name: 'Open a RoboForex ProCent account' })).toHaveAttribute('href', /a=vbes/);
});
