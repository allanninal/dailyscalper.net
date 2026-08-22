/**
 * One-time migration: lift the article content out of the pre-pivot blog HTML
 * into data/blog.json.
 *
 * The posts were hand-written against the old site template — different fonts,
 * different nav, its own stylesheet, none of the shared partials. Rather than
 * patch 31 files in place (and have them drift again at the next redesign),
 * the prose becomes data and build-blog.mjs renders it through the same
 * head/masthead/footer as every other page.
 *
 * Run once:  node scripts/extract-blog.mjs
 * After that data/blog.json is the source of truth; this script is not rerun.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';

const pick = (re, s) => (s.match(re) ?? [])[1] ?? null;
const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const dirs = (await readdir('blog', { withFileTypes: true }))
  .filter((d) => d.isDirectory() && d.name.startsWith('day-'))
  .map((d) => d.name)
  .sort();

const posts = [];
for (const slug of dirs) {
  const html = await readFile(`blog/${slug}/index.html`, 'utf8');

  const article = pick(/<article>([\s\S]*?)<\/article>/, html);
  if (!article) {
    console.warn(`  SKIP ${slug} — no <article>`);
    continue;
  }

  // Eyebrow is three <span>s: "Day 005 / 404", category, date.
  const eyebrow = pick(/<div class="eyebrow">([\s\S]*?)<\/div>/, html) ?? '';
  const spans = [...eyebrow.matchAll(/<span(?![^>]*class="dot")[^>]*>([\s\S]*?)<\/span>/g)].map(
    (m) => stripTags(m[1])
  );

  const title = pick(/<h1[^>]*>([\s\S]*?)<\/h1>/, article);
  const lede = pick(/<p class="lede">([\s\S]*?)<\/p>/, article);
  const heroImg = pick(/<figure class="hero">\s*<img src="([^"]+)"/, article);
  const heroAlt = pick(/<figure class="hero">[\s\S]*?alt="([^"]*)"/, article);

  // Body = article minus the h1, lede and hero figure, which are rendered by
  // the page template instead of sitting inside the prose.
  let body = article
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '')
    .replace(/<p class="lede">[\s\S]*?<\/p>/, '')
    .replace(/<figure class="hero">[\s\S]*?<\/figure>/, '')
    .trim();

  posts.push({
    slug,
    url: `/blog/${slug}/`,
    day: spans[0] ?? null,
    category: spans[1] ?? null,
    date: spans[2] ?? null,
    title,                       // may contain <em>
    titleText: stripTags(title ?? slug),
    lede: lede ? stripTags(lede) : null,
    hero: heroImg,
    heroAlt: heroAlt ?? stripTags(title ?? ''),
    body,
  });
}

await mkdir('data', { recursive: true });
await writeFile('data/blog.json', JSON.stringify({ posts }, null, 2) + '\n');
console.log(`Extracted ${posts.length} posts -> data/blog.json`);
const missing = posts.filter((p) => !p.title || !p.body || !p.date);
if (missing.length) console.warn('  incomplete:', missing.map((m) => m.slug).join(', '));
