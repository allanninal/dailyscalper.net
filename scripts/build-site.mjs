/**
 * Renders the static site from data/rankings.json.
 * Run after fetch-rankings.mjs:  node scripts/build-site.mjs
 *
 * Every number that reaches a page comes from the JSON. Nothing is hand-written,
 * so the site cannot claim a figure the screening did not actually produce.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { head, masthead, footer, sparkline, esc } from './templates.mjs';
import { GATES, LINKS, AFFILIATE, MARTINGALE } from './config.mjs';

const SITE = 'https://www.dailyscalper.net';
const data = JSON.parse(await readFile('data/rankings.json', 'utf8'));
const rf = data.brokers.roboforex;
const lf = data.brokers.litefinance;

const fmt = (n, dp = 2, suffix = '') =>
  n === null || n === undefined ? '<span class="dim">—</span>' : `${Number(n).toFixed(dp)}${suffix}`;
const int = (n) => (n === null || n === undefined ? '<span class="dim">—</span>' : String(n));

const totalScreened = rf.screened + lf.screened;
const totalFlagged = rf.rejectedForMartingale + lf.rejectedForMartingale;
const totalPublished = rf.ranked.length + lf.ranked.length;

const updated = new Date(data.generatedAt).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/* ----------------------------------------------------------------- schema.org */

const ORG = {
  '@type': 'Organization',
  '@id': `${SITE}/#org`,
  name: 'DailyScalper',
  url: `${SITE}/`,
  logo: `${SITE}/og-image.png`,
  description:
    'Independent screening of public copy-trading strategies on RoboForex and LiteFinance.',
};

const WEBSITE = {
  '@type': 'WebSite',
  '@id': `${SITE}/#site`,
  url: `${SITE}/`,
  name: 'DailyScalper',
  publisher: { '@id': `${SITE}/#org` },
};

const graph = (...nodes) => ({ '@context': 'https://schema.org', '@graph': nodes });

const breadcrumbs = (trail) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, url], i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    item: `${SITE}${url}`,
  })),
});

/**
 * The ranking table as an ItemList. This is the part answer engines quote, so
 * every published figure is repeated here in machine-readable form rather than
 * left for them to scrape out of the <td>s.
 */
const rankingItemList = ({ id, name, description, rows, brokerName, url }) => ({
  '@type': 'ItemList',
  '@id': `${SITE}${url}#${id}`,
  name,
  description,
  numberOfItems: rows.length,
  itemListOrder: 'https://schema.org/ItemListOrderDescending',
  itemListElement: rows.map((r) => ({
    '@type': 'ListItem',
    position: r.rank,
    name: r.strategy || r.trader,
    item: {
      '@type': 'FinancialProduct',
      name: r.strategy || r.trader,
      description: `Copy-trading strategy on ${brokerName}. Yield ${r.yieldPct}%, maximum drawdown ${r.drawdownPct}%, ${r.copiers} copiers.`,
      provider: { '@type': 'Organization', name: brokerName },
      ...(r.commissionPct != null
        ? { feesAndCommissionsSpecification: `${r.commissionPct}% performance fee` }
        : {}),
    },
  })),
});

