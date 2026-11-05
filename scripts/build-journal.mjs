/**
 * Renders /journal/ — the author's live MT5 cent account — from data/journal.json
 * (written hourly by fetch-journal.mjs) and the optional hand-written notes in
 * data/journal-notes.json.
 *
 * The page is a pure function of those two files: "today", the current month and
 * every figure come from the JSON, never from the build machine's clock, so a
 * rebuild with unchanged data produces byte-identical HTML and nothing to commit.
 *
 * Statistics follow the definitions Myfxbook and MQL5 Signals publish, so a
 * reader can check them against either: gain is time-weighted (deposits do not
 * count as profit), drawdown is measured on the closed-trade balance curve.
 */
import { head, masthead, footer, esc } from './templates.mjs';
import { JOURNAL, LINKS } from './config.mjs';

const SITE = 'https://www.dailyscalper.net';
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------------------------------------------------------------- format */

const dim = '<span class="dim">—</span>';
const group = (n, dp) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
/** Cents with sign and the dollar equivalent: "+106.56¢". */
const cents = (n, { sign = false, dp = 2 } = {}) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? dim
    : `${sign && n > 0 ? '+' : ''}${n < 0 ? '−' : ''}${group(Math.abs(n), dp)}¢`;
const usd = (c) => `$${group(c / 100, 2)}`;
const pct = (n, dp = 2, sign = true) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? dim
    : `${sign && n > 0 ? '+' : ''}${n < 0 ? '−' : ''}${Math.abs(n).toFixed(dp)}%`;
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'dim');
const dayKey = (t) => t.slice(0, 10);
const monthKey = (t) => t.slice(0, 7);
const hhmm = (t) => t.slice(11, 16);
const longDate = (t) =>
  new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function duration(ms) {
  if (!Number.isFinite(ms)) return dim;
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/* ----------------------------------------------------------------- stats */

/**
 * Walks cash movements and closed trades in time order. Each trade's return is
 * its profit over the balance just before it closed, which is what makes gain
 * independent of deposits (Myfxbook's "Gain" vs "Abs. Gain").
 */
export function journalStats(j) {
  const events = [
    ...j.cashflow.map((c) => ({ time: c.time, cash: c.amount })),
    ...j.trades.map((t) => ({ time: t.closeTime, trade: t })),
  ].sort((a, b) => a.time.localeCompare(b.time) || (a.cash !== undefined ? -1 : 1));

  let balance = 0;
  let deposits = 0;
  let index = 1; // time-weighted growth of 1 unit
  let peakIndex = 1;
  let pnl = 0;
  let peakPnl = 0;
  let maxDdPct = 0;
  let maxDdAbs = 0;
  const returns = [];
  const curve = [];
  const enriched = [];

  for (const e of events) {
    if (e.cash !== undefined) {
      balance += e.cash;
      deposits += e.cash;
      curve.push({ time: e.time, balance });
      continue;
    }
    const t = e.trade;
    const r = balance > 0 ? t.profit / balance : 0;
    balance += t.profit;
    pnl += t.profit;
    index *= 1 + r;
    returns.push(r);
    peakIndex = Math.max(peakIndex, index);
    peakPnl = Math.max(peakPnl, pnl);
    maxDdPct = Math.max(maxDdPct, (1 - index / peakIndex) * 100);
    maxDdAbs = Math.max(maxDdAbs, peakPnl - pnl);
    curve.push({ time: e.time, balance });
    enriched.push({ ...t, r, balanceAfter: balance });
  }

  const wins = enriched.filter((t) => t.profit > 0);
  const losses = enriched.filter((t) => t.profit < 0);
  const grossProfit = wins.reduce((s, t) => s + t.profit, 0);
  const grossLoss = losses.reduce((s, t) => s + t.profit, 0);
  const net = grossProfit + grossLoss;
  const n = enriched.length;

  // Streaks, in trades and in money.
  let run = 0;
  let runSum = 0;
  let maxWinRun = 0;
  let maxLossRun = 0;
  let maxWinRunSum = 0;
  let maxLossRunSum = 0;
  for (const t of enriched) {
    const w = t.profit > 0;
    if ((w && run > 0) || (!w && run < 0)) {
      run += w ? 1 : -1;
      runSum += t.profit;
    } else {
      run = w ? 1 : -1;
      runSum = t.profit;
    }
    if (run > maxWinRun) [maxWinRun, maxWinRunSum] = [run, runSum];
    if (-run > maxLossRun) [maxLossRun, maxLossRunSum] = [-run, runSum];
  }

  const mean = returns.reduce((s, r) => s + r, 0) / (n || 1);
  const sd = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n > 1 ? n - 1 : 1));
  const ghpr = n ? (index ** (1 / n) - 1) * 100 : null;

  const side = (s) => {
    const all = enriched.filter((t) => t.side === s);
    return { count: all.length, won: all.filter((t) => t.profit > 0).length };
  };

  const firstTime = events[0]?.time ?? j.syncedAt;
  const days = Math.max(1, (Date.parse(j.syncedAt) - Date.parse(firstTime)) / DAY_MS);

  return {
    trades: enriched,
    curve,
    deposits,
    balance,
    net,
    gainPct: (index - 1) * 100,
    absGainPct: deposits > 0 ? (net / deposits) * 100 : null,
    dailyPct: (index ** (1 / days) - 1) * 100,
    monthlyPct: (index ** (30.4375 / days) - 1) * 100,
    maxDdPct,
    maxDdAbs,
    recovery: maxDdAbs > 0 ? net / maxDdAbs : null,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    grossProfit,
    grossLoss,
    count: n,
    winRate: n ? (wins.length / n) * 100 : null,
    avgWin: wins.length ? grossProfit / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
    best: n ? Math.max(...enriched.map((t) => t.profit)) : null,
    worst: n ? Math.min(...enriched.map((t) => t.profit)) : null,
    expectancy: n ? net / n : null,
    ahpr: n ? mean * 100 : null,
    ghpr,
    sharpe: n > 1 && sd > 0 ? mean / sd : null,
    maxWinRun,
    maxLossRun,
    maxWinRunSum,
    maxLossRunSum,
    avgHold: n
      ? enriched.reduce((s, t) => s + (Date.parse(t.closeTime) - Date.parse(t.openTime)), 0) / n
      : null,
    longs: side('buy'),
    shorts: side('sell'),
    algoPct: n ? (enriched.filter((t) => t.by === 'ea').length / n) * 100 : null,
    lots: enriched.reduce((s, t) => s + t.volume, 0),
    tradingDays: new Set(enriched.map((t) => dayKey(t.closeTime))).size,
    firstTime,
  };
}

