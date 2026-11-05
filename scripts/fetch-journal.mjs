/**
 * Pulls the author's live MT5 account from the MetaTrader 5 terminal on the
 * Windows VPS and writes data/journal.json. Run hourly by journal-update.sh.
 *
 *   node scripts/fetch-journal.mjs
 *
 * The terminal exposes an MCP server on the VPS. ~/.claude/bin/mt5-mcp-headers
 * opens the SSH tunnel to it (127.0.0.1:22346) and prints the Authorization
 * header, reading the key from the Keychain; the key stays in this process's
 * memory and is never written or logged. Every call used here is read-only, and
 * trading is disabled for MCP in that terminal anyway.
 *
 * Only what the journal page shows is kept. The account holder's name, the
 * login, transfer comments and EA comments never reach the JSON: the repo and
 * the site are public.
 *
 * Exit codes: 0 = written or unchanged, 1 = terminal unreachable (nothing touched).
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';

const OUT = 'data/journal.json';
const MCP_URL = 'http://127.0.0.1:22346/mcp';
const HEADERS_HELPER = `${homedir()}/.claude/bin/mt5-mcp-headers`;
const HISTORY_FROM = '2020-01-01T00:00:00';

/* ------------------------------------------------------------- MCP client */

let auth;
let session;

async function rpc(method, params, id) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      ...auth,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(session ? { 'mcp-session-id': session } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(id ? { id } : {}) }),
    signal: AbortSignal.timeout(90_000),
  });
  session = res.headers.get('mcp-session-id') ?? session;
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  if (!id) return null; // notification
  let text = await res.text();
  // Streamable HTTP may answer as a one-event SSE stream instead of plain JSON.
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    text = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5))
      .join('');
  }
  const msg = JSON.parse(text);
  if (msg.error) throw new Error(`${method}: ${msg.error.message}`);
  return msg.result;
}

let nextId = 1;
async function tool(name, args = {}) {
  const result = await rpc('tools/call', { name, arguments: args }, ++nextId);
  const text = result?.content?.find((c) => c.type === 'text')?.text ?? '';
  if (result?.isError) throw new Error(`${name}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/* --------------------------------------------------------- reconstruction */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const iso = (t) => (t ? `${t.replace(' ', 'T')}${t.endsWith('Z') ? '' : 'Z'}` : null);
const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/** MT5 deal reasons, collapsed to who or what ended the trade. */
const EXIT = {
  'Take profit': 'tp',
  'Stop loss': 'sl',
  'Stop out': 'stopout',
  Expert: 'ea',
};
const exitOf = (reason) => EXIT[reason] ?? 'manual';

/**
 * Rebuilds positions from deals rather than trusting the aggregated position
 * view, so partial closes and per-deal commission/swap are counted once each.
 */
function reconstruct(deals) {
  const positions = new Map();
  const cashflow = [];

  for (const d of [...deals].sort((a, b) => a.open_time.localeCompare(b.open_time))) {
    const costs = num(d.commission) + num(d.swap) + num(d.fee);

    if (d.action !== 'buy' && d.action !== 'sell') {
      const amount = num(d.profit) + costs;
      if (amount) cashflow.push({ time: iso(d.open_time), kind: d.action, amount: round(amount) });
      continue;
    }

    const key = d.position_id;
    if (d.entry === 'in') {
      positions.set(key, {
        symbol: d.symbol,
        side: d.action,
        by: d.reason === 'Expert' ? 'ea' : 'manual',
        openTime: iso(d.open_time),
        openPrice: d.price_open,
        volume: num(d.volume),
        closedVolume: 0,
        closeTime: null,
        closePrice: null,
        exit: null,
        profit: costs,
      });
      continue;
    }

    // entry out / out_by / inout
    const p = positions.get(key);
    if (!p) continue; // opened before HISTORY_FROM
    p.closedVolume += num(d.volume_closed ?? d.volume);
    p.profit += num(d.profit) + costs;
    p.closeTime = iso(d.open_time);
    p.closePrice = d.price_open;
    p.exit = exitOf(d.reason);
  }

  const trades = [...positions.values()]
    .filter((p) => p.closeTime && p.closedVolume >= p.volume - 1e-9)
    .map(({ closedVolume, ...p }) => ({ ...p, profit: round(p.profit) }))
    .sort((a, b) => a.closeTime.localeCompare(b.closeTime));

  return { trades, cashflow };
}

/* ------------------------------------------------------------------- main */

try {
  auth = JSON.parse(execFileSync(HEADERS_HELPER, { encoding: 'utf8', timeout: 30_000 }));
} catch {
  console.error('FAIL headers helper (tunnel or Keychain) — nothing written');
  process.exit(1);
}

let account, history, open;
try {
  await rpc(
    'initialize',
    { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dailyscalper-journal', version: '1' } },
    1
  );
  await rpc('notifications/initialized', {});
  account = (await tool('get_trading_account_info')).account;
  history = await tool('get_trading_history_orders', {
    datetime_from: HISTORY_FROM,
    datetime_to: new Date(Date.now() + 86_400_000).toISOString().slice(0, 19),
    include_orders: false,
  });
  open = await tool('get_trading_open_positions', { include_orders: false });
} catch (e) {
  console.error(`FAIL MT5 terminal: ${e.message} — nothing written`);
  process.exit(1);
}

if (!account?.server_connected && account?.balance === undefined) {
  console.error('FAIL terminal returned no account — nothing written');
  process.exit(1);
}

const { trades, cashflow } = reconstruct(history.deals ?? []);

const openPositions = (open.positions ?? []).map((p) => ({
  symbol: p.symbol,
  side: p.action,
  by: p.reason === 'Expert' ? 'ea' : 'manual',
  openTime: iso(p.create_time),
  openPrice: p.price_open,
  volume: p.volume,
  floating: round(num(p.profit) + num(p.swap)),
}));

// Shape of the facts that matter. Floating P&L moves every tick, so it alone
// never rewrites the file: the hourly job would otherwise commit every hour.
const material = {
  balance: round(account.balance),
  trades,
  cashflow,
  open: openPositions.map(({ floating, ...p }) => p),
};

let previous = null;
try {
  previous = JSON.parse(await readFile(OUT, 'utf8'));
} catch {}

const previousMaterial = previous && {
  balance: previous.account.balance,
  trades: previous.trades,
  cashflow: previous.cashflow,
  open: previous.openPositions.map(({ floating, ...p }) => p),
};

if (previousMaterial && JSON.stringify(previousMaterial) === JSON.stringify(material)) {
  console.log(`unchanged — ${trades.length} closed trades, ${openPositions.length} open`);
  process.exit(0);
}

const journal = {
  syncedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  source: 'MetaTrader 5 terminal on the author’s VPS, read-only',
  account: {
    broker: 'RoboForex',
    platform: 'MetaTrader 5',
    type: account.type, // real / demo, as the terminal reports it
    margin: account.margin_mode,
    // Cent account: the terminal labels the currency USD, but every amount is US cents.
    unit: 'USC',
    balance: round(account.balance),
    equity: round(account.equity),
    floating: round(account.profit),
  },
  trades,
  cashflow,
  openPositions,
};

await writeFile(OUT, `${JSON.stringify(journal, null, 2)}\n`);
console.log(`wrote ${OUT} — ${trades.length} closed trades, ${cashflow.length} cash movements, ${openPositions.length} open`);
