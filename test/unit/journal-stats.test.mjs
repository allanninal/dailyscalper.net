import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { journalStats, overnight, journalPage, journalTeaser } from '../../scripts/build-journal.mjs';

const trade = (closeTime, profit, o = {}) => ({
  symbol: 'XAUUSD', side: 'buy', by: 'ea', volume: 0.01, openPrice: 4000, closePrice: 4001, exit: 'tp',
  openTime: new Date(Date.parse(closeTime) - 3_600_000).toISOString().replace('.000', ''),
  closeTime, profit, swap: 0, commission: 0, ...o,
});
const journal = (trades, cashflow, extra = {}) => ({
  syncedAt: '2026-11-10T00:00:00Z',
  account: { broker: 'RoboForex', platform: 'MetaTrader 5', type: 'real', margin: 'hedging', unit: 'USC', balance: 0, equity: 0, floating: 0, serverUtcOffsetMinutes: 120 },
  trades, cashflow, openPositions: [], ...extra,
});
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const sample = journal(
  [
    trade('2026-11-03T10:00:00Z', 100),
    trade('2026-11-04T10:00:00Z', -110, { side: 'sell', exit: 'sl' }),
    trade('2026-11-05T10:00:00Z', 50),
  ],
  [{ time: '2026-11-02T00:00:00Z', kind: 'balance', amount: 1000 }]
);

test('gain compounds each trade on the balance before it', () => {
  const s = journalStats(sample);
  // 1.10 × 0.90 × (1 + 50/990) = 1.04
  close(s.gainPct, 4, 1e-9);
  assert.equal(s.net, 40);
  assert.equal(s.balance, 1040);
  close(s.absGainPct, 4);
});

test('a deposit does not count as gain', () => {
  const withTopUp = journal(
    [trade('2026-11-03T10:00:00Z', 100), trade('2026-11-04T10:00:00Z', -110), trade('2026-11-06T10:00:00Z', 99.5)],
    [
      { time: '2026-11-02T00:00:00Z', kind: 'balance', amount: 1000 },
      { time: '2026-11-05T00:00:00Z', kind: 'balance', amount: 1000 },
    ]
  );
  const s = journalStats(withTopUp);
  close(s.gainPct, (1.1 * 0.9 * 1.05 - 1) * 100); // 99.5 / 1990 = 5%
  assert.equal(s.deposits, 2000);
});

test('drawdown is peak to trough, in percent and in cents', () => {
  const s = journalStats(sample);
  close(s.maxDdPct, 10);
  close(s.maxDdAbs, 110);
});

test('trade statistics', () => {
  const s = journalStats(sample);
  assert.equal(s.count, 3);
  close(s.winRate, 200 / 3);
  close(s.profitFactor, 150 / 110);
  close(s.expectancy, 40 / 3);
  assert.equal(s.best, 100);
  assert.equal(s.worst, -110);
  assert.equal(s.avgWin, 75);
  assert.equal(s.avgLoss, -110);
  assert.deepEqual(s.longs, { count: 2, won: 2 });
  assert.deepEqual(s.shorts, { count: 1, won: 0 });
  assert.equal(s.algoPct, 100);
  close(s.recovery, 40 / 110);
  assert.equal(s.tradingDays, 3);
  close(s.avgHold, 3_600_000);
});

test('streaks count trades and the money in them', () => {
  const s = journalStats(
    journal(
      [10, 20, -5, -6, -7, 30].map((p, i) => trade(`2026-11-0${i + 3}T10:00:00Z`, p)),
      [{ time: '2026-11-01T00:00:00Z', kind: 'balance', amount: 1000 }]
    )
  );
  assert.equal(s.maxWinRun, 2);
  assert.equal(s.maxWinRunSum, 30);
  assert.equal(s.maxLossRun, 3);
  assert.equal(s.maxLossRunSum, -18);
});

test('an empty journal does not throw and reports no ratios', () => {
  const s = journalStats(journal([], [{ time: '2026-11-02T00:00:00Z', kind: 'balance', amount: 1600 }]));
  assert.equal(s.count, 0);
  assert.equal(s.profitFactor, null);
  assert.equal(s.winRate, null);
  assert.ok(journalPage(journal([], [{ time: '2026-11-02T00:00:00Z', kind: 'balance', amount: 1600 }])).includes('</html>'));
});

test('overnight counts trades held through server midnight', () => {
  const t = [
    { openTime: '2026-11-03T19:00:00Z', closeTime: '2026-11-03T22:09:00Z' }, // crosses 22:00 UTC = 00:00 server
    { openTime: '2026-11-03T13:00:00Z', closeTime: '2026-11-03T14:00:00Z' },
    { openTime: '2026-11-03T23:00:00Z', closeTime: '2026-11-04T01:00:00Z' }, // same server day
  ];
  assert.equal(overnight(t, 120).length, 1);
  assert.equal(overnight(t, 0).length, 1); // only the third crosses UTC midnight
});

test('the live data reconciles: deposits + net profit = reported balance', () => {
  const j = JSON.parse(readFileSync(new URL('../../data/journal.json', import.meta.url)));
  const s = journalStats(j);
  close(s.balance, j.account.balance, 0.005);
});

test('the page is a pure function of its data', () => {
  assert.equal(journalPage(sample), journalPage(sample));
  assert.equal(journalTeaser(sample), journalTeaser(sample));
});

test('the page states the $100 rule and names no third-party analytics brand', () => {
  const html = journalPage(sample);
  assert.match(html, /at least \$100/);
  assert.doesNotMatch(html, /myfxbook/i);
  assert.doesNotMatch(html, /MQL5 Signals|MQL5 would/);
});

test('every phone day lists every trade of that day', () => {
  const html = journalPage(sample);
  for (const day of ['2026-11-03', '2026-11-04', '2026-11-05']) {
    const phone = html.split(`id="day-${day}"`)[1].split('</figure>')[0];
    assert.equal((phone.match(/class="mt5__row"/g) ?? []).length, 1, day);
  }
  assert.match(html, /Not a screenshot/);
});

test('challenge progress runs from the first deposit to the goal', () => {
  const j = journal([trade('2026-11-03T10:00:00Z', 4200)], [{ time: '2026-11-02T00:00:00Z', kind: 'balance', amount: 1600 }]);
  // (5800 - 1600) / (10000 - 1600) = 50%
  assert.match(journalTeaser(j), /50\.0% · \$58 now/);
});
