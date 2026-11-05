import { test as base } from '@playwright/test';

export const PAGES = [
  '/', '/journal/', '/rankings/', '/rankings/daily/', '/rankings/weekly/', '/rankings/monthly/',
  '/rankings/all-time/', '/methodology/', '/partners/', '/tools/', '/blog/', '/blog/day-026-drawdown/', '/404.html',
];

/** Only the local site loads: ads, analytics and fonts are blocked so runs are repeatable. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (r) => r.abort());
    await use(page);
  },
});
export { expect } from '@playwright/test';

/** Everything that overflows: the page itself, side-scrolling boxes, clipped boxes, off-screen elements. */
export function overflowReport(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]}`;
    const scrollsX = (el) => ['auto', 'scroll', 'hidden'].includes(getComputedStyle(el).overflowX);
    const out = [];
    if (document.documentElement.scrollWidth > vw) out.push(`page ${document.documentElement.scrollWidth}px wide in ${vw}px`);
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('ins, iframe, script, style')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      if (el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(cs.overflowX)) out.push(`side-scroll ${name(el)}`);
      if (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1 && ['auto', 'scroll', 'hidden'].includes(cs.overflowY)) out.push(`clipped ${name(el)}`);
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && cs.position !== 'fixed') {
        let p = el.parentElement;
        while (p && !scrollsX(p)) p = p.parentElement;
        if (!p) out.push(`off-screen ${name(el)}`);
      }
    }
    return [...new Set(out)];
  });
}