/** Groups trades by a key, compounding each trade's return within the bucket. */
function bucket(trades, keyOf) {
  const out = new Map();
  for (const t of trades) {
    const k = keyOf(t);
    const b = out.get(k) ?? { net: 0, count: 0, won: 0, growth: 1 };
    b.net += t.profit;
    b.count += 1;
    b.won += t.profit > 0 ? 1 : 0;
    b.growth *= 1 + t.r;
    out.set(k, b);
  }
  for (const b of out.values()) b.pct = (b.growth - 1) * 100;
  return out;
}

/* -------------------------------------------------------------- sections */

/**
 * The $16 → $100 challenge: progress is measured from the starting deposit, not
 * from zero, so the bar shows only what trading has added.
 */
function goalPanel(s, j) {
  const goal = JOURNAL.goalCents;
  const start = s.deposits;
  const progress = Math.min(100, Math.max(0, ((s.balance - start) / (goal - start || 1)) * 100));
  const reached = s.balance >= goal;
  return `
  <div class="panel journal-goal">
    <div class="journal-goal__head">
      <div>
        <p class="eyebrow">The ${usd(start).replace(/\.\d+$/, '')} → ${usd(goal).replace(/\.\d+$/, '')} challenge</p>
        <h3>${reached ? 'Challenge complete' : `${usd(s.balance)} today · ${usd(goal - s.balance)} to go`}</h3>
      </div>
      <p class="num journal-goal__figure">${progress.toFixed(1)}% <span class="dim">of the way</span></p>
    </div>
    <div class="journal-goal__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.toFixed(0)}" aria-label="Progress from the starting deposit to the $100 goal">
      <span style="width:${progress.toFixed(2)}%"></span>
    </div>
    <div class="journal-goal__ends num"><span>Start ${cents(start)} (${usd(start)})</span><span>Goal ${cents(goal, { dp: 0 })} (${usd(goal)})</span></div>
    <p class="lede" style="margin:1rem 0 0">
      ${
        reached
          ? `The balance has reached ${usd(goal)}. The author is preparing to open this account to copy trading on RoboForex — this page will link to it the day it opens.`
          : `The author started this account with ${usd(start)} and is trading it to ${usd(goal)} in public. <strong>When it reaches ${usd(goal)}, it opens to copy trading on RoboForex</strong> so anyone following along can copy it. Until then there is nothing to copy — just this page, updated every hour, losses included. It is a <strong>cent account</strong>, so every figure here is in US cents (¢): 100¢ is $1.`
      }
    </p>
    <p class="trader-sub" style="margin-top:1rem">
      Why $100: RoboForex's <a href="${esc(LINKS.roboforexPage(JOURNAL.procent.shareUrl))}" rel="sponsored nofollow" target="_blank">Copy Trading Service</a>
      (formerly CopyFX) lets any real MT5 account with hedging share a strategy once it holds at least
      $${JOURNAL.procent.providerMinUsd}. ${
        j.account.margin === 'hedging'
          ? 'This account is a real MT5 hedging account, so the balance is the only thing left to reach.'
          : ''
      }
    </p>
  </div>`;
}