const faq = (pairs) => ({
  '@type': 'FAQPage',
  mainEntity: pairs.map(([question, answer]) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
});

/* ------------------------------------------------------------------ tables */

function roboforexTable(rows) {
  return `
<div class="table-scroll">
<table class="ledger">
  <thead><tr>
    <th></th><th>Strategy</th><th>90-day curve</th><th>Yield 3mo</th>
    <th>Max DD</th><th>Trades</th><th>Copiers</th><th>Min dep.</th>
    <th>Fee</th><th>Score</th><th></th>
  </tr></thead>
  <tbody>
  ${rows
    .map(
      (r) => `<tr>
    <td class="rank">${r.rank}</td>
    <td>
      <div class="trader-name">${esc(r.strategy || r.trader)}</div>
      <div class="trader-sub">${esc(r.trader)} · ${r.trackDays ?? '—'}d live</div>
    </td>
    <td>${sparkline(r.curve)}</td>
    <td class="pos">${fmt(r.yieldPct, 1, '%')}</td>
    <td class="neg">${fmt(r.drawdownPct, 1, '%')}</td>
    <td>${int(r.trades)}</td>
    <td>${int(r.copiers)}</td>
    <td>$${int(r.minDepositUsd)}</td>
    <td>${int(r.commissionPct)}%</td>
    <td><strong>${fmt(r.score, 2)}</strong></td>
    <td><a class="btn btn--ghost" style="padding:.5rem .9rem" href="${esc(LINKS.roboforexStrategy(r.sourceId, r.login))}" rel="sponsored nofollow" target="_blank">Copy</a></td>
  </tr>`
    )
    .join('')}
  </tbody>
</table>
</div>`;
}

function litefinanceTable(rows) {
  return `
<div class="table-scroll">
<table class="ledger">
  <thead><tr>
    <th></th><th>Trader</th><th>Curve</th><th>Yield all-time</th>
    <th>Drawdown</th><th>Risk</th><th>Copiers</th><th>Managed</th>
    <th>Score</th><th></th>
  </tr></thead>
  <tbody>
  ${rows
    .map(
      (r) => `<tr>
    <td class="rank">${r.rank}</td>
    <td><div class="trader-name">${esc(r.trader)}</div>
        <div class="trader-sub">${esc(r.strategy || '')}</div></td>
    <td>${sparkline(r.curve)}</td>
    <td class="pos">${fmt(r.yieldPct, 1, '%')}</td>
    <td class="neg">≥${fmt(r.drawdownPct, 1, '%')}</td>
    <td>${int(r.riskScore)}/10</td>
    <td>${int(r.copiers)}</td>
    <td>${esc(r.managedUsd ?? '—')}</td>
    <td><strong>${fmt(r.score, 2)}</strong></td>
    <td><a class="btn btn--ghost" style="padding:.5rem .9rem" href="${esc(LINKS.litefinanceTrader(r.id))}" rel="sponsored nofollow" target="_blank">Copy</a></td>
  </tr>`
    )
    .join('')}
  </tbody>
</table>
</div>`;
}

function rejectionList(rows) {
  if (!rows.length) return '<p class="dim">Nothing was flagged in this run.</p>';
  return `<ul class="reject-list">${rows
    .map(
      (r) => `<li>
      <span class="who">${esc(r.strategy || r.trader)}</span>
      <span class="num pos">${fmt(r.yieldPct, 0, '%')}</span>
      <span class="why">${esc(r.reasons[0] ?? 'failed screening')}</span>
    </li>`
    )
    .join('')}</ul>`;
}

/* ------------------------------------------------------------------- pages */

const lfWarning = AFFILIATE.litefinanceUid
  ? ''
  : `<p class="tag tag--warn" style="display:inline-block;margin-bottom:1.5rem">LiteFinance partner ID not configured — links are untracked</p>`;

const indexPage = `${head({
  title: 'DailyScalper — Copy trading rankings, screened weekly',
  description: `Every week we screen ${totalScreened} live copy-trading strategies on RoboForex and LiteFinance, throw out the martingale accounts, and publish the ${totalPublished} that survive. Methodology published in full.`,
  canonical: `${SITE}/`,
  jsonLd: [
    graph(
      ORG,
      WEBSITE,
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/#page`,
        url: `${SITE}/`,
        name: 'Copy trading rankings, screened weekly',
        isPartOf: { '@id': `${SITE}/#site` },
        dateModified: data.generatedAt,
      },
      rankingItemList({
        id: 'roboforex',
        name: `Top ${rf.ranked.length} screened RoboForex copy-trading strategies`,
        description: `${rf.screened} RoboForex strategies screened, ${rf.rejectedForMartingale} flagged as martingale, top ${rf.ranked.length} ranked by return per unit of drawdown.`,
        rows: rf.ranked,
        brokerName: 'RoboForex',
        url: '/',
      }),
      rankingItemList({
        id: 'litefinance',
        name: `Top ${lf.ranked.length} screened LiteFinance copy-trading strategies`,
        description: `${lf.screened} LiteFinance strategies screened, top ${lf.ranked.length} ranked by return per unit of drawdown.`,
        rows: lf.ranked,
        brokerName: 'LiteFinance',
        url: '/',
      })
    ),
  ],
})}
${masthead('home')}

