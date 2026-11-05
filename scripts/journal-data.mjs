/**
 * Pure helpers that turn MT5 deals into the journal's trades and cash
 * movements. No I/O, so test/unit/journal-data.test.mjs can exercise them
 * without the VPS.
 */


export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export const iso = (t) => (t ? `${t.replace(' ', 'T')}${t.endsWith('Z') ? '' : 'Z'}` : null);
export const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/** MT5 deal reasons, collapsed to who or what ended the trade. */
const EXIT = {
  'Take profit': 'tp',
  'Stop loss': 'sl',
  'Stop out': 'stopout',
  Expert: 'ea',
};
export const exitOf = (reason) => EXIT[reason] ?? 'manual';

/**
 * Rebuilds positions from deals rather than trusting the aggregated position
 * view, so partial closes and per-deal commission/swap are counted once each.
 */
export function reconstruct(deals) {
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
        swap: num(d.swap),
        commission: num(d.commission) + num(d.fee),
      });
      continue;
    }

    // entry out / out_by / inout
    const p = positions.get(key);
    if (!p) continue; // opened before the history window
    p.closedVolume += num(d.volume_closed ?? d.volume);
    p.profit += num(d.profit) + costs;
    p.swap += num(d.swap);
    p.commission += num(d.commission) + num(d.fee);
    p.closeTime = iso(d.open_time);
    p.closePrice = d.price_open;
    p.exit = exitOf(d.reason);
  }

  const trades = [...positions.values()]
    .filter((p) => p.closeTime && p.closedVolume >= p.volume - 1e-9)
    .map(({ closedVolume, ...p }) => ({ ...p, profit: round(p.profit), swap: round(p.swap), commission: round(p.commission) }))
    .sort((a, b) => a.closeTime.localeCompare(b.closeTime));

  return { trades, cashflow };
}

/** Broker server clock minus UTC, in minutes, from get_time_information. */
export function serverOffset(c) {
  const server = Date.parse(`${c?.trade_server_last_known_time}Z`);
  const utc = Date.parse(c?.utc_time);
  if (!Number.isFinite(server) || !Number.isFinite(utc)) return null;
  return Math.round((server - utc) / 1_800_000) * 30; // whole half-hours
}
