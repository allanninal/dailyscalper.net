/**
 * Single source of truth for affiliate links and ranking rules.
 * Change values here — nothing else in the codebase hardcodes them.
 */

export const AFFILIATE = {
  // RoboForex partner code, appended as ?a=<code>
  roboforex: 'vbes',

  // LiteFinance partner id, appended as ?uid=<id>.
  litefinanceUid: '135262069',

  // FXVM forex VPS affiliate id, appended as ?aff=<id> (10% of payments).
  fxvm: '30702',
};

export const LINKS = {
  roboforexStrategy: (sourceId, login) =>
    `https://roboforex.com/ph/copy-trading/rating/${sourceId}/${login}/?a=${AFFILIATE.roboforex}`,
  roboforexSignup: () => `https://my.roboforex.com/en/?a=${AFFILIATE.roboforex}`,
  litefinanceTrader: (id) =>
    `https://my.litefinance.org/traders/info?id=${id}` +
    (AFFILIATE.litefinanceUid ? `&uid=${AFFILIATE.litefinanceUid}` : ''),
  roboforexFreeVps: () => `https://rinfinity.com/en/free-vps-server?a=${AFFILIATE.roboforex}`,
  fxvm: () => `https://fxvm.net/?aff=${AFFILIATE.fxvm}`,
  mql5Product: (id) => `https://www.mql5.com/en/market/product/${id}`,
  authorTools: () => 'https://www.allanninal.dev/mql5/',
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

/**
 * The author's own MetaTrader tools on the MQL5 Market (shown on /tools/). These are plain links, not
 * affiliate links: MQL5 pays the seller for a purchase, which the page states. Keep in step with
 * https://www.allanninal.dev/mql5/ — add a row when a product is published.
 */
export const TOOLS = [
  { name: 'Gold Breakout Sentinel', id: 200385, price: 'Free', kind: 'Expert Advisor', logo: 'gold-breakout-sentinel.png',
    text: 'XAUUSD H1. Stop orders at yesterday\'s high and low when a stochastic turn and a Bollinger filter agree; fixed stop and target on every trade; a panel that shows the risk before it is placed.' },
  { name: 'Gold Breakout Sentinel Pro', id: 200903, price: 'Paid', kind: 'Expert Advisor', logo: 'gold-breakout-sentinel-pro.png',
    text: 'The same strategy and defaults, plus risk-based lot sizing, daily loss and drawdown limits, news and time filters and alerts.' },
  { name: 'Gold Trend Sentinel', id: 200427, price: 'Free', kind: 'Expert Advisor', logo: 'gold-trend-sentinel.png',
    text: 'XAUUSD H4 trend follower: UT Bot entries confirmed by the daily 200 EMA and Supertrend, with a 3 x ATR trailing stop.' },
  { name: 'Gold Trend Sentinel PRO', id: 201334, price: 'Paid', kind: 'Expert Advisor', logo: 'gold-trend-sentinel-pro.png',
    text: 'The same rule and defaults, plus risk sizing, account protection, break-even and partial close, filters and alerts.' },
  { name: 'UT Bot Signal Alerts', id: 201607, price: 'Free', kind: 'Indicator', logo: 'ut-bot-signal-alerts.png',
    text: 'The UT Bot ATR trailing-stop signals on one chart, on closed bars only, with pop-up, push and e-mail alerts.' },
  { name: 'UT Bot Scanner MT5', id: 201600, price: 'Paid', kind: 'Indicator', logo: 'ut-bot-scanner-mt5.png',
    text: 'The same UT Bot calculation across many symbols and timeframes in one panel, with one alert for new signals.' },
  { name: 'Half Trend ADX', id: 201564, price: 'Paid', kind: 'Indicator', logo: 'half-trend-adx.png',
    text: 'A Half Trend line with arrows where the trend turns and an ADX filter that skips weak trends.' },
  { name: 'Candlestick Signal Alerts', id: 201775, price: 'Free', kind: 'Indicator', logo: 'candlestick-signal-alerts.png',
    text: 'Thirteen classic candlestick patterns on one chart, marked on the closed bar that completes them, with alerts.' },
  { name: 'Candlestick Scanner MT5', id: 201779, price: 'Paid', kind: 'Indicator', logo: 'candlestick-scanner-mt5.png',
    text: 'Twenty-one candlestick patterns across many symbols and timeframes, with alerts and an honest statistics table.' },
  { name: 'Divergence Signal Alerts', id: 201785, price: 'Free', kind: 'Indicator', logo: 'divergence-signal-alerts.png',
    text: 'RSI and MACD divergences on one chart, marked on the closed bar where they became known, with alerts.' },
  { name: 'Divergence Scanner MT5', id: 201796, price: 'Paid', kind: 'Indicator', logo: 'divergence-scanner-mt5.png',
    text: 'RSI, MACD, Stochastic, CCI and OBV divergences across many symbols and timeframes in one panel, with alerts.' },
  { name: 'EA Health Monitor', id: 201797, price: 'Free', kind: 'Utility', logo: 'ea-health-monitor.png',
    text: 'One row per Expert Advisor on your account: trades, net, win rate, profit factor, drawdown and floating P/L.' },
  { name: 'EA Health Monitor Pro', id: 201799, price: 'Paid', kind: 'Utility', logo: 'ea-health-monitor-pro.png',
    text: 'The per-EA table by period, with result curves, drawdown and silence alarms, and an HTML/CSV report.' },
  { name: 'Gann HiLo Swing', id: 201806, price: 'Free', kind: 'Indicator', logo: 'gann-hilo-swing.png',
    text: 'Gann HiLo Activator and 2-bar swings on one chart, with an arrow and alert when a new trend starts.' },
  { name: 'Gann Toolkit MT5', id: 201807, price: 'Paid', kind: 'Indicator', logo: 'gann-toolkit-mt5.png',
    text: 'Gann Square of 9, fan angles and box from confirmed swings, with a multi-symbol HiLo trend table.' },
  { name: 'Harmonic Signal Alerts', id: 201811, price: 'Free', kind: 'Indicator', logo: 'harmonic-signal-alerts.png',
    text: 'ABCD, Gartley and Bat harmonic patterns with their reversal zone, drawn when price reaches it, with alerts.' },
  { name: 'Vitals', id: 194597, price: 'Free', kind: 'MT4 utility', logo: 'vitals.png',
    text: 'An account panel for MetaTrader 4: balance and margin, live risk, open positions and prop-firm-style statistics.' },
];

/**
 * The author's own public RoboForex strategy. It is screened with the same gates as every other strategy and
 * shown on /tools/ as the author's, outside the rankings, with whichever gates it fails. It is never added to
 * the rankings by hand.
 */
export const AUTHOR_STRATEGY = { sourceId: 'bbba', login: 37410742 };