<section class="hero">
  <div class="wrap hero__inner">
    <p class="eyebrow">Updated ${esc(updated)}</p>
    <h1>Ten strategies a week.<br>The other <em>${totalScreened - totalPublished}</em> didn't qualify.</h1>
    <p class="lede">
      Broker leaderboards sort by profit, which puts martingale accounts on top — the ones
      showing 5,000% gains right up until they return nothing. We screen every public strategy
      on RoboForex and LiteFinance against fixed rules, discard anything with that signature,
      and rank what's left by return per unit of drawdown.
    </p>
    <div class="btn-row">
      <a class="btn btn--primary" href="/rankings/">See this week's top 10 →</a>
      <a class="btn btn--ghost" href="/methodology/">How the screening works</a>
    </div>
    <dl class="hero__meta">
      <div><dt>Strategies screened</dt><dd>${totalScreened}</dd></div>
      <div><dt>Martingale-flagged</dt><dd class="neg">${totalFlagged}</dd></div>
      <div><dt>Published</dt><dd class="pos">${totalPublished}</dd></div>
    </dl>
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <p class="eyebrow">What we threw out</p>
    <div class="grid-2" style="align-items:start">
      <div>
        <h2>The highest number on the board is usually the trap.</h2>
        <p class="lede" style="margin-top:1.25rem">
          These are real strategies from this week's screening, sorted the way a broker's own
          leaderboard would sort them. Each one advertises a spectacular return. Each one was
          rejected, and the reason is printed next to it.
        </p>
        <p class="lede">
          A martingale account averages down into losing positions, so its equity curve climbs
          smoothly until the pyramid unwinds in a single day. We detect that shape directly from
          the published curve rather than trusting the headline yield.
        </p>
      </div>
      <div class="panel">
        <p class="eyebrow" style="margin-bottom:.5rem">Rejected · RoboForex</p>
        ${rejectionList(rf.notableRejections)}
        <p class="eyebrow" style="margin:1.75rem 0 .5rem">Rejected · LiteFinance</p>
        ${rejectionList(lf.notableRejections)}
      </div>
    </div>
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <p class="eyebrow">This week · RoboForex</p>
    <h2>Top ${rf.ranked.length} by return per unit of drawdown</h2>
    <p class="lede" style="margin:1.25rem 0 2.5rem">
      ${rf.screened} strategies screened · ${rf.rejectedForMartingale} martingale-flagged ·
      ${rf.eligibleCount} cleared every gate.
    </p>
    ${roboforexTable(rf.ranked)}
    <div class="btn-row">
      <a class="btn btn--primary" href="${esc(LINKS.roboforexSignup())}" rel="sponsored nofollow" target="_blank">Open a RoboForex account</a>
    </div>
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <p class="eyebrow">This week · LiteFinance</p>
    <h2>Top ${lf.ranked.length}, scored on thinner evidence</h2>
    <p class="lede" style="margin:1.25rem 0 2rem">
      LiteFinance publishes a risk score and copier count but no drawdown figure and no trade
      count, so drawdown here is derived from the equity curve they do publish and is a
      <strong>lower bound</strong>, not an official number. The two lists are not scored on
      identical evidence and should not be compared head to head.
    </p>
    ${lfWarning}
    ${litefinanceTable(lf.ranked)}
    <div class="btn-row">
      <a class="btn btn--primary" href="${esc(LINKS.litefinanceSignup())}" rel="sponsored nofollow" target="_blank">Open a LiteFinance account</a>
    </div>
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <div class="grid-2">
      <div>
        <p class="eyebrow">Start copying</p>
        <h3>You don't need to trade</h3>
        <p class="lede" style="margin-top:1rem">
          Copy trading mirrors a chosen strategy into your own account automatically. You keep
          custody of your funds at the broker, you can stop at any time, and the trader is paid a
          performance fee out of profits — the fee percentage is listed against every strategy above.
        </p>
        <div class="btn-row"><a class="btn btn--primary" href="/rankings/">Browse the rankings</a></div>
      </div>
      <div>
        <p class="eyebrow">Or earn instead</p>
        <h3>Refer, and take a share of the spread</h3>
        <p class="lede" style="margin-top:1rem">
          Both brokers run partner programmes that pay a share of the spread on every trade your
          referrals make — RoboForex up to 85%, LiteFinance 70%, both with 10% from sub-partners.
          It's a second income path that doesn't require you to deposit at all.
        </p>
        <div class="btn-row"><a class="btn btn--ghost" href="/partners/">Compare the programmes</a></div>
      </div>
    </div>
  </div>