function headline(s, j) {
  const item = (label, value, cls = '') =>
    `<div><dt>${label}</dt><dd class="${cls}">${value}</dd></div>`;
  return `<dl class="hero__meta">
      ${item('Gain', pct(s.gainPct), tone(s.gainPct))}
      ${item('Balance', `${cents(s.balance)}`)}
      ${item('Equity', `${cents(j.account.equity)}`)}
      ${item('Max drawdown', pct(-s.maxDdPct, 2, false), 'neg')}
      ${item('Trades', String(s.count))}
    </dl>`;
}

/** Monday-first month grid with a weekly total column, like Tradezella and TradesViz. */
function monthCalendar(ym, days, notes, today, maxAbs) {
  const [y, m] = ym.split('-').map(Number);
  const first = Date.UTC(y, m - 1, 1);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  let month = { net: 0, count: 0, growth: 1, won: 0 };
  const rows = [];
  for (let w = 0; w < cells.length / 7; w++) {
    const week = { net: 0, count: 0 };
    const tds = cells.slice(w * 7, w * 7 + 7).map((d, i) => {
      if (d === null) return '<td class="cal__pad"></td>';
      const key = `${ym}-${String(d).padStart(2, '0')}`;
      const b = days.get(key);
      const note = notes[key];
      const future = key > today;
      const cls = ['cal__day'];
      if (i >= 5) cls.push('is-weekend');
      if (key === today) cls.push('is-today');
      if (future) cls.push('is-future');
      let style = '';
      if (b) {
        week.net += b.net;
        week.count += b.count;
        month.net += b.net;
        month.count += b.count;
        month.won += b.won;
        month.growth *= b.growth;
        cls.push(b.net > 0 ? 'is-win' : b.net < 0 ? 'is-loss' : 'is-flat');
        // Shade by size relative to the biggest day, never fully opaque.
        style = ` style="--a:${(0.12 + 0.5 * Math.min(1, Math.abs(b.net) / (maxAbs || 1))).toFixed(2)}"`;
      }
      const body = b
        ? `<span class="cal__pnl num">${cents(b.net, { sign: true })}</span>
             <span class="cal__meta num">${b.count} trade${b.count === 1 ? '' : 's'} · ${pct(b.pct, 1)}</span>`
        : '';
      const title = b
        ? `${key}: ${b.net >= 0 ? '+' : ''}${b.net.toFixed(2)}¢, ${b.count} trades, ${b.won} won${note ? ` — ${note}` : ''}`
        : note
          ? `${key} — ${note}`
          : key;
      return `<td class="${cls.join(' ')}"${style} title="${esc(title)}">
            ${b ? `<a class="cal__link" href="#day-${key}" aria-label="${esc(key)} trades"></a>` : ''}<span class="cal__date">${d}${note ? '<i class="cal__note" aria-label="Has a journal note"></i>' : ''}</span>${body}
          </td>`;
    });
    rows.push(`<tr>${tds.join('')}
          <td class="cal__week">${
            week.count
              ? `<span class="num ${tone(week.net)}">${cents(week.net, { sign: true })}</span><span class="cal__meta num">${week.count} trades</span>`
              : dim
          }</td></tr>`);
  }

  const label = `${MONTHS[m - 1]} ${y}`;
  return `
  <div class="cal">
    <div class="cal__head">
      <h3>${label}</h3>
      <p class="num">${
        month.count
          ? `<span class="${tone(month.net)}">${cents(month.net, { sign: true })}</span> · ${pct((month.growth - 1) * 100)} · ${month.count} trades · ${((month.won / month.count) * 100).toFixed(0)}% won`
          : '<span class="dim">No trades</span>'
      }</p>
    </div>
    <div class="table-scroll">
    <table class="cal__grid">
      <thead><tr>${WEEKDAYS.map((d) => `<th>${d}</th>`).join('')}<th>Week</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    </div>
  </div>`;
}

