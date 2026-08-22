/**
 * Renders the blog from data/blog.json through the shared site partials, so the
 * posts carry the same head, nav, footer, fonts and stylesheet as every other
 * page instead of the pre-pivot template they were written against.
 *
 * Run after extract-blog.mjs (one-off) and as part of the normal build:
 *   node scripts/build-blog.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { head, masthead, footer, esc } from './templates.mjs';

const SITE = 'https://www.dailyscalper.net';
const { posts } = JSON.parse(await readFile('data/blog.json', 'utf8'));

/**
 * "April 29, 2026" -> "2026-04-29".
 * Parsed as UTC: Date.parse would otherwise read it as local midnight, which
 * converts back one day earlier for any timezone ahead of UTC.
 */
function isoDate(s) {
  if (!s) return null;
  const t = Date.parse(`${s} UTC`);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

async function emit(path, html) {
  const dir = path.split('/').slice(0, -1).join('/');
  if (dir) await mkdir(dir, { recursive: true });
  await writeFile(path, html);
  console.log(`  wrote ${path} (${(html.length / 1024).toFixed(1)} KB)`);
}

function postPage(post, prev, next) {
  const published = isoDate(post.date);

  // The old template ended each post with a hand-written "Next: Day N" line.
  // Real prev/next links are generated below, so drop it rather than ship both.
  const body = post.body.replace(/<p class="next">[\s\S]*?(?:<\/p>|$)/, '').trim();

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${SITE}${post.url}#post`,
        headline: post.titleText,
        description: post.lede,
        image: post.hero ? `${SITE}${post.hero}` : undefined,
        ...(published ? { datePublished: published, dateModified: published } : {}),
        author: { '@type': 'Organization', name: 'DailyScalper' },
        publisher: {
          '@type': 'Organization',
          name: 'DailyScalper',
          logo: { '@type': 'ImageObject', url: `${SITE}/og-image.png` },
        },
        mainEntityOfPage: `${SITE}${post.url}`,
        articleSection: post.category,
        isAccessibleForFree: true,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          ['Home', '/'],
          ['Learn', '/blog/'],
          [post.titleText, post.url],
        ].map(([name, url], i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name,
          item: `${SITE}${url}`,
        })),
      },
    ],
  };

  const pager = (p, label) =>
    p
      ? `<a class="post__pager-link" href="${p.url}">
           <span class="post__pager-label">${label}</span>
           <span class="post__pager-title">${esc(p.titleText)}</span>
         </a>`
      : '<span></span>';

  return `${head({
    title: `${post.titleText} | DailyScalper`,
    description: post.lede ?? post.titleText,
    canonical: `${SITE}${post.url}`,
    jsonLd: [ld],
  })}
${masthead('blog')}

<article class="post">
  <header class="post__head">
    <div class="wrap post__wrap">
      <p class="eyebrow">${esc(post.day ?? '')}${
        post.category ? ` · ${esc(post.category)}` : ''
      }${post.date ? ` · ${esc(post.date)}` : ''}</p>
      <h1>${post.title}</h1>
      ${post.lede ? `<p class="lede">${esc(post.lede)}</p>` : ''}
    </div>
  </header>

  <div class="wrap post__wrap">
    ${
      post.hero
        ? `<figure class="post__hero">
             <img src="${esc(post.hero)}" alt="${esc(post.heroAlt)}" width="1080" height="1080" loading="eager" decoding="async">
           </figure>`
        : ''
    }
    <div class="post__body">
      ${body}
    </div>

    <aside class="post__cta">
      <h3>Ready to put this to work?</h3>
      <p>
        We screen every public copy-trading strategy on RoboForex and LiteFinance each week,
        discard the martingale accounts, and publish only what clears the gates.
      </p>
      <div class="btn-row">
        <a class="btn btn--primary" href="/rankings/">See the screened rankings</a>
        <a class="btn btn--ghost" href="/methodology/">How the screening works</a>
      </div>
    </aside>

    <nav class="post__pager" aria-label="More posts">
      ${pager(prev, '← Previous')}
      ${pager(next, 'Next →')}
    </nav>
  </div>
</article>

${footer(null)}`;
}

function indexPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Blog',
        '@id': `${SITE}/blog/#blog`,
        name: 'DailyScalper — Forex & copy trading basics',
        description:
          'Plain-English explainers on forex and copy-trading fundamentals: pips, lots, leverage, margin, drawdown and how brokers actually make money.',
        url: `${SITE}/blog/`,
        blogPost: posts.map((p) => ({
          '@type': 'BlogPosting',
          headline: p.titleText,
          url: `${SITE}${p.url}`,
          ...(isoDate(p.date) ? { datePublished: isoDate(p.date) } : {}),
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Learn', item: `${SITE}/blog/` },
        ],
      },
    ],
  };

  return `${head({
    title: 'Forex & copy trading basics | DailyScalper',
    description: `${posts.length} plain-English explainers on forex and copy-trading fundamentals — pips, lots, leverage, margin, drawdown, and how brokers actually make money.`,
    canonical: `${SITE}/blog/`,
    jsonLd: [ld],
  })}
${masthead('blog')}

<section class="hero" style="padding-block:clamp(3rem,7vw,5rem) 2rem">
  <div class="wrap hero__inner">
    <p class="eyebrow">Learn</p>
    <h1>Start with the <em>fundamentals</em></h1>
    <p class="lede">
      The rankings assume you already know what a pip, a lot and a drawdown are. If you don't yet,
      these ${posts.length} explainers cover the ground in order — no jargon left undefined, and no
      strategy being sold to you along the way.
    </p>
  </div>
</section>

<section class="block rule-top">
  <div class="wrap">
    <ol class="post-list">
      ${posts
        .map(
          (p) => `<li>
        <a href="${p.url}">
          ${
            p.hero
              ? `<img src="${esc(p.hero)}" alt="" width="1080" height="1080" loading="lazy" decoding="async">`
              : ''
          }
          <div>
            <p class="eyebrow">${esc(p.day ?? '')}${p.date ? ` · ${esc(p.date)}` : ''}</p>
            <h3>${esc(p.titleText)}</h3>
            <p class="dim">${esc((p.lede ?? '').slice(0, 150))}${(p.lede ?? '').length > 150 ? '…' : ''}</p>
          </div>
        </a>
      </li>`
        )
        .join('')}
    </ol>
  </div>
</section>

${footer(null)}`;
}

for (let i = 0; i < posts.length; i++) {
  await emit(`blog/${posts[i].slug}/index.html`, postPage(posts[i], posts[i - 1], posts[i + 1]));
}
await emit('blog/index.html', indexPage());
console.log(`Blog build complete — ${posts.length} posts.`);