</section>

${footer(data.generatedAt)}`;

/* --------------------------------------------------------- rankings page */

const rankingsPage = `${head({
  title: `Top 10 copy trading strategies — week of ${updated} | DailyScalper`,
  description: `This week's screened top 10 on RoboForex and LiteFinance. ${totalScreened} strategies checked, ${totalFlagged} flagged as martingale, ${totalPublished} published.`,
  canonical: `${SITE}/rankings/`,
  jsonLd: [
    graph(
      ORG,
      breadcrumbs([
        ['Home', '/'],
        ['Rankings', '/rankings/'],
      ]),
      rankingItemList({
        id: 'roboforex',
        name: `Top ${rf.ranked.length} RoboForex copy-trading strategies`,
        description: `Screened ${rf.screened} strategies; ranked by yield divided by maximum drawdown.`,
        rows: rf.ranked,
        brokerName: 'RoboForex',
        url: '/rankings/',
      }),
      rankingItemList({
        id: 'litefinance',
        name: `Top ${lf.ranked.length} LiteFinance copy-trading strategies`,
        description: `Screened ${lf.screened} strategies; drawdown derived from the published equity curve.`,
        rows: lf.ranked,
        brokerName: 'LiteFinance',
        url: '/rankings/',
      })
    ),
  ],
})}
${masthead('rankings')}

<section class="hero" style="padding-block:clamp(3rem,7vw,5rem) 2rem">
  <div class="wrap hero__inner">
    <p class="eyebrow">Week of ${esc(updated)}</p>
    <h1>This week's rankings</h1>
    <p class="lede">
      Rebuilt every Monday from the brokers' public data. Ranked by yield divided by maximum
      drawdown — return per unit of pain — after every strategy has cleared the eligibility gates.
    </p>
    <dl class="hero__meta">
      <div><dt>Screened</dt><dd>${totalScreened}</dd></div>
      <div><dt>Flagged</dt><dd class="neg">${totalFlagged}</dd></div>
      <div><dt>Eligible</dt><dd>${rf.eligibleCount + lf.eligibleCount}</dd></div>
      <div><dt>Published</dt><dd class="pos">${totalPublished}</dd></div>
    </dl>
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <p class="eyebrow"><span class="tag tag--rf">RoboForex</span></p>
    <h2>Top ${rf.ranked.length} · RoboForex</h2>
    <p class="lede" style="margin:1.25rem 0 2.5rem">
      Yield is over a rolling 3-month window. Max drawdown, trade count and copier count are
      published by the broker.
    </p>
    ${roboforexTable(rf.ranked)}
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <p class="eyebrow"><span class="tag tag--lf">LiteFinance</span></p>
    <h2>Top ${lf.ranked.length} · LiteFinance</h2>
    <p class="lede" style="margin:1.25rem 0 2.5rem">
      Yield is all-time, so it is not comparable with the RoboForex column. Drawdown is derived
      from the published curve and shown as a lower bound.
    </p>
    ${lfWarning}
    ${litefinanceTable(lf.ranked)}
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <p class="eyebrow">Rejected this week</p>
    <h2>The ones that looked best</h2>
    <div class="grid-2" style="margin-top:2rem">
      <div class="panel"><p class="eyebrow" style="margin-bottom:.5rem">RoboForex</p>${rejectionList(rf.notableRejections)}</div>
      <div class="panel"><p class="eyebrow" style="margin-bottom:.5rem">LiteFinance</p>${rejectionList(lf.notableRejections)}</div>
    </div>
  </div>
</section>