function calendars(s, j, notes) {
  const days = bucket(s.trades, (t) => dayKey(t.closeTime));
  const today = dayKey(j.syncedAt);
  const maxAbs = Math.max(0, ...[...days.values()].map((b) => Math.abs(b.net)));
  const months = [];
  for (let ym = monthKey(s.firstTime); ym <= monthKey(j.syncedAt); ) {
    months.push(ym);
    const [y, m] = ym.split('-').map(Number);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return months
    .reverse()
    .map((ym) => monthCalendar(ym, days, notes, today, maxAbs))
    .join('');
}

/** MQL5-style year × month growth table. */
function monthlyTable(s) {
  const months = bucket(s.trades, (t) => monthKey(t.closeTime));
  const years = [...new Set([...months.keys()].map((k) => k.slice(0, 4)))].sort().reverse();
  if (!years.length) return '';
  return `
  <div class="table-scroll">
  <table class="ledger journal-months">
    <thead><tr><th>Year</th>${MONTHS.map((m) => `<th>${m}</th>`).join('')}<th>Year</th></tr></thead>
    <tbody>${years
      .map((y) => {
        let g = 1;
        const tds = MONTHS.map((_, i) => {
          const b = months.get(`${y}-${String(i + 1).padStart(2, '0')}`);
          if (!b) return `<td>${dim}</td>`;
          g *= b.growth;
          return `<td class="${tone(b.pct)}">${pct(b.pct, 1)}</td>`;
        });
        return `<tr><td>${y}</td>${tds.join('')}<td class="${tone(g - 1)}"><strong>${pct((g - 1) * 100, 1)}</strong></td></tr>`;
      })
      .join('')}</tbody>
  </table>
  </div>`;
}

function statsTable(s) {
  const row = (label, value, hint = '') =>
    `<tr><td style="text-align:left">${label}${hint ? `<div class="trader-sub">${hint}</div>` : ''}</td><td>${value}</td></tr>`;
  const ratio = (n, dp = 2) => (n === null || !Number.isFinite(n) ? dim : n.toFixed(dp));
  const won = (x) => (x.count ? `${x.won}/${x.count} (${((x.won / x.count) * 100).toFixed(0)}%)` : dim);
  return `
  <div class="grid-2" style="align-items:start">
    <div class="panel">
      <h3>Performance</h3>
      <table class="ledger"><tbody>
        ${row('Gain', `<span class="${tone(s.gainPct)}">${pct(s.gainPct)}</span>`, 'time-weighted; deposits excluded')}
        ${row('Absolute gain', pct(s.absGainPct), 'net profit ÷ net deposits')}
        ${row('Average daily', pct(s.dailyPct, 3))}
        ${row('Average monthly', pct(s.monthlyPct), 'extrapolated from a short record')}
        ${row('Net profit', `<span class="${tone(s.net)}">${cents(s.net, { sign: true })}</span> <span class="dim">(${usd(s.net)})</span>`)}
        ${row('Deposits', cents(s.deposits))}
        ${row('Profit factor', ratio(s.profitFactor), 'gross profit ÷ gross loss')}
        ${row('Recovery factor', ratio(s.recovery), 'net profit ÷ max drawdown')}
        ${row('Sharpe ratio', ratio(s.sharpe), 'per trade, as MQL5 Signals')}
        ${row('AHPR / GHPR', `${pct(s.ahpr, 3)} / ${pct(s.ghpr, 3)}`, 'average return per trade, arithmetic / geometric')}
      </tbody></table>
    </div>
    <div class="panel">
      <h3>Risk</h3>
      <table class="ledger"><tbody>
        ${row('Max drawdown', `<span class="neg">${pct(-s.maxDdPct, 2, false)}</span>`, 'closed-trade balance, peak to trough')}
        ${row('Max drawdown, cents', `<span class="neg">${cents(-s.maxDdAbs)}</span>`)}
        ${row('Worst trade', `<span class="${tone(s.worst)}">${cents(s.worst, { sign: true })}</span>`)}
        ${row('Best trade', `<span class="${tone(s.best)}">${cents(s.best, { sign: true })}</span>`)}
        ${row('Max consecutive wins', s.count ? `${s.maxWinRun} <span class="dim">(${cents(s.maxWinRunSum, { sign: true })})</span>` : dim)}
        ${row('Max consecutive losses', s.count ? `${s.maxLossRun} <span class="dim">(${cents(s.maxLossRunSum, { sign: true })})</span>` : dim)}
        ${row('Stop-loss on every trade', '<span class="dim">see trade list</span>')}
      </tbody></table>
    </div>
    <div class="panel">
      <h3>Trades</h3>
      <table class="ledger"><tbody>
        ${row('Closed trades', String(s.count))}
        ${row('Win rate', s.winRate === null ? dim : `${s.winRate.toFixed(1)}%`)}
        ${row('Average win', `<span class="pos">${cents(s.avgWin, { sign: true })}</span>`)}
        ${row('Average loss', `<span class="neg">${cents(s.avgLoss, { sign: true })}</span>`)}
        ${row('Expectancy', `<span class="${tone(s.expectancy)}">${cents(s.expectancy, { sign: true })}</span>`, 'average result per trade')}
        ${row('Longs won', won(s.longs))}
        ${row('Shorts won', won(s.shorts))}
      </tbody></table>
    </div>
    <div class="panel">
      <h3>Activity</h3>
      <table class="ledger"><tbody>
        ${row('Tracking since', esc(longDate(s.firstTime)))}
        ${row('Trading days', String(s.tradingDays))}
        ${row('Average holding time', duration(s.avgHold))}
        ${row('Algo trading', s.algoPct === null ? dim : `${s.algoPct.toFixed(0)}%`, 'trades opened by the Expert Advisor')}
        ${row('Lots traded', s.lots.toFixed(2), 'cent lots')}
      </tbody></table>
    </div>
  </div>`;
}

/** Balance after every cash movement and closed trade, plotted against time. */
function balanceChart(s) {
  const pts = s.curve;
  if (pts.length < 2) return '';
  const w = 900;
  const h = 220;
  const pad = { l: 64, r: 12, t: 12, b: 26 };
  const t0 = Date.parse(pts[0].time);
  const t1 = Date.parse(pts[pts.length - 1].time);
  const vals = pts.map((p) => p.balance);
  const lo = Math.min(...vals.slice(1));
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (t) => pad.l + ((Date.parse(t) - t0) / (t1 - t0 || 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / span) * (h - pad.t - pad.b);
  // Start the line at the first deposit, not at zero, so the scale shows trading.
  const d = pts
    .slice(1)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.time).toFixed(1)},${y(p.balance).toFixed(1)}`)
    .join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  return `
  <figure class="panel journal-chart">
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Balance in cents after each closed trade, from ${cents(lo)} to ${cents(hi)}">
      ${ticks
        .map(
          (v) =>
            `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="journal-chart__grid"/>
      <text x="${pad.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${group(v, 0)}¢</text>`
        )
        .join('')}
      <path d="${d}" class="journal-chart__line"/>
      <text x="${pad.l}" y="${h - 6}">${esc(dayKey(pts[1].time))}</text>
      <text x="${w - pad.r}" y="${h - 6}" text-anchor="end">${esc(dayKey(pts[pts.length - 1].time))}</text>
    </svg>
    <figcaption class="trader-sub">Balance after each closed trade, in cents. Floating profit on open trades is not included.</figcaption>
  </figure>`;
}

/** Hour-of-day and weekday breakdown, as Myfxbook's and MQL5's activity charts. */
function activity(s) {
  const byHour = bucket(s.trades, (t) => Number(t.openTime.slice(11, 13)));
  const byDow = bucket(s.trades, (t) => (new Date(t.openTime).getUTCDay() + 6) % 7);
  const maxAbs = Math.max(1, ...[...byHour.values()].map((b) => Math.abs(b.net)));
  const bars = Array.from({ length: 24 }, (_, hr) => {
    const b = byHour.get(hr);
    const hgt = b ? Math.max(4, (Math.abs(b.net) / maxAbs) * 100) : 0;
    return `<div class="hours__col" title="${String(hr).padStart(2, '0')}:00 UTC: ${
      b ? `${b.count} trades, ${b.net >= 0 ? '+' : ''}${b.net.toFixed(2)}¢` : 'no trades'
    }">
        <span class="hours__bar ${b ? tone(b.net) : ''}" style="height:${hgt.toFixed(0)}%"></span>
        <span class="hours__label">${hr % 3 === 0 ? String(hr).padStart(2, '0') : ''}</span>
      </div>`;
  }).join('');
  return `
  <div class="grid-2" style="align-items:start">
    <div class="panel">
      <h3>By hour opened <span class="dim" style="font-size:.8rem">(UTC)</span></h3>
      <div class="hours" aria-hidden="true">${bars}</div>
      <p class="trader-sub" style="margin-top:.5rem">Bar height is net result in that hour; green made money, red lost it. Hover for figures.</p>
    </div>
    <div class="panel">
      <h3>By weekday opened</h3>
      <table class="ledger"><thead><tr><th>Day</th><th>Trades</th><th>Won</th><th>Net</th></tr></thead><tbody>
      ${WEEKDAYS.map((d, i) => {
        const b = byDow.get(i);
        return `<tr><td style="text-align:left">${d}</td><td>${b ? b.count : dim}</td><td>${
          b ? `${((b.won / b.count) * 100).toFixed(0)}%` : dim
        }</td><td class="${b ? tone(b.net) : ''}">${b ? cents(b.net, { sign: true }) : dim}</td></tr>`;
      }).join('')}
      </tbody></table>
    </div>
  </div>`;
}

const EXIT_LABEL = { tp: 'Take profit', sl: 'Stop loss', ea: 'Closed by EA', manual: 'Manual', stopout: 'Stop out' };

function tradeRows(trades) {
  return trades
    .map(
      (t) => `<tr>
      <td style="text-align:left" class="num">${esc(dayKey(t.closeTime))} <span class="dim">${esc(hhmm(t.openTime))}→${esc(hhmm(t.closeTime))}</span></td>
      <td style="text-align:left"><span class="tag ${t.side === 'buy' ? 'tag--rf' : 'tag--lf'}">${t.side}</span> ${esc(t.symbol)}</td>
      <td>${t.volume.toFixed(2)}</td>
      <td>${price(t.openPrice, t.closePrice)[0]}</td>
      <td>${price(t.openPrice, t.closePrice)[1]}</td>
      <td>${duration(Date.parse(t.closeTime) - Date.parse(t.openTime))}</td>
      <td class="dim">${EXIT_LABEL[t.exit] ?? esc(t.exit)}${t.by === 'manual' ? ' · manual entry' : ''}</td>
      <td class="${tone(t.profit)}">${cents(t.profit, { sign: true })}</td>
      <td class="${tone(t.r)}">${pct(t.r * 100)}</td>
    </tr>`
    )
    .join('');
}

function openTable(j) {
  if (!j.openPositions.length) return '<p class="dim">No open trades at the last sync.</p>';
  return `<div class="table-scroll"><table class="ledger">
    <thead><tr><th>Opened (UTC)</th><th>Trade</th><th>Lots</th><th>Entry</th><th>Floating</th></tr></thead>
    <tbody>${j.openPositions
      .map(
        (p) => `<tr>
      <td style="text-align:left" class="num">${esc(p.openTime.slice(0, 16).replace('T', ' '))}</td>
      <td style="text-align:left"><span class="tag ${p.side === 'buy' ? 'tag--rf' : 'tag--lf'}">${p.side}</span> ${esc(p.symbol)}</td>
      <td>${p.volume.toFixed(2)}</td>
      <td>${price(p.openPrice)[0]}</td>
      <td class="${tone(p.floating)}">${cents(p.floating, { sign: true })}</td>
    </tr>`
      )
      .join('')}</tbody></table></div>`;
}

function notesList(notes) {
  const keys = Object.keys(notes).sort().reverse();
  if (!keys.length) return '';
  return `
