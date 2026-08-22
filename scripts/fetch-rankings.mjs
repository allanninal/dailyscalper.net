/**
 * Weekly ranking builder.
 *
 * Pulls the public strategy data from both brokers, applies the published
 * eligibility gates, throws out anything that looks like martingale, ranks what
 * survives by return-per-drawdown, and writes data/rankings.json.
 *
 * No API keys, no auth, no dependencies. Run: node scripts/fetch-rankings.mjs
 */
import { writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { GATES, PERIOD, BOARDS, SNAPSHOT_RETENTION_DAYS } from './config.mjs';
import {
  maxDrawdownFromCurve,
  detectMartingale,
  riskAdjustedScore,
  round,
  daysBetween,
} from './analyze.mjs';

const TOP_N = 10;
/** LiteFinance's sampled curve cannot resolve dips smaller than roughly this. */
const DERIVED_DD_FLOOR_PCT = 5;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/* ------------------------------------------------------------------ RoboForex */

async function fetchRoboForexPage(offset, limit = 100, period = PERIOD.roboforex) {
  const res = await fetch('https://roboforex.com/api/copy/getRating', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': UA,
    },
    body: JSON.stringify({
      period,
      platforms: ['mt4', 'mt5', 'rst'],
      sort: [{ field: 'profit_percent', order: 'desc' }],
      page: { limit, offset },
    }),
  });
  if (!res.ok) throw new Error(`RoboForex HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(`RoboForex API: ${json.message}`);
  return { entries: json.data.entries ?? [], more: json.data.page?.more };
}

async function collectRoboForex(maxRows = 500, period = PERIOD.roboforex) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += 100) {
    const { entries, more } = await fetchRoboForexPage(offset, 100, period);
    rows.push(...entries);
    if (!more || entries.length === 0) break;
  }
  return rows;
}

function evaluateRoboForex(raw) {
  const g = GATES.roboforex;
  const curve = (raw.profit_percent_chart ?? []).map(([, pct]) => pct);
  const ddOfficial = Math.abs(raw.dd_max ?? 0);
  const trackDays = daysBetween(raw.offer_initial_date ?? raw.registration_time);
  const martingale = detectMartingale(curve, ddOfficial);

  const rejections = [];
  if (trackDays !== null && trackDays < g.minTrackRecordDays)
    rejections.push(`only ${trackDays}d track record`);
  if (ddOfficial > g.maxDrawdownPct) rejections.push(`${round(ddOfficial, 1)}% max drawdown`);
  if ((raw.deal_count ?? 0) < g.minDeals) rejections.push(`${raw.deal_count ?? 0} trades`);
  if ((raw.subscriber_count ?? 0) < g.minCopiers)
    rejections.push(`${raw.subscriber_count ?? 0} copiers`);
  if ((raw.profit_percent ?? 0) <= g.minYieldPct) rejections.push('not net positive');
  if ((raw.profit_percent ?? 0) > g.maxYieldPct)
    rejections.push(`${round(raw.profit_percent, 0)}% yield is implausible`);
  if (martingale.length) rejections.push(...martingale);

  return {
    broker: 'roboforex',
    id: `${raw.source_id}-${raw.login}`,
    // Kept as separate fields so the affiliate URL is built at render time.
    // Baking the URL in here would mean refetching broker data just to change a
    // partner code.
    sourceId: raw.source_id,
    login: raw.login,
    trader: raw.name,
    strategy: raw.strategy,
    yieldPct: round(raw.profit_percent, 2),
    drawdownPct: round(ddOfficial, 2),
    drawdownSource: 'broker-published',
    trades: raw.deal_count ?? null,
    copiers: raw.subscriber_count ?? 0,
    trackDays,
    minDepositUsd: raw.min_equity_usd ?? null,
    commissionPct: raw.offer?.commission?.rate ?? null,
    leverage: raw.leverage ?? null,
    curve,
    score: riskAdjustedScore(raw.profit_percent ?? 0, ddOfficial),
    martingaleFlags: martingale,
    rejections,
    eligible: rejections.length === 0,
  };
}

/* ---------------------------------------------------------------- LiteFinance */

const decode = (s = '') =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();

const num = (s) => {
  if (s === null || s === undefined) return null;
  const cleaned = String(s).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

function parseLiteFinanceCards(html) {
  const cards = html.split('<div class="card card_trader"').slice(1);
  return cards
    .map((card) => {
      const pick = (re) => {
        const m = card.match(re);
        return m ? decode(m[1]) : null;
      };
      const id = pick(/\/traders\/info\?id=(\d+)/);
      if (!id) return null;

      const values = [...card.matchAll(/<div class="data_value">([\s\S]*?)<\/div>/g)].map((m) =>
        decode(m[1].replace(/<[^>]+>/g, ''))
      );

      const curve = (pick(/data-points="([^"]+)"/) ?? '')
        .split(',')
        .map(Number)
        .filter(Number.isFinite);

      return {
        id,
        nickname: pick(/<div class="title">([\s\S]*?)<\/div>/)?.replace(/^@/, '') ?? null,
        realName: pick(/<div class="subtitle">([\s\S]*?)<\/div>/),
        yieldPct: num(values[0]),
        riskScore: num(pick(/<span>\s*(\d+)\s*<small>/)),
        copiers: num(values[1]),
        managedUsd: values[2] ?? null,
        curve,
      };
    })
    .filter(Boolean);
}

/**
 * LiteFinance's public board shows only ~16 cards per view and ignores a page
 * param, so the pool is widened by merging its three published orderings rather
 * than by paginating. This is the entire public universe available without login.
 */
async function collectLiteFinance() {
  const views = ['profit', 'risk', 'total_equity'];
  const seen = new Map();
  for (const type of views) {
    try {
      const res = await fetch(`https://my.litefinance.org/traders?type=${type}`, {
        headers: { 'user-agent': UA },
      });
      if (!res.ok) continue;
      for (const c of parseLiteFinanceCards(await res.text())) {
        if (!seen.has(c.id)) seen.set(c.id, c);
      }
    } catch {
      /* one view failing should not sink the others */
    }
  }
  return [...seen.values()];
}

