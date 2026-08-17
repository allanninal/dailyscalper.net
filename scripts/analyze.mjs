/**
 * Curve analysis shared by both brokers.
 *
 * Every input is a series of CUMULATIVE return percentages. We convert to an
 * equity multiplier first so drawdown and daily returns are computed the same
 * way regardless of which broker published the numbers.
 */
import { MARTINGALE } from './config.mjs';

const toEquity = (pct) => 1 + pct / 100;

/** Peak-to-trough decline, as a positive percentage. */
export function maxDrawdownFromCurve(curve) {
  if (!curve || curve.length < 2) return null;
  let peak = -Infinity;
  let worst = 0;
  for (const pct of curve) {
    const eq = toEquity(pct);
    if (eq > peak) peak = eq;
    if (peak > 0) {
      const dd = ((peak - eq) / peak) * 100;
      if (dd > worst) worst = dd;
    }
  }
  return round(worst, 2);
}

/** Period-over-period returns derived from the cumulative curve. */
function stepReturns(curve) {
  const out = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = toEquity(curve[i - 1]);
    const cur = toEquity(curve[i]);
    if (prev <= 0) continue;
    out.push(((cur - prev) / prev) * 100);
  }
  return out;
}

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Martingale / grid detection.
 *
 * A martingale account averages down into losers, so losses stay invisible until
 * the pyramid unwinds all at once. The signature is a long run of small, highly
 * consistent gains followed by one cliff — NOT a normally volatile curve. We also
 * flag a near-perfect win rate paired with a real drawdown, which is the same
 * story told a different way.
 *
 * Returns a list of human-readable reasons; empty means it looks clean.
 */
export function detectMartingale(curve, knownDrawdownPct) {
  const reasons = [];
  const steps = stepReturns(curve || []);
  if (steps.length < 5) return reasons;

  const drops = steps.filter((r) => r < 0);
  const worstDrop = Math.min(...steps, 0);
  const typical = median(steps.map(Math.abs)) || 0.01;
  const cliffRatio = Math.abs(worstDrop) / typical;

  if (cliffRatio >= MARTINGALE.cliffRatio && Math.abs(worstDrop) >= MARTINGALE.minCliffDropPct) {
    reasons.push(
      `single ${round(Math.abs(worstDrop), 1)}% cliff vs ${round(typical, 2)}% typical move`
    );
  }

  const winRate = 1 - drops.length / steps.length;
  const dd = knownDrawdownPct ?? maxDrawdownFromCurve(curve) ?? 0;
  if (winRate >= MARTINGALE.suspiciousWinRate && dd >= MARTINGALE.withDrawdownPct) {
    reasons.push(
      `${round(winRate * 100, 0)}% winning periods yet a ${round(dd, 0)}% drawdown — losses are being averaged down`
    );
  }

  return reasons;
}

/**
 * Return per unit of pain: how much yield the strategy produced for each 1% it
 * asked the copier to sit through. Deliberately simple so it can be published
 * and checked by anyone.
 */
export function riskAdjustedScore(yieldPct, drawdownPct, ddFloorPct = 1) {
  // The floor is a statement about evidence quality, not a fudge factor. Where the
  // drawdown is broker-published and precise the floor is ~1%. Where it is derived
  // from a sparsely sampled curve, a "0%" drawdown only means the samples missed the
  // dip, so the floor rises to stop unmeasurable risk from scoring as no risk.
  const dd = Math.max(Math.abs(drawdownPct ?? 0), ddFloorPct);
  return round(yieldPct / dd, 2);
}

export const round = (n, dp = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp;

export const daysBetween = (iso, now = new Date()) => {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((now - then) / 86400000);
};