<section class="block rule-top" id="notes">
  <div class="wrap">
    <p class="eyebrow">Journal notes</p>
    <h2>In the author's words</h2>
    <ul class="reject-list" style="margin-top:2rem">${keys
      .map((k) => `<li><span class="who num">${esc(k)}</span><span>${esc(notes[k])}</span></li>`)
      .join('')}</ul>
  </div>
</section>`;
}


/* ------------------------------------------------------- phone day views */

/** MT5 mobile writes 1 600.96: thin-space thousands, dot decimals. */
const mt5num = (n) =>
  Number(n)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** Prices at the precision the trade carries, never fewer than two places. */
const price = (...ps) => {
  const dp = Math.max(2, ...ps.map((p) => (String(p).split('.')[1] ?? '').length));
  return ps.map((p) => Number(p).toFixed(dp));
};
const mt5time = (t) => `${t.slice(0, 10).replace(/-/g, '.')} ${t.slice(11, 19)}`;

/**
 * One trading day drawn in the layout of the MetaTrader 5 iOS History tab, so a
 * reader sees the day the way the author sees it on the phone. It is rendered
 * from the same trades as the rest of the page and labelled as such: it is not
 * a screenshot, and it carries no MetaQuotes branding.
 */
function phoneDay(key, trades, cash, balanceEnd) {
  const profit = trades.reduce((s, t) => s + t.profit, 0);
  const deposit = cash.reduce((s, c) => s + c.amount, 0);
  const rows = [...trades]
    .reverse()
    .map(
      (t) => `<li class="mt5__row">
          <div><b>${esc(t.symbol)},</b> <span class="mt5__${t.side}">${t.side} ${t.volume.toFixed(2)}</span>
            <div class="mt5__prices">${price(t.openPrice, t.closePrice).join(' → ')}</div></div>
          <div class="mt5__right"><span class="mt5__time">${mt5time(t.closeTime)}</span>
            <span class="${t.profit < 0 ? 'mt5__loss' : 'mt5__gain'}">${mt5num(t.profit)}</span></div>
        </li>`
    )
    .join('');
  const cashRows = cash
    .map(
      (c) => `<li class="mt5__row">
          <div><b>${c.amount >= 0 ? 'Deposit' : 'Withdrawal'}</b><div class="mt5__prices">Balance</div></div>
          <div class="mt5__right"><span class="mt5__time">${mt5time(c.time)}</span>
            <span class="mt5__gain">${mt5num(c.amount)}</span></div>
        </li>`
    )
    .join('');
  const last = trades[trades.length - 1]?.closeTime ?? cash[cash.length - 1]?.time;
  return `
    <figure class="phone" id="day-${key}">
      <div class="phone__screen">
        <div class="phone__status"><span>${hhmm(last)}</span><i class="phone__island"></i><span>5G ▮</span></div>
        <div class="mt5">
          <div class="mt5__bar"><span>‹</span><strong>History</strong><span>⋯</span></div>
          <div class="mt5__tabs"><span class="is-on">Positions</span><span>Orders</span><span>Deals</span></div>
          <div class="mt5__range">${esc(longDate(`${key}T00:00:00Z`))}</div>
          <dl class="mt5__sum">
            <div><dt>Profit:</dt><dd class="${profit < 0 ? 'mt5__loss' : ''}">${mt5num(profit)}</dd></div>
            ${deposit ? `<div><dt>Deposit:</dt><dd>${mt5num(deposit)}</dd></div>` : ''}
            <div><dt>Balance:</dt><dd>${mt5num(balanceEnd)}</dd></div>
          </dl>
          <ul class="mt5__list">${rows}${cashRows}</ul>
        </div>
        <i class="phone__home"></i>
      </div>
      <figcaption class="trader-sub">${esc(key)} · ${trades.length} trade${trades.length === 1 ? '' : 's'} · ${cents(profit, { sign: true })}<br>Drawn from the account data in the style of the MT5 iPhone app. Not a screenshot.</figcaption>
    </figure>`;
}

function phoneDays(s, j) {
  const byDay = new Map();
  const get = (k) => byDay.get(k) ?? byDay.set(k, { trades: [], cash: [] }).get(k);
  for (const t of s.trades) get(dayKey(t.closeTime)).trades.push(t);
  for (const c of j.cashflow) get(dayKey(c.time)).cash.push(c);
  // Balance at each day's end, from the same running curve the stats use.
  const endBalance = new Map(s.curve.map((p) => [dayKey(p.time), p.balance]));
  return [...byDay.keys()]
    .sort()
    .reverse()
    .slice(0, JOURNAL.phoneDays)
    .map((k) => phoneDay(k, byDay.get(k).trades, byDay.get(k).cash, endBalance.get(k)))
    .join('');
}


/* ------------------------------------------------------- why ProCent */

/** Trades held through at least one daily rollover (broker server midnight). */
function overnight(trades, offsetMin) {
  const off = (offsetMin ?? 0) * 60_000;
  return trades.filter((t) => {
    const open = Date.parse(t.openTime) + off;
    const close = Date.parse(t.closeTime) + off;
    return Math.floor(open / DAY_MS) !== Math.floor(close / DAY_MS);
  });
}

function whyProCent(s, j) {
  const P = JOURNAL.procent;
  const held = overnight(s.trades, j.account.serverUtcOffsetMinutes);
  const swap = s.trades.reduce((a, t) => a + (t.swap ?? 0), 0);
  const commission = s.trades.reduce((a, t) => a + (t.commission ?? 0), 0);
  const fact = (title, value, body) => `
      <div class="panel">
        <p class="eyebrow">${title}</p>
        <h3 class="num">${value}</h3>
        <p style="margin:.75rem 0 0;color:var(--text-dim)">${body}</p>
      </div>`;
  return `
