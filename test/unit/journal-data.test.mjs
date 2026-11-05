import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconstruct, serverOffset, exitOf, iso } from '../../scripts/journal-data.mjs';

const deal = (o) => ({ symbol: 'XAUUSD', volume: 0.01, profit: 0, ...o });

test('pairs in and out deals into one closed trade', () => {
  const { trades, cashflow } = reconstruct([
    deal({ position_id: '1', action: 'buy', entry: 'in', reason: 'Expert', open_time: '2026-11-03T13:35:06', price_open: 3904.33 }),
    deal({ position_id: '1', action: 'sell', entry: 'out', reason: 'Take profit', open_time: '2026-11-03T14:24:43', price_open: 3914.34, volume_closed: 0.01, profit: 10.01 }),
  ]);
  assert.equal(cashflow.length, 0);
  assert.equal(trades.length, 1);
  assert.deepEqual(
    { side: trades[0].side, by: trades[0].by, exit: trades[0].exit, profit: trades[0].profit, openPrice: trades[0].openPrice, closePrice: trades[0].closePrice },
    { side: 'buy', by: 'ea', exit: 'tp', profit: 10.01, openPrice: 3904.33, closePrice: 3914.34 }
  );
  assert.equal(trades[0].openTime, '2026-11-03T13:35:06Z');
});

test('balance deals become cash movements, not trades', () => {
  const { trades, cashflow } = reconstruct([
    { action: 'balance', entry: 'in', open_time: '2026-11-02T16:03:01', profit: 1600.96, position_id: '0' },
  ]);
  assert.equal(trades.length, 0);
  assert.deepEqual(cashflow, [{ time: '2026-11-02T16:03:01Z', kind: 'balance', amount: 1600.96 }]);
});

test('commission and swap are charged into profit and kept separately', () => {
  const { trades } = reconstruct([
    deal({ position_id: '2', action: 'sell', entry: 'in', reason: 'Client', open_time: '2026-11-04T10:00:00', price_open: 4000, commission: -0.5 }),
    deal({ position_id: '2', action: 'buy', entry: 'out', reason: 'Client', open_time: '2026-11-05T10:00:00', price_open: 3990, volume_closed: 0.01, profit: 10, swap: -1.2, commission: -0.5 }),
  ]);
  assert.equal(trades[0].profit, 7.8);
  assert.equal(trades[0].swap, -1.2);
  assert.equal(trades[0].commission, -1);
  assert.equal(trades[0].by, 'manual');
  assert.equal(trades[0].exit, 'manual');
});

test('a partly closed position is not reported as closed', () => {
  const { trades } = reconstruct([
    deal({ position_id: '3', action: 'buy', entry: 'in', reason: 'Expert', open_time: '2026-11-04T10:00:00', price_open: 4000, volume: 0.03 }),
    deal({ position_id: '3', action: 'sell', entry: 'out', reason: 'Expert', open_time: '2026-11-04T11:00:00', price_open: 4010, volume: 0.01, volume_closed: 0.01, profit: 10 }),
  ]);
  assert.equal(trades.length, 0);
});

test('partial closes add up once the whole volume is out', () => {
  const { trades } = reconstruct([
    deal({ position_id: '4', action: 'buy', entry: 'in', reason: 'Expert', open_time: '2026-11-04T10:00:00', price_open: 4000, volume: 0.02 }),
    deal({ position_id: '4', action: 'sell', entry: 'out', reason: 'Take profit', open_time: '2026-11-04T11:00:00', price_open: 4010, volume_closed: 0.01, profit: 10 }),
    deal({ position_id: '4', action: 'sell', entry: 'out', reason: 'Stop loss', open_time: '2026-11-04T12:00:00', price_open: 4005, volume_closed: 0.01, profit: 5 }),
  ]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].profit, 15);
  assert.equal(trades[0].exit, 'sl');
  assert.equal(trades[0].closeTime, '2026-11-04T12:00:00Z');
});

test('an out deal without its entry (before the window) is ignored', () => {
  const { trades } = reconstruct([
    deal({ position_id: '9', action: 'sell', entry: 'out', reason: 'Expert', open_time: '2026-11-04T11:00:00', price_open: 4010, volume_closed: 0.01, profit: 10 }),
  ]);
  assert.equal(trades.length, 0);
});

test('trades come out sorted by close time', () => {
  const { trades } = reconstruct([
    deal({ position_id: 'a', action: 'buy', entry: 'in', reason: 'Expert', open_time: '2026-11-04T01:00:00', price_open: 1 }),
    deal({ position_id: 'b', action: 'buy', entry: 'in', reason: 'Expert', open_time: '2026-11-04T02:00:00', price_open: 1 }),
    deal({ position_id: 'b', action: 'sell', entry: 'out', reason: 'Expert', open_time: '2026-11-04T03:00:00', price_open: 2, volume_closed: 0.01, profit: 1 }),
    deal({ position_id: 'a', action: 'sell', entry: 'out', reason: 'Expert', open_time: '2026-11-04T04:00:00', price_open: 2, volume_closed: 0.01, profit: 1 }),
  ]);
  assert.deepEqual(trades.map((t) => t.openTime.slice(11, 13)), ['02', '01']);
});

test('exit reasons collapse to a small set', () => {
  assert.equal(exitOf('Take profit'), 'tp');
  assert.equal(exitOf('Stop loss'), 'sl');
  assert.equal(exitOf('Stop out'), 'stopout');
  assert.equal(exitOf('Expert'), 'ea');
  assert.equal(exitOf('Mobile'), 'manual');
});

test('serverOffset reads the broker clock in half-hour steps', () => {
  assert.equal(serverOffset({ utc_time: '2026-11-05T08:34:07Z', trade_server_last_known_time: '2026-11-05T10:34:07' }), 120);
  assert.equal(serverOffset({ utc_time: '2026-07-05T08:34:07Z', trade_server_last_known_time: '2026-07-05T11:34:09' }), 180);
  assert.equal(serverOffset({}), null);
});

test('iso marks terminal times as UTC', () => {
  assert.equal(iso('2026-11-05 08:00:33'), '2026-11-05T08:00:33Z');
  assert.equal(iso('2026-11-05T08:00:33Z'), '2026-11-05T08:00:33Z');
  assert.equal(iso(null), null);
});