function evaluateLiteFinance(raw) {
  const g = GATES.litefinance;
  // LiteFinance publishes no drawdown figure, so we derive it from the curve they
  // do publish. Flagged as 'derived' everywhere it is displayed.
  const dd = maxDrawdownFromCurve(raw.curve);
  const martingale = detectMartingale(raw.curve, dd);

  const rejections = [];
  if (raw.curve.length < g.minCurvePoints) rejections.push('too little published history');
  if (raw.riskScore !== null && raw.riskScore > g.maxRiskScore)
    rejections.push(`broker risk score ${raw.riskScore}/10`);
  if (dd !== null && dd > g.maxDrawdownPct) rejections.push(`${round(dd, 1)}% derived drawdown`);
  if ((raw.copiers ?? 0) < g.minCopiers) rejections.push(`${raw.copiers ?? 0} copiers`);
  if ((raw.yieldPct ?? 0) <= g.minYieldPct) rejections.push('not net positive');
  if ((raw.yieldPct ?? 0) > g.maxYieldPct)
    rejections.push(`${round(raw.yieldPct, 0)}% yield is implausible`);
  if (martingale.length) rejections.push(...martingale);

  return {
    broker: 'litefinance',
    id: raw.id,
    trader: raw.nickname ?? raw.realName,
    strategy: raw.realName ?? null,
    yieldPct: round(raw.yieldPct, 2),
    // The published curve is sampled, not daily, so this is a floor on the true
    // drawdown. Always rendered with a "≥".
    drawdownPct: dd,
    drawdownSource: 'derived-from-curve',
    drawdownIsLowerBound: true,
    riskScore: raw.riskScore,
    copiers: raw.copiers ?? 0,
    managedUsd: raw.managedUsd,
    trades: null,
    trackDays: null,
    curve: raw.curve,
    score: riskAdjustedScore(raw.yieldPct ?? 0, dd ?? 100, DERIVED_DD_FLOOR_PCT),
    martingaleFlags: martingale,
    rejections,
    eligible: rejections.length === 0,
  };
}

/* ----------------------------------------------------------------------- main */

function summarise(all) {
  const eligible = all.filter((x) => x.eligible).sort((a, b) => b.score - a.score);

  // The most seductive rejects: highest advertised yield that we refused to rank.
  // These are what a copier would have picked by sorting the broker's own board.
  const notableRejections = all
    .filter((x) => !x.eligible && x.martingaleFlags.length)
    .sort((a, b) => (b.yieldPct ?? 0) - (a.yieldPct ?? 0))
    .slice(0, 5)
    .map((x) => ({
      trader: x.trader,
      strategy: x.strategy,
      yieldPct: x.yieldPct,
      drawdownPct: x.drawdownPct,
      reasons: x.martingaleFlags,
    }));

  return {
    ranked: eligible.slice(0, TOP_N).map((x, i) => ({ ...x, rank: i + 1 })),
    screened: all.length,
    eligibleCount: eligible.length,
    rejectedForMartingale: all.filter((x) => x.martingaleFlags.length).length,
    notableRejections,
  };
}

/* ------------------------------------------------------------- snapshots */

const SNAP_DIR = 'data/snapshots';
const snapKey = (r) => `${r.broker}:${r.id}`;

/** Today's flagship board, reduced to what a movement calculation needs. */
function snapshotOf(ranked) {
  return Object.fromEntries(
    ranked.map((r) => [snapKey(r), { rank: r.rank, yieldPct: r.yieldPct, score: r.score }])
  );
}

