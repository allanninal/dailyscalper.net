/**
 * Single source of truth for affiliate links and ranking rules.
 * Change values here — nothing else in the codebase hardcodes them.
 */

export const AFFILIATE = {
  // RoboForex partner code, appended as ?a=<code>
  roboforex: 'vbes',

  // LiteFinance partner id, appended as ?uid=<id>.
  litefinanceUid: '135262069',
};

export const LINKS = {
  roboforexStrategy: (sourceId, login) =>
    `https://roboforex.com/ph/copy-trading/rating/${sourceId}/${login}/?a=${AFFILIATE.roboforex}`,
  roboforexSignup: () => `https://my.roboforex.com/en/?a=${AFFILIATE.roboforex}`,
  litefinanceTrader: (id) =>
    `https://my.litefinance.org/traders/info?id=${id}` +
    (AFFILIATE.litefinanceUid ? `&uid=${AFFILIATE.litefinanceUid}` : ''),
  litefinanceSignup: () =>
    `https://www.litefinance.org/social-trading/` +
    (AFFILIATE.litefinanceUid ? `?uid=${AFFILIATE.litefinanceUid}` : ''),
};

/**
 * Eligibility gates. A strategy must clear EVERY gate for its broker to be ranked.
 * These are published on the site verbatim — if you change them, the page changes too.
 *
 * The two brokers are gated DIFFERENTLY because they publish different fields:
 *   RoboForex   — authoritative max drawdown, deal count, subscriber count, account age.
 *   LiteFinance — a 1-10 risk score, copier count and funds managed, but NO drawdown
 *                 and NO deal count, so drawdown is derived from the equity curve.
 * Never present the two lists as scored on identical evidence.
 */
export const GATES = {
  roboforex: {
    minTrackRecordDays: 90,
    maxDrawdownPct: 40, // uses the broker's own dd_max field
    minDeals: 50,
    minCopiers: 3,
    minYieldPct: 0,
    maxYieldPct: 1000, // above this is almost always martingale, not skill
  },
  litefinance: {
    maxRiskScore: 5, // LiteFinance's own 1-10 scale; 5+ is aggressive
    maxDrawdownPct: 40, // DERIVED from the published equity curve, not official
    minCopiers: 3,
    minYieldPct: 0,
    // LiteFinance reports ALL-TIME profitability while RoboForex here reports a
    // 3-month window, so the same cap would be nonsense. A long-running honest
    // account can legitimately clear 1000% lifetime — the drawdown and risk-score
    // gates below are what actually filter danger here.
    maxYieldPct: 5000,
    minCurvePoints: 12, // too few points = too little history to judge
  },
};

/**
 * Martingale / grid detection thresholds.
 * Martingale hides losses by averaging down, so the equity curve shows a long
 * run of small gains punctuated by a single cliff. We look for that shape.
 */
export const MARTINGALE = {
  cliffRatio: 12, // worst day vs typical day size
  minCliffDropPct: 8, // ...and the worst day must actually be large
  suspiciousWinRate: 0.9, // near-perfect win rate...
  withDrawdownPct: 20, // ...combined with a real drawdown = suppressed losses
};

export const PERIOD = {
  // RoboForex period enum: 0=all,1=week,2=month,3=3mo,4=6mo,5=year,6=? — 3mo is the
  // shortest window that still filters out lucky streaks. Verified 2026-08-23 by
  // comparing one account across every value: p1/p2/p3 returned 33.7/50.5/2290.7%.
  roboforex: 3,
};

/**
 * The ranking boards.
 *
 * Only RoboForex has a period parameter. LiteFinance ignores `period`,
 * `interval` and `sort_period` entirely — every value returns a byte-identical
 * board — so it publishes ALL-TIME figures only and can appear on the all-time
 * board alone. Putting it on a weekly board would mean labelling an all-time
 * return as a weekly one.
 *
 * The eligibility gates do NOT relax for shorter windows. A weekly board that
 * dropped the 90-day/50-trade requirement would rank whichever martingale
 * account happened to be mid-streak — precisely what this site exists to filter.
 * The window changes what we RANK by, never who is allowed on the board.
 */
export const BOARDS = [
  {
    key: 'daily',
    label: 'Daily',
    slug: '/rankings/daily/',
    // No broker exposes a daily window. This board is built from our own dated
    // snapshots and shows day-over-day movement, not a one-day return.
    source: 'snapshot',
    rankLabel: 'Movement since yesterday',
  },
  {
    key: 'weekly',
    label: 'Weekly',
    slug: '/rankings/weekly/',
    source: 'roboforex',
    roboforexPeriod: 1,
    yieldLabel: 'Yield 1w',
    rankLabel: 'Return per unit of drawdown, ranked on the last 7 days',
  },
  {
    key: 'monthly',
    label: 'Monthly',
    slug: '/rankings/monthly/',
    source: 'roboforex',
    roboforexPeriod: 2,
    yieldLabel: 'Yield 1mo',
    rankLabel: 'Return per unit of drawdown, ranked on the last 30 days',
  },
  {
    key: 'all-time',
    label: 'All-time',
    slug: '/rankings/all-time/',
    source: 'roboforex',
    roboforexPeriod: 0,
    includeLiteFinance: true,
    yieldLabel: 'Yield all-time',
    rankLabel: 'Return per unit of drawdown over the full published history',
  },
];

/** How many dated snapshots to retain for the daily-movement board. */
export const SNAPSHOT_RETENTION_DAYS = 90;