<section class="block rule-top" id="why-procent">
  <div class="wrap">
    <p class="eyebrow">Why this account</p>
    <h2>Why RoboForex ProCent</h2>
    <p class="lede" style="margin:1rem 0 2rem">
      A small balance only grows if costs do not eat it. ProCent is RoboForex's cent account: it trades the same
      gold price in cents, with no commission, and with RoboForex's Swap-Free option it pays no overnight fee
      either. The two figures below come from this account's own trades, not from the broker's brochure.
    </p>
    <div class="grid-3">
      ${fact('Commission paid', cents(commission), `Across all ${s.count} closed trades. ProCent charges no per-lot commission; the cost of a trade is the spread.`)}
      ${fact('Swap paid', cents(swap), `Including ${held.length} trade${held.length === 1 ? '' : 's'} held through the daily rollover. On a standard ProCent account gold carries a swap of ${P.goldSwapLong} points long and +${P.goldSwapShort} short; this account was opened with Swap-Free.`)}
      ${fact('Cent units', '1,600¢ = $16', 'Balances and profits are in US cents, so a $16 account can run proper position sizing: a 0.01 lot gold trade moves about 1¢ per $1 move in gold.')}
    </div>
    <p class="lede" style="margin:2rem 0 0">
      What it still costs: the spread. RoboForex's specifications list an average ProCent gold spread of
      ${P.goldAvgSpreadPoints} points, paid on every entry, so a scalper has to beat that on each trade. Swap-Free is
      an option chosen when the account is opened, is subject to RoboForex's terms and may not be offered in every
      region.
    </p>
    <p class="trader-sub" style="margin-top:1rem">
      Broker terms checked ${esc(P.checked)}:
      <a href="${esc(LINKS.roboforexPage(P.specsUrl))}" target="_blank" rel="sponsored nofollow">ProCent specifications</a> ·
      <a href="${esc(LINKS.roboforexPage(P.swapFreeUrl))}" target="_blank" rel="sponsored nofollow">Swap-Free terms</a>.
      Live figures are this account's own deals, synced hourly.
    </p>
    <div class="btn-row">
      <a class="btn btn--primary" href="${esc(LINKS.roboforexSignup())}" rel="sponsored nofollow" target="_blank">Open a RoboForex ProCent account</a>
    </div>
    <p class="risk-note" style="margin-top:1.5rem">Affiliate link: if you open an account through it, the site may earn a commission at no cost to you.</p>
  </div>
