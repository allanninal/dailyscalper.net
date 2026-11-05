import { test, expect } from './helpers.mjs';

test('the main navigation reaches the journal on every screen size', async ({ page }) => {
  await page.goto('/');
  const inline = page.locator('.masthead__inner > nav');
  const menu = page.locator('details.menu');
  if ((page.viewportSize()?.width ?? 0) > 800) {
    await expect(inline).toBeVisible();
    await expect(menu).toBeHidden();
    await inline.getByRole('link', { name: 'Journal' }).click();
  } else {
    await expect(inline).toBeHidden();
    await menu.locator('summary').click();
    const link = menu.getByRole('link', { name: 'Journal' });
    await expect(link).toBeVisible();
    await expect(link).toBeInViewport();
    await link.click();
  }
  await expect(page).toHaveURL(/\/journal\/$/);
  await expect(page.locator('h1')).toContainText('$16 to $100');
});

test('the homepage promotes the challenge', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('#challenge');
  await expect(card).toContainText('From $16 to $100');
  await expect(card).toContainText('minimum RoboForex requires');
  await card.getByRole('link', { name: 'Open the journal' }).click();
  await expect(page).toHaveURL(/\/journal\/$/);
});

test('every RoboForex link carries the vbes partner code', async ({ page }) => {
  for (const path of ['/', '/journal/', '/rankings/', '/partners/', '/tools/', '/methodology/']) {
    await page.goto(path);
    const bad = await page.$$eval('a[href*="roboforex.com"], a[href*="rinfinity.com"]', (as) =>
      as.map((a) => a.href).filter((h) => !/[?&]a=vbes(&|$)/.test(h))
    );
    expect(bad, path).toEqual([]);
  }
});

test('every LiteFinance link carries the partner uid', async ({ page }) => {
  for (const path of ['/', '/rankings/', '/partners/']) {
    await page.goto(path);
    const bad = await page.$$eval('a[href*="litefinance."]', (as) => as.map((a) => a.href).filter((h) => !/[?&]uid=135262069(&|$)/.test(h)));
    expect(bad, path).toEqual([]);
  }
});

test('the partners page explains earning without depositing', async ({ page }) => {
  await page.goto('/partners/');
  await expect(page.locator('h1')).toContainText('Earn without depositing');
  // LiteFinance pays 30% below its volume threshold; never present 70% as flat.
  await expect(page.locator('body')).toContainText('30–70%');
  const faq = page.locator('details.faq').first();
  await faq.locator('summary').click();
  await expect(faq.locator('p')).toBeVisible();
  await expect(page.getByRole('link', { name: 'RoboForex partner programme' })).toHaveAttribute('href', /partner-program\/\?a=vbes/);
});