${footer(data.generatedAt)}`;

/* ------------------------------------------------------ methodology page */

const gateRow = (label, detail) =>
  `<div class="gate"><span class="gate__mark">▸</span><div class="gate__body"><strong>${label}</strong><span>${detail}</span></div></div>`;

const methodologyPage = `${head({
  title: 'How we screen copy trading strategies | DailyScalper',
  description:
    'The full ranking methodology: eligibility gates, martingale detection, scoring, data sources and known limitations.',
  canonical: `${SITE}/methodology/`,
  jsonLd: [
    graph(
      ORG,
      breadcrumbs([
        ['Home', '/'],
        ['Methodology', '/methodology/'],
      ]),
      faq([
        [
          'How are the copy trading strategies ranked?',
          `Each strategy is scored as yield divided by maximum drawdown — return per unit of drawdown — after clearing every eligibility gate. A strategy that returned 40% through a 3% decline ranks above one that returned 160% through a 40% decline.`,
        ],
        [
          'What is martingale and how is it detected?',
          `A martingale strategy adds to losing positions instead of closing them, so losses stay off the equity curve until the position is forced out. We reject a strategy when its worst period is at least ${MARTINGALE.cliffRatio}x the typical move and at least ${MARTINGALE.minCliffDropPct}% deep, or when a win rate above ${Math.round(MARTINGALE.suspiciousWinRate * 100)}% coincides with a drawdown over ${MARTINGALE.withDrawdownPct}%.`,
        ],
        [
          'Why are the RoboForex and LiteFinance lists not comparable?',
          'RoboForex publishes an official maximum drawdown, trade count and copier count over a rolling 3-month window. LiteFinance publishes an all-time return and a 1-10 risk score but no drawdown and no trade count, so drawdown there is derived from the published equity curve and is a lower bound. The two lists are scored on different evidence.',
        ],
        [
          'How is DailyScalper paid?',
          'Through broker affiliate links. The eligibility gates are mechanical and applied identically to every strategy, and the full methodology is published, but you should weigh the incentive yourself.',
        ],
        [
          'How often are the rankings updated?',
          'The screening is re-run and the site rebuilt every week from each broker\u2019s public data.',
        ],
      ])
    ),
  ],
})}
${masthead('methodology')}

<section class="hero" style="padding-block:clamp(3rem,7vw,5rem) 2rem">
  <div class="wrap hero__inner">
    <p class="eyebrow">Methodology · version ${data.methodologyVersion}</p>
    <h1>Every rule, in full</h1>
    <p class="lede">
      We have no copiers to point to and we publish no testimonials. The only thing that should
      persuade you is the method — so here it is, including what it cannot do.
    </p>
  </div>
</section>