</section>`;
}

/* ------------------------------------------------------------------ page */

export function journalPage(j, notes = {}) {
  const s = journalStats(j);
  const recent = [...s.trades].reverse().slice(0, JOURNAL.recentTrades);
  const synced = j.syncedAt.slice(0, 16).replace('T', ' ');

  return `${head({
    title: '$16 to $100 challenge: live MT5 trading journal | DailyScalper',
    description: `The author's real RoboForex MT5 cent account, synced hourly: ${s.count} trades, ${pct(s.gainPct).replace(/<[^>]+>/g, '')} gain, ${s.maxDdPct.toFixed(2)}% max drawdown. Daily P&L calendar, Myfxbook-style statistics and every trade. Copy trading opens when it reaches $100.`,
    canonical: `${SITE}/journal/`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
              { '@type': 'ListItem', position: 2, name: 'Journal', item: `${SITE}/journal/` },
            ],
          },
          {
            '@type': 'Dataset',
            '@id': `${SITE}/journal/#dataset`,
            name: 'DailyScalper live MT5 trading journal',
            description: 'Closed trades and daily results of the author’s real RoboForex MetaTrader 5 cent account, in US cents.',
            dateModified: j.syncedAt,
            temporalCoverage: `${s.firstTime.slice(0, 10)}/${j.syncedAt.slice(0, 10)}`,
            creator: { '@id': `${SITE}/#org` },
          },
        ],
      },
    ],
  })}
