import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stackTables, masthead, esc } from '../../scripts/templates.mjs';
import { LINKS, AFFILIATE } from '../../scripts/config.mjs';

test('stackTables labels every cell with its column header', () => {
  const out = stackTables(
    '<table class="ledger"><thead><tr><th></th><th>Strategy</th><th>Max <b>DD</b></th></tr></thead><tbody><tr><td>1</td><td>A</td><td>5%</td></tr></tbody></table>'
  );
  assert.match(out, /class="ledger ledger--stack"/);
  assert.match(out, /<td data-label="">1<\/td><td data-label="Strategy">A<\/td><td data-label="Max DD">5%<\/td>/);
});

test('stackTables leaves header-less and journal tables alone', () => {
  const kv = '<table class="ledger"><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
  const journal = '<table class="ledger journal-trades"><thead><tr><th>x</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
  assert.equal(stackTables(kv), kv);
  assert.equal(stackTables(journal), journal);
});

test('masthead has the inline nav and the small-screen menu, both with Journal', () => {
  const html = masthead('journal');
  assert.equal((html.match(/href="\/journal\/"/g) ?? []).length, 2);
  assert.match(html, /<details class="menu">/);
  assert.match(html, /aria-current="page"/);
});

test('every RoboForex link builder carries the partner code', () => {
  assert.equal(AFFILIATE.roboforex, 'vbes');
  for (const url of [
    LINKS.roboforexSignup(),
    LINKS.roboforexStrategy('bbba', 1),
    LINKS.roboforexFreeVps(),
    LINKS.roboforexPage('https://roboforex.com/promo/full-swap-free/'),
    LINKS.roboforexPage('https://roboforex.com/x/?lang=en'),
  ]) {
    assert.match(url, /[?&]a=vbes(&|$)/, url);
  }
});

test('esc neutralises markup', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});