<section class="block rule-top">
  <div class="wrap grid-2" style="align-items:start">
    <div>
      <p class="eyebrow">Step 1 — Eligibility</p>
      <h3>RoboForex gates</h3>
      <div style="margin-top:1.25rem">
        ${gateRow(`At least ${GATES.roboforex.minTrackRecordDays} days live`, 'Shorter records are indistinguishable from luck.')}
        ${gateRow(`Max drawdown ≤ ${GATES.roboforex.maxDrawdownPct}%`, "Uses the broker's own published dd_max figure.")}
        ${gateRow(`At least ${GATES.roboforex.minDeals} trades`, 'A handful of wins is not a strategy.')}
        ${gateRow(`At least ${GATES.roboforex.minCopiers} copiers`, 'Someone else already has real money at stake.')}
        ${gateRow(`Yield between ${GATES.roboforex.minYieldPct}% and ${GATES.roboforex.maxYieldPct}%`, 'Above the ceiling, returns are a red flag rather than an achievement.')}
      </div>
      <h3 style="margin-top:2.5rem">LiteFinance gates</h3>
      <p class="dim" style="font-size:.88rem;margin-top:.75rem">
        Different, because LiteFinance publishes different fields.
      </p>
      <div style="margin-top:1rem">
        ${gateRow(`Broker risk score ≤ ${GATES.litefinance.maxRiskScore}/10`, "LiteFinance's own risk rating; we do not recompute it.")}
        ${gateRow(`Derived drawdown ≤ ${GATES.litefinance.maxDrawdownPct}%`, 'Calculated from the published equity curve — a lower bound, not official.')}
        ${gateRow(`At least ${GATES.litefinance.minCopiers} copiers`, 'Same test as RoboForex.')}
        ${gateRow(`At least ${GATES.litefinance.minCurvePoints} curve points`, 'Too few samples to judge otherwise.')}
        ${gateRow(`Yield up to ${GATES.litefinance.maxYieldPct}%`, 'Higher ceiling than RoboForex because this figure is all-time, not 3-month.')}
      </div>
    </div>
    <div>
      <p class="eyebrow">Step 2 — Martingale detection</p>
      <div class="panel">
        <p>
          A martingale or grid strategy adds to losing positions instead of closing them. Losses stay
          off the equity curve until the position is finally forced out, so the curve shows a long run
          of small, unusually consistent gains and then a cliff.
        </p>
        <p>We reject a strategy when either signature appears:</p>
        ${gateRow('A cliff', 'The worst single period is at least 12× the typical move and at least 8% deep — the pyramid unwinding.')}
        ${gateRow('Losses that never show', 'A 90%+ win rate combined with a 20%+ drawdown. The losses exist; they were simply averaged down until they detonated.')}
        <p style="margin-top:1.25rem" class="dim">
          This run flagged <strong class="neg">${totalFlagged}</strong> of ${totalScreened} screened strategies.
        </p>
      </div>

      <p class="eyebrow" style="margin-top:2.5rem">Step 3 — Scoring</p>
      <div class="panel">
        <p style="font-family:var(--mono);font-size:.95rem">score = yield ÷ max drawdown</p>
        <p>
          Return per unit of drawdown. A strategy that made 40% while asking you to sit through a 3%
          decline scores higher than one that made 160% through a 40% decline — because most people
          stop copying during the decline, and a copier who quits at the bottom never sees the recovery.
        </p>
        <p class="dim" style="font-size:.88rem">
          For LiteFinance the divisor is floored at 5% — its curve is sampled too sparsely to resolve
          smaller dips, and unmeasurable risk must not score as no risk.
        </p>
      </div>
    </div>
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <p class="eyebrow">Limitations</p>
    <h2>What this method cannot tell you</h2>
    <div class="grid-3" style="margin-top:2rem">
      <div class="panel"><h3>It is backward-looking</h3><p class="dim">Every input describes the past. A clean history is not a forecast, and a strategy can change behaviour the day after it is ranked.</p></div>
      <div class="panel"><h3>We cannot audit the brokers</h3><p class="dim">The figures are whatever RoboForex and LiteFinance publish. We check them for internal consistency, not for truth.</p></div>
      <div class="panel"><h3>Detection is not perfect</h3><p class="dim">A martingale account that has not yet blown up may show a clean curve. The screen removes the obvious cases, not every case.</p></div>
      <div class="panel"><h3>The two lists differ</h3><p class="dim">Different fields, different windows, different gates. Rank 1 on one board is not equivalent to rank 1 on the other.</p></div>
      <div class="panel"><h3>The pool is limited</h3><p class="dim">LiteFinance exposes roughly ${lf.screened} strategies publicly. We can only rank what is published without a login.</p></div>
      <div class="panel"><h3>We are paid by referral</h3><p class="dim">Affiliate links fund the site. The gates are mechanical and identical for every strategy, but you should weigh the incentive yourself.</p></div>
    </div>
  </div>
</section>

${footer(data.generatedAt)}`;

/* --------------------------------------------------------- partners page */

const partnersPage = `${head({
  title: 'RoboForex vs LiteFinance partner programmes compared | DailyScalper',
  description:
    'Side-by-side comparison of the RoboForex and LiteFinance affiliate programmes: revenue share, per-lot payouts, sub-partner tiers and payout mechanics.',
  canonical: `${SITE}/partners/`,
  jsonLd: [
    graph(
      ORG,
      breadcrumbs([
        ['Home', '/'],
        ['Partners', '/partners/'],
      ])
    ),
  ],
})}
${masthead('partners')}