${masthead('journal')}

<section class="hero" style="padding-block:clamp(3rem,7vw,5rem) 2rem">
  <div class="wrap hero__inner">
    <p class="eyebrow">Live journal · ${esc(j.account.broker)} ${esc(j.account.platform)} · ${esc(j.account.type)} cent account</p>
    <h1>From $16 to $100, <em>in public</em></h1>
    <p class="lede">
      The author's own real account, read straight from the MetaTrader 5 terminal every hour. Nothing is typed in by hand and
      nothing is left out: winning days, losing days and manual trades all count. Synced
      <span class="num">${esc(synced)} UTC</span>.
    </p>
    ${headline(s, j)}
  </div>
</section>

<section class="block rule-top" style="padding-top:2.5rem">
  <div class="wrap">
    ${goalPanel(s, j)}
  </div>
</section>

<section class="block rule-top" id="calendar">
  <div class="wrap">
    <p class="eyebrow">Daily results</p>
    <h2>Calendar</h2>
    <p class="lede" style="margin:1rem 0 2rem">
      Each day shows net profit in cents, the number of trades closed and that day's gain. Days run midnight to
      midnight UTC and a trade counts on the day it closed. Darker shading means a bigger day.
    </p>
    ${calendars(s, j, notes)}
  </div>
</section>

<section class="block rule-top" id="days">
  <div class="wrap">
    <p class="eyebrow">Day by day</p>
    <h2>Each day, as the phone shows it</h2>
    <p class="lede" style="margin:1rem 0 2rem">
      Every trade of the day, profits and losses alike, in the layout of the MetaTrader 5 History screen on an
      iPhone. Times are UTC; amounts are cents, as the terminal reports them. Newest day first.
    </p>
    <div class="phones">${phoneDays(s, j)}</div>
  </div>
</section>

<section class="block rule-top" id="growth">
  <div class="wrap">
    <p class="eyebrow">Growth</p>
    <h2>Balance and monthly gain</h2>
    <div style="margin-top:2rem">${balanceChart(s)}</div>
    <div style="margin-top:1.5rem">${monthlyTable(s)}</div>
  </div>
</section>

<section class="block rule-top" id="stats">
  <div class="wrap">
    <p class="eyebrow">Statistics</p>
    <h2>The numbers Myfxbook and MQL5 would show</h2>
    <p class="lede" style="margin:1rem 0 2rem">
      Computed from the closed trades below, with the definitions those services publish, so you can check any of
      them by hand. A record this short says very little: wait for months, not days, before reading much into a ratio.
    </p>
    ${statsTable(s)}
  </div>
</section>

<section class="block rule-top" id="activity">
  <div class="wrap">
    <p class="eyebrow">When it trades</p>
    <h2>Activity</h2>
    <div style="margin-top:2rem">${activity(s)}</div>
  </div>
</section>

<section class="block rule-top" id="trades">
  <div class="wrap">
    <p class="eyebrow">Trade history</p>
    <h2>Open now</h2>
    <div style="margin:1.5rem 0 3rem">${openTable(j)}</div>
    <h2>Last ${recent.length} closed trades</h2>
    <div class="table-scroll" style="margin-top:1.5rem">
    <table class="ledger">
      <thead><tr><th>Closed (UTC)</th><th>Trade</th><th>Lots</th><th>Entry</th><th>Exit</th><th>Held</th><th>Closed by</th><th>Profit</th><th>Return</th></tr></thead>
      <tbody>${tradeRows(recent)}</tbody>
    </table>
    </div>
  </div>
</section>

${whyProCent(s, j)}

${notesList(notes)}

<section class="block rule-top">
  <div class="wrap">
    <p class="risk-note">
      <strong>About these figures.</strong> This is a RoboForex <strong>cent account</strong>: amounts are US cents and
      lot sizes are cent lots, so the money at risk is a hundredth of what the same numbers would mean on a standard
      account. Data is read from the author's MetaTrader 5 terminal through a read-only connection and published as
      reported; it has not been audited. Past results do not predict future ones, and a few weeks of trades are far
      too few to judge a strategy. This page is a journal, not an offer: nothing here can be copied until the
      account reaches its goal, and copying it then could still lose the whole amount.
    </p>
    <div class="btn-row">
      <a class="btn btn--primary" href="/rankings/">See screened strategies you can copy today</a>
      <a class="btn btn--ghost" href="${esc(LINKS.roboforexSignup())}" rel="sponsored nofollow" target="_blank">Open a RoboForex account</a>
    </div>
  </div>
</section>

${footer(j.syncedAt)}`;
}
