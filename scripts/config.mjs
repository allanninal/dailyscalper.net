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
  { name: 'Prior Day Breakout', id: 201959, price: 'Free', kind: 'Expert Advisor', logo: 'prior-day-breakout.png',
    text: 'XAUEUR H1 and M15. Trades the first close beyond yesterday\'s high or low, stop at the other side of the range, flat at 23:00; ships only the presets that passed both the Python backtest and the MT5 Strategy Tester.' },
  { name: 'Prior Day Breakout Pro', id: 201963, price: 'Paid', kind: 'Expert Advisor', logo: 'prior-day-breakout-pro.png',
    text: 'The same rule with all six validated XAUEUR presets, plus risk sizing, news pause modes, spread and Friday filters, break-even and the Prop Rules Guard lock.' },
  { name: 'Signal Trader', id: 201967, price: 'Free', kind: 'Expert Advisor', logo: 'signal-trader.png',
    text: 'Trades the closed-bar signals of UT Bot, SuperTrend, Range Filter or Half Trend with an ATR stop and 0.01 lot; live it trades only the preset that passed both backtests (SuperTrend, XAUUSD H4).' },
  { name: 'Signal Trader Pro', id: 201969, price: 'Paid', kind: 'Expert Advisor', logo: 'signal-trader-pro.png',
    text: 'The same signals and validated preset, plus risk sizing, a confirmation source, break-even, partial close and trailing, news, spread and time filters and the Prop Rules Guard lock.' },
  { name: 'UT Bot Signal Alerts', id: 201607, price: 'Free', kind: 'Indicator', logo: 'ut-bot-signal-alerts.png',
    text: 'The UT Bot ATR trailing-stop signals on one chart, on closed bars only, with pop-up, push and e-mail alerts.' },
  { name: 'UT Bot Signal Alerts MT4', id: 202304, price: 'Free', kind: 'MT4 indicator', logo: 'ut-bot-signal-alerts.png',
    text: 'The UT Bot ATR trailing-stop signals for MetaTrader 4: a buy or sell arrow on the closed bar where price crosses the stop line, with pop-up, sound, push and e-mail alerts.' },
  { name: 'UT Bot Scanner MT5', id: 201600, price: 'Paid', kind: 'Indicator', logo: 'ut-bot-scanner-mt5.png',
    text: 'The same UT Bot calculation across many symbols and timeframes in one panel, with one alert for new signals.' },
  { name: 'Half Trend ADX', id: 201564, price: 'Paid', kind: 'Indicator', logo: 'half-trend-adx.png',
    text: 'A Half Trend line with arrows where the trend turns and an ADX filter that skips weak trends.' },
  { name: 'Candlestick Signal Alerts', id: 201775, price: 'Free', kind: 'Indicator', logo: 'candlestick-signal-alerts.png',
    text: 'Thirteen classic candlestick patterns on one chart, marked on the closed bar that completes them, with alerts.' },
  { name: 'Candlestick Signal Alerts MT4', id: 202358, price: 'Free', kind: 'MT4 indicator', logo: 'candlestick-signal-alerts.png',
    text: 'Thirteen classic candlestick patterns for MetaTrader 4, marked on closed bars with optional trend and location filters, with pop-up, sound, push and e-mail alerts.' },
  { name: 'Candlestick Scanner MT5', id: 201779, price: 'Paid', kind: 'Indicator', logo: 'candlestick-scanner-mt5.png',
    text: 'Twenty-one candlestick patterns across many symbols and timeframes, with alerts and an honest statistics table.' },
  { name: 'Divergence Signal Alerts', id: 201785, price: 'Free', kind: 'Indicator', logo: 'divergence-signal-alerts.png',
    text: 'RSI and MACD divergences on one chart, marked on the closed bar where they became known, with alerts.' },
  { name: 'Divergence Signal Alerts MT4', id: 202356, price: 'Free', kind: 'MT4 indicator', logo: 'divergence-signal-alerts.png',
    text: 'RSI and MACD histogram divergences for MetaTrader 4: a line between the two price pivots and an arrow on the closed bar where the divergence became known, with alerts.' },
  { name: 'Divergence Scanner MT5', id: 201796, price: 'Paid', kind: 'Indicator', logo: 'divergence-scanner-mt5.png',
    text: 'RSI, MACD, Stochastic, CCI and OBV divergences across many symbols and timeframes in one panel, with alerts.' },
  { name: 'EA Health Monitor', id: 201797, price: 'Free', kind: 'Utility', logo: 'ea-health-monitor.png',
    text: 'One row per Expert Advisor on your account: trades, net, win rate, profit factor, drawdown and floating P/L.' },
  { name: 'EA Health Monitor Pro', id: 201799, price: 'Paid', kind: 'Utility', logo: 'ea-health-monitor-pro.png',
    text: 'The per-EA table by period, with result curves, drawdown and silence alarms, and an HTML/CSV report.' },
  { name: 'Gann HiLo Swing', id: 201806, price: 'Free', kind: 'Indicator', logo: 'gann-hilo-swing.png',
    text: 'Gann HiLo Activator and 2-bar swings on one chart, with an arrow and alert when a new trend starts.' },
  { name: 'Gann HiLo Swing MT4', id: 202367, price: 'Free', kind: 'MT4 indicator', logo: 'gann-hilo-swing.png',
    text: 'W.D. Gann\'s HiLo Activator line and 2-bar swing chart for MetaTrader 4: a swing line through confirmed swing highs and lows, and an arrow and alert on the closed bar where a new trend starts.' },
  { name: 'Gann Toolkit MT5', id: 201807, price: 'Paid', kind: 'Indicator', logo: 'gann-toolkit-mt5.png',
    text: 'Gann Square of 9, fan angles and box from confirmed swings, with a multi-symbol HiLo trend table.' },
  { name: 'Harmonic Signal Alerts', id: 201811, price: 'Free', kind: 'Indicator', logo: 'harmonic-signal-alerts.png',
    text: 'ABCD, Gartley and Bat harmonic patterns with their reversal zone, drawn when price reaches it, with alerts.' },
  { name: 'Harmonic Signal Alerts MT4', id: 202361, price: 'Free', kind: 'MT4 indicator', logo: 'harmonic-signal-alerts.png',
    text: 'ABCD, Gartley and Bat harmonic patterns for MetaTrader 4 from confirmed swings: XABCD lines, the reversal zone and an arrow on the closed bar where the pattern completes, with alerts.' },
  { name: 'Harmonic Scanner MT5', id: 201814, price: 'Paid', kind: 'Indicator', logo: 'harmonic-scanner-mt5.png',
    text: 'Eight harmonic patterns across many symbols and timeframes, with zone alerts and an outcome table.' },
  { name: 'Prop Rules Monitor', id: 201817, price: 'Free', kind: 'Utility', logo: 'prop-rules-monitor.png',
    text: 'Live daily loss and max loss of a prop-firm account, with the firm\'s reset clock and alerts.' },
  { name: 'Prop Rules Guard MT5', id: 201823, price: 'Paid', kind: 'Utility', logo: 'prop-rules-guard-mt5.png',
    text: 'Prop-firm rules enforced: daily and max loss on equity, 22 firm presets, and a lock before a limit.' },
  { name: 'Risk Position Tool', id: 201865, price: 'Free', kind: 'Utility', logo: 'risk-position-tool.png',
    text: 'Drag entry, stop and target lines to get the lot for your risk, reward:risk and margin. Never trades.' },
  { name: 'Risk Trade Manager MT5', id: 201867, price: 'Paid', kind: 'Utility', logo: 'risk-trade-manager-mt5.png',
    text: 'Sizes the lot from your lines, sends the order when you press OPEN, then partial close, break-even and trailing.' },
  { name: 'Range Filter Signals', id: 201871, price: 'Free', kind: 'Indicator', logo: 'range-filter-signals.png',
    text: 'A range filter line that ignores chop, with buy and sell arrows where it turns. Closed bars only.' },
  { name: 'Range Filter Signals MT4', id: 202329, price: 'Free', kind: 'MT4 indicator', logo: 'range-filter-signals.png',
    text: 'The range filter line for MetaTrader 4: it moves only when price travels further than its smoothed average range, with buy and sell arrows where it turns and alerts. Closed bars only.' },
  { name: 'Range Filter Scanner MT5', id: 201873, price: 'Paid', kind: 'Indicator', logo: 'range-filter-scanner-mt5.png',
    text: 'The range filter on many symbols and timeframes in one table, with higher-timeframe agreement and alerts.' },
  { name: 'Sequential Countdown', id: 201875, price: 'Free', kind: 'Indicator', logo: 'sequential-countdown.png',
    text: 'The 9-13 sequential count with perfected 9s and alerts on 9 and 13. Closed bars only, rules stated.' },
  { name: 'Sequential Countdown MT4', id: 202363, price: 'Free', kind: 'MT4 indicator', logo: 'sequential-countdown.png',
    text: 'The 9-13 sequential count for MetaTrader 4: setup 1-9 with perfected 9s marked, countdown 1-13 with the cancel rules stated in full, and alerts on 9 and 13. Closed bars only.' },
  { name: 'Sequential Scanner MT5', id: 201877, price: 'Paid', kind: 'Indicator', logo: 'sequential-scanner-mt5.png',
    text: 'The 9-13 sequential count on many symbols and timeframes in one table, with alerts on 9 and 13.' },
  { name: 'SMC Session Scanner MT5', id: 201879, price: 'Paid', kind: 'Indicator', logo: 'smc-session-scanner-mt5.png',
    text: 'BOS, CHoCH, sweeps, order blocks, fair value gaps and session breaks on many symbols in one panel.' },
  { name: 'SMC Zones', id: 201880, price: 'Free', kind: 'Indicator', logo: 'smc-zones.png',
    text: 'BOS, CHoCH, liquidity sweeps, order blocks and fair value gaps on the chart, with alerts. Closed bars only.' },
  { name: 'Session Levels', id: 201881, price: 'Free', kind: 'Indicator', logo: 'session-levels.png',
    text: 'Asia, London and New York session ranges plus previous day and week highs and lows, with break alerts.' },
  { name: 'SuperTrend Signal Alerts', id: 201882, price: 'Free', kind: 'Indicator', logo: 'supertrend-signal-alerts.png',
    text: 'SuperTrend line with buy and sell arrows on each flip, optional EMA and RSI filters, and alerts.' },
  { name: 'SuperTrend Signal Alerts MT4', id: 202324, price: 'Free', kind: 'MT4 indicator', logo: 'supertrend-signal-alerts.png',
    text: 'The SuperTrend line with buy and sell arrows on each flip for MetaTrader 4, optional EMA and RSI filters, closed bars only, with pop-up, sound, push and e-mail alerts.' },
  { name: 'Confluence Dashboard', id: 201895, price: 'Paid', kind: 'Indicator', logo: 'confluence-dashboard.png',
    text: 'Six indicator checks per symbol and a BUY, SELL or WAIT verdict when enough agree, with alerts.' },
  { name: 'Vitals', id: 194597, price: 'Free', kind: 'MT4 utility', logo: 'vitals.png',
    text: 'An account panel for MetaTrader 4: balance and margin, live risk, open positions and prop-firm-style statistics.' },
];

/**
 * The author's own public RoboForex strategy. It is screened with the same gates as every other strategy and
 * shown on /tools/ as the author's, outside the rankings, with whichever gates it fails. It is never added to
 * the rankings by hand.
 */
export const AUTHOR_STRATEGY = { sourceId: 'bbba', login: 37410742 };