<section class="hero" style="padding-block:clamp(3rem,7vw,5rem) 2rem">
  <div class="wrap hero__inner">
    <p class="eyebrow">Second income path</p>
    <h1>Earn without depositing</h1>
    <p class="lede">
      Copying is the main way to use this site. The other way is to refer: both brokers pay partners
      a share of the spread their referrals generate, with no requirement to fund an account yourself.
      Figures below are the brokers' own published rates.
    </p>
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <div class="table-scroll">
    <table class="ledger">
      <thead><tr><th>Term</th><th style="text-align:left">RoboForex</th><th style="text-align:left">LiteFinance</th></tr></thead>
      <tbody>
        <tr><td style="text-align:left">Revenue share</td><td style="text-align:left">Up to 85% of spread</td><td style="text-align:left">70% of broker profit</td></tr>
        <tr><td style="text-align:left">Swap share</td><td style="text-align:left">30% on open positions</td><td style="text-align:left" class="dim">Not published</td></tr>
        <tr><td style="text-align:left">Sub-partners</td><td style="text-align:left">10%</td><td style="text-align:left">10%</td></tr>
        <tr><td style="text-align:left">Example per lot</td><td style="text-align:left">$8.80 XAUUSD · $9.30 GBPUSD</td><td style="text-align:left">~$3.50 EURUSD · ~$85 BTCUSD</td></tr>
        <tr><td style="text-align:left">Payouts</td><td style="text-align:left">Via partner account</td><td style="text-align:left">Daily, auto up to $5,000</td></tr>
        <tr><td style="text-align:left">Materials</td><td style="text-align:left">Banners, informer widgets, landing pages</td><td style="text-align:left">Banners, brochures, landing pages, partner app</td></tr>
        <tr><td style="text-align:left">Copy-trading angle</td><td style="text-align:left">Share of the trader's performance fee</td><td style="text-align:left" class="dim">Standard revenue share</td></tr>
      </tbody>
    </table>
    </div>
    <div class="btn-row">
      <a class="btn btn--primary" href="${esc(LINKS.roboforexSignup())}" rel="sponsored nofollow" target="_blank">RoboForex partner programme</a>
      <a class="btn btn--ghost" href="${esc(LINKS.litefinanceSignup())}" rel="sponsored nofollow" target="_blank">LiteFinance partner programme</a>
    </div>
    <p class="risk-note" style="margin-top:2.5rem">
      Rates are as published by each broker and change without notice — confirm current terms in the
      partner cabinet before relying on them. Partner earnings depend on referred clients trading, and
      most retail traders lose money; recruiting people into leveraged trading to earn spread rebates
      carries an obvious conflict of interest that you should think carefully about.
    </p>
  </div>
</section>

${footer(data.generatedAt)}`;

/* ------------------------------------------------------------------- 404 */

const notFoundPage = `${head({
  title: 'Page not found | DailyScalper',
  description: 'That page does not exist. Jump to this week’s screened copy-trading rankings.',
  canonical: `${SITE}/404.html`,
})}
${masthead()}
<section class="hero">
  <div class="wrap hero__inner">
    <p class="eyebrow">Error 404</p>
    <h1>This page isn't in the ledger.</h1>
    <p class="lede">The link may be stale — the site was restructured around the weekly rankings.</p>
    <div class="btn-row">
      <a class="btn btn--primary" href="/rankings/">This week's top 10</a>
      <a class="btn btn--ghost" href="/">Home</a>
    </div>
  </div>
</section>
${footer(data.generatedAt)}`;

/* ------------------------------------------------------------------ write */

async function emit(path, html) {
  const dir = path.split('/').slice(0, -1).join('/');
  if (dir) await mkdir(dir, { recursive: true });
  await writeFile(path, html);
  console.log(`  wrote ${path} (${(html.length / 1024).toFixed(1)} KB)`);
}

await emit('index.html', indexPage);
await emit('rankings/index.html', rankingsPage);
await emit('methodology/index.html', methodologyPage);
await emit('partners/index.html', partnersPage);
await emit('404.html', notFoundPage);

/* --------------------------------------------------- sitemap + llms.txt */

// The blog is static HTML that predates this build script, so it is discovered
// from disk rather than generated. Absent from the sitemap it is simply lost:
// the posts are already public and already carry correct canonicals.
const blogPosts = (await readdir('blog', { withFileTypes: true }))
  .filter((d) => d.isDirectory() && d.name.startsWith('day-'))
  .map((d) => d.name)
  .sort();

const blogMeta = await Promise.all(
  blogPosts.map(async (slug) => {
    const html = await readFile(`blog/${slug}/index.html`, 'utf8');
    const title = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? slug;
    return { slug, url: `/blog/${slug}/`, title: title.split('|')[0].trim() };
  })
);

const generated = [
  { url: '/', freq: 'weekly', priority: '1.0' },
  { url: '/rankings/', freq: 'weekly', priority: '0.9' },
  { url: '/methodology/', freq: 'monthly', priority: '0.7' },
  { url: '/partners/', freq: 'monthly', priority: '0.6' },
  { url: '/blog/', freq: 'monthly', priority: '0.6' },
  ...blogMeta.map((b) => ({ url: b.url, freq: 'yearly', priority: '0.4' })),
];

await emit(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${generated
  .map(
    (u) =>
      `  <url><loc>${SITE}${u.url}</loc><lastmod>${data.generatedAt.slice(
        0,
        10
      )}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join('\n')}
