import { test, expect, PAGES, overflowReport } from './helpers.mjs';

for (const path of PAGES) {
  test(`${path} fits the screen with nothing cut off`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res.status()).toBeLessThan(400);
    await expect(page.locator('h1')).toBeVisible();
    expect(await overflowReport(page)).toEqual([]);
  });
}

test('chart labels stay readable on every screen', async ({ page }) => {
  await page.goto('/journal/');
  const sizes = await page.locator('.journal-chart__axis span, .journal-chart__dates span').evaluateAll((els) =>
    els.map((e) => parseFloat(getComputedStyle(e).fontSize))
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const px of sizes) expect(px).toBeGreaterThanOrEqual(11);
  expect(await page.locator('.journal-chart svg text').count()).toBe(0);
});

test('text stays readable: nothing renders below 9px', async ({ page }) => {
  await page.goto('/journal/');
  const tiny = await page.evaluate(() =>
    [...document.querySelectorAll('p, td, li, dd, a, span')]
      .filter((el) => el.offsetParent && el.textContent.trim() && !el.closest('.phone'))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 9)
      .map((el) => el.textContent.trim().slice(0, 30))
  );
  expect(tiny).toEqual([]);
});

test('the overflow check itself catches a too-wide element', async ({ page }) => {
  await page.goto('/journal/');
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.minWidth = '4000px';
    d.style.height = '10px';
    document.querySelector('#stats .wrap').appendChild(d);
  });
  expect((await overflowReport(page)).length).toBeGreaterThan(0);
});