async function previousSnapshot(today) {
  let files;
  try {
    files = (await readdir(SNAP_DIR)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return null; // no snapshot directory yet — first ever run
  }
  const prior = files.filter((f) => f.slice(0, 10) < today);
  if (!prior.length) return null;
  const name = prior[prior.length - 1];
  try {
    return JSON.parse(await readFile(`${SNAP_DIR}/${name}`, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Day-over-day movement of the flagship board. Neither broker publishes a daily
 * window, so this is the only honest daily figure available: how a strategy's
 * rank and yield changed between two of our own dated observations. Entries with
 * no prior observation are reported as new, never as a zero change.
 */
function dailyMovement(ranked, prev) {
  if (!prev) return { since: null, comparedTo: null, entries: [] };
  const before = prev.entries ?? {};
  const entries = ranked.map((r) => {
    const was = before[snapKey(r)];
    return {
      broker: r.broker,
      id: r.id,
      trader: r.trader,
      strategy: r.strategy,
      rank: r.rank,
      yieldPct: r.yieldPct,
      isNew: !was,
      rankDelta: was ? was.rank - r.rank : null, // positive = climbed
      yieldDelta: was ? round(r.yieldPct - was.yieldPct, 2) : null,
    };
  });
  return { since: prev.date, comparedTo: prev.date, entries };
}

async function pruneSnapshots(today) {
  let files;
  try {
    files = (await readdir(SNAP_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    return;
  }
  const cutoff = new Date(Date.parse(today) - SNAPSHOT_RETENTION_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const { unlink } = await import('node:fs/promises');
  for (const f of files) {
    if (f.slice(0, 10) < cutoff) await unlink(`${SNAP_DIR}/${f}`).catch(() => {});
  }
}

async function main() {
  const errors = [];
  let rf = [];
  let lf = [];

  try {
    rf = (await collectRoboForex()).map(evaluateRoboForex);
  } catch (e) {
    errors.push(`roboforex: ${e.message}`);
  }
  try {
    lf = (await collectLiteFinance()).map(evaluateLiteFinance);
  } catch (e) {
    errors.push(`litefinance: ${e.message}`);
  }

  if (!rf.length && !lf.length) {
    console.error('Both sources failed — refusing to overwrite rankings.json');
    console.error(errors.join('\n'));
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);

  /* Extra boards. Each is a separate RoboForex period; LiteFinance has no period
     parameter at all, so it joins the all-time board only. A board that fails to
     fetch is omitted rather than published empty. */
  const boards = {};
  for (const board of BOARDS) {
    if (board.source !== 'roboforex') continue;
    try {
      const rows = (await collectRoboForex(500, board.roboforexPeriod)).map(evaluateRoboForex);
      boards[board.key] = {
        label: board.label,
        roboforex: summarise(rows),
        ...(board.includeLiteFinance && lf.length ? { litefinance: summarise(lf) } : {}),
      };
    } catch (e) {
      errors.push(`board ${board.key}: ${e.message}`);
    }
  }

  const flagship = summarise(rf);
  const flagshipLf = summarise(lf);
  const prev = await previousSnapshot(today);

  const payload = {
    generatedAt: new Date().toISOString(),
    methodologyVersion: 2,
    gates: GATES,
    brokers: {
      roboforex: flagship,
      litefinance: flagshipLf,
    },
    boards,
    daily: dailyMovement([...flagship.ranked, ...flagshipLf.ranked], prev),
    errors,
  };

  await mkdir('data', { recursive: true });
  await writeFile('data/rankings.json', JSON.stringify(payload, null, 2) + '\n');

  await mkdir(SNAP_DIR, { recursive: true });
  await writeFile(
    `${SNAP_DIR}/${today}.json`,
    JSON.stringify(
      { date: today, entries: snapshotOf([...flagship.ranked, ...flagshipLf.ranked]) },
      null,
      2
    ) + '\n'
  );
  await pruneSnapshots(today);

  for (const [name, b] of Object.entries(payload.brokers)) {
    console.log(
      `${name.padEnd(12)} screened ${String(b.screened).padStart(4)} | eligible ${String(
        b.eligibleCount
      ).padStart(3)} | martingale-flagged ${String(b.rejectedForMartingale).padStart(3)} | published ${b.ranked.length}`
    );
  }
  for (const [key, b] of Object.entries(boards)) {
    console.log(
      `board ${key.padEnd(10)} roboforex ${String(b.roboforex.ranked.length).padStart(2)} published${
        b.litefinance ? ` | litefinance ${b.litefinance.ranked.length}` : ''
      }`
    );
  }
  console.log(
    payload.daily.since
      ? `daily movement vs ${payload.daily.since} (${payload.daily.entries.length} tracked)`
      : `daily movement: no prior snapshot — tracking starts ${today}`
  );
  if (errors.length) console.warn('Warnings:', errors.join('; '));
}

main();