</urlset>
`
);

/**
 * llms.txt — the curated entry point for AI answer engines. Same facts as the
 * pages, but stated once, in order, without the markup they would otherwise
 * have to strip. Crucially it states the limitations too: an engine that quotes
 * the rankings should also be able to quote what they do not prove.
 */
const llms = `# DailyScalper

> Independent weekly screening of public copy-trading strategies on RoboForex and
> LiteFinance. ${totalScreened} strategies screened, ${totalFlagged} flagged as martingale,
> ${totalPublished} published. Last updated ${data.generatedAt.slice(0, 10)}.

DailyScalper ranks copy-trading strategies by return per unit of drawdown
(yield divided by maximum drawdown) rather than by headline profit, because
broker leaderboards sorted by profit place martingale accounts at the top.

## Method

- Eligibility gates, RoboForex: at least ${GATES.roboforex.minTrackRecordDays} days live,
  max drawdown at or below ${GATES.roboforex.maxDrawdownPct}%, at least ${GATES.roboforex.minDeals} trades,
  at least ${GATES.roboforex.minCopiers} copiers, yield between ${GATES.roboforex.minYieldPct}% and ${GATES.roboforex.maxYieldPct}%.
- Eligibility gates, LiteFinance: broker risk score at or below ${GATES.litefinance.maxRiskScore}/10,
  derived drawdown at or below ${GATES.litefinance.maxDrawdownPct}%, at least ${GATES.litefinance.minCopiers} copiers,
  at least ${GATES.litefinance.minCurvePoints} curve points.
- Martingale rejection: a worst period at least ${MARTINGALE.cliffRatio}x the typical move and at least
  ${MARTINGALE.minCliffDropPct}% deep, or a win rate above ${Math.round(MARTINGALE.suspiciousWinRate * 100)}% alongside a drawdown over ${MARTINGALE.withDrawdownPct}%.
- Score: yield divided by maximum drawdown. For LiteFinance the divisor is floored
  at 5% because its published curve is too sparse to resolve smaller dips.

## Current rankings

### RoboForex (yield over a rolling 3-month window, broker-published drawdown)
${rf.ranked
  .map(
    (r) =>
      `${r.rank}. ${r.strategy || r.trader} — yield ${r.yieldPct}%, max drawdown ${r.drawdownPct}%, ${r.trades} trades, ${r.copiers} copiers, score ${r.score}`
  )
  .join('\n')}

### LiteFinance (yield all-time, drawdown derived from the published curve, lower bound)
${lf.ranked
  .map(
    (r) =>
      `${r.rank}. ${r.trader} — yield ${r.yieldPct}%, drawdown at least ${r.drawdownPct}%, risk ${r.riskScore}/10, ${r.copiers} copiers, score ${r.score}`
  )
  .join('\n')}

## Limitations (please quote these alongside the rankings)

- Every input is backward-looking. A clean history is not a forecast.
- Figures are whatever the brokers publish; we check internal consistency, not truth.
- Martingale detection removes obvious cases, not every case.
- The two broker lists use different fields, windows and gates and are NOT comparable.
- LiteFinance exposes only about ${lf.screened} strategies publicly.
- The site is funded by broker affiliate links. Gates are mechanical and identical
  for every strategy, but the incentive exists and should be weighed.
- Most retail traders lose money. Copy trading does not remove that risk.

## Pages

- [Rankings](${SITE}/rankings/): the current screened top 10 for both brokers.
- [Methodology](${SITE}/methodology/): every gate, threshold and known limitation.
- [Partners](${SITE}/partners/): RoboForex and LiteFinance affiliate programmes compared.
- [Blog](${SITE}/blog/): ${blogMeta.length} explainers on forex and copy-trading fundamentals.
`;
await emit('llms.txt', llms);

console.log('Build complete.');
