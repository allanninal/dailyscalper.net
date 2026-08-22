/**
 * Shared HTML partials. Everything user-visible is generated from these so the
 * head (consent mode, CSP, analytics) can never drift between pages.
 */
import { LINKS } from './config.mjs';

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const GA_ID = 'G-M52H10GCH6';
const ADSENSE = 'ca-pub-3474747237489350';

/**
 * `jsonLd` takes an array of schema.org objects. They are emitted in one
 * <script type="application/ld+json"> block so search and AI answer engines can
 * read the rankings as structured data rather than re-parsing the HTML table.
 */
export function head({ title, description, canonical, jsonLd = [] }) {
  const ld = jsonLd.length
    ? `\n    <script type="application/ld+json">${JSON.stringify(
        jsonLd.length === 1 ? jsonLd[0] : jsonLd
      ).replace(/</g, '\\u003c')}</script>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Google Consent Mode v2 - defaults before gtag loads -->
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('consent', 'default', {
        'ad_storage': 'denied',
        'ad_user_data': 'denied',
        'ad_personalization': 'denied',
        'analytics_storage': 'denied',
        'wait_for_update': 500
      });
      if (localStorage.getItem('cookie_consent') === 'granted') {
        gtag('consent', 'update', {
          'ad_storage': 'granted',
          'ad_user_data': 'granted',
          'ad_personalization': 'granted',
          'analytics_storage': 'granted'
        });
      }
    </script>

    <meta http-equiv="Content-Security-Policy" content="
        default-src 'self';
        script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com https://www.googletagservices.com https://adservice.google.com;
        style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
        font-src 'self' https://fonts.gstatic.com;
        img-src 'self' data: https: blob:;
        frame-src https://staticmy.roboforex.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com;
        connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://region1.google-analytics.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net;
    ">

    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(canonical)}">

    <meta property="og:type" content="website">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:image" content="https://www.dailyscalper.net/og-image.png">
    <meta name="twitter:card" content="summary_large_image">

    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
    <script>
      gtag('js', new Date());
      gtag('config', '${GA_ID}');
    </script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/site.css">${ld}
</head>
<body>`;
}

export function masthead(active = '') {
  const link = (href, label, key) =>
    `<a href="${href}"${active === key ? ' style="color:var(--text)"' : ''}>${label}</a>`;
  return `
<header class="masthead">
  <div class="wrap masthead__inner">
    <a class="wordmark" href="/">Daily<span>Scalper</span></a>
    <nav>
      ${link('/rankings/', 'Rankings', 'rankings')}
      ${link('/methodology/', 'Methodology', 'methodology')}
      ${link('/partners/', 'Earn as a Partner', 'partners')}
    </nav>
  </div>
</header>`;
}

export function footer(generatedAt) {
  const stamp = generatedAt
    ? new Date(generatedAt).toUTCString().replace('GMT', 'UTC')
    : 'not yet generated';
  return `
<footer class="footer">
  <div class="wrap">
    <div class="footer__cols">
      <div>
        <h4>Rankings</h4>
        <ul>
          <li><a href="/rankings/">This week's top 10</a></li>
          <li><a href="/methodology/">How we screen</a></li>
        </ul>
      </div>
      <div>
        <h4>Brokers</h4>
        <ul>
          <li><a href="${LINKS.roboforexSignup()}" rel="sponsored nofollow" target="_blank">RoboForex</a></li>
          <li><a href="${LINKS.litefinanceSignup()}" rel="sponsored nofollow" target="_blank">LiteFinance</a></li>
        </ul>
      </div>
      <div>
        <h4>Earn</h4>
        <ul>
          <li><a href="/partners/">Partner programmes</a></li>
        </ul>
      </div>
      <div>
        <h4>Updated</h4>
        <ul><li class="num">${esc(stamp)}</li></ul>
      </div>
    </div>

    <p class="risk-note">
      <strong>Risk warning.</strong> Trading leveraged products carries a high level of risk and can
      result in the loss of all of your capital. Past performance is not indicative of future results:
      every figure on this site describes what a strategy has already done, not what it will do. The
      rankings are produced mechanically from data published by RoboForex and LiteFinance and are not
      investment advice, a recommendation, or an endorsement of any trader. DailyScalper does not manage
      money, does not hold client funds, and cannot verify the brokers' underlying numbers independently.
      Never copy with money you cannot afford to lose.
    </p>
    <p class="risk-note" style="border:0;padding-top:0.75rem">
      <strong>Affiliate disclosure.</strong> Links to RoboForex and LiteFinance are affiliate links. If you
      open an account through them we may earn a commission from the broker's spread — at no extra cost to
      you. This never affects the screening rules, which are applied mechanically and published in full.
      &nbsp;·&nbsp; &copy; ${new Date().getUTCFullYear()} DailyScalper
    </p>
  </div>
</footer>
<script src="/js/analytics.js" defer></script>
</body>
</html>`;
}

/** Inline sparkline from a cumulative-return curve. */
export function sparkline(curve = []) {
  if (!curve || curve.length < 2) return '<span class="dim">—</span>';
  const pts = curve.slice(-40);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 92;
  const h = 26;
  const d = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 3) - 1.5;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const negative = pts[pts.length - 1] < pts[0];
  return `<svg class="spark${negative ? ' is-neg' : ''}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
}
