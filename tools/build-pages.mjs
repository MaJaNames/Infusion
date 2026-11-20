// Сборка статического сайта для GitHub Pages:
//   node tools/build-pages.mjs
// Копирует отслеживаемые файлы в _site и добавляет OG-страницы /p/db/<раздел>/<id>/.
// Каталог _site не коммитится: в Actions он уходит артефактом.
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { esc, indexData, label, RARITY_SHORT } from '../js/core/util.js';
import { hashRoute, permalinkPath } from '../js/core/links.js';
import { rulesRows } from '../js/core/rules-rows.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, '_site');
export const DEFAULT_SITE_URL = 'https://majanames.github.io/Infusion';

const SKIP = [
  /^\.github\//,
  /^tools\//,
  /^tests\//,
  /^supabase\//,
  /^AGENTS\.md$/,
  /^\.gitignore$/,
  /^package(?:-lock)?\.json$/,
  /^README\.md$/,
];

export function siteConfig(raw = process.env.SITE_URL || DEFAULT_SITE_URL) {
  const url = String(raw).replace(/\/+$/, '');
  const { pathname } = new URL(url);
  return { url, basePath: pathname.endsWith('/') ? pathname : `${pathname}/` };
}

const cleanText = (value) => String(value ?? '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/[*_`~]+/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function truncate(text, max) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const at = slice.lastIndexOf(' ');
  return `${(at > max * 0.55 ? slice.slice(0, at) : slice).trim()}…`;
}

// Описание в превью — только сам текст записи, абзацами.
// Ни типа, ни редкости, ни заглушки: пустое описание просто не выводится.
export function describe(entry) {
  const body = String(entry.description ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map(cleanText)
    .filter(Boolean)
    .join('\n\n');
  return body ? truncate(body, 200) : '';
}

// Заголовок превью: [Тег] Название [Р] — как в выпадающих списках.
export function entryTitle(row) {
  const base = label(row).trim() || 'Без названия';
  const short = row.rarity ? RARITY_SHORT[row.rarity] || String(row.rarity).slice(0, 1) : '';
  return short ? `${base} [${short}]` : base;
}

// Всё, для чего на сайте есть кнопка «Поделиться» и отдельная OG-страница.
// «Детали Кочевника» ведут на OG-страницу предмета, поэтому своих страниц не получают.
export function collectEntries(d) {
  const entries = [];
  for (const it of d.items) {
    entries.push({
      kind: 'items', id: String(it.id), path: permalinkPath('items', it.id),
      title: entryTitle(it), type: 'Предмет',
      description: it.description,
    });
  }
  for (const c of d.cards) {
    entries.push({
      kind: 'cards', id: String(c.id), path: permalinkPath('cards', c.id),
      title: entryTitle(c), type: 'Карта',
      description: c.mechanics,
    });
  }
  for (const r of rulesRows(d)) {
    entries.push({
      kind: 'rules', id: String(r.id), path: permalinkPath('rules', r.id),
      title: entryTitle(r), type: r.type || 'Справочник',
      description: r.description,
    });
  }
  return entries;
}

const PAGE_STYLE = 'body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#e8ebee;color:#17212b}main{padding:2rem;text-align:center}a{color:#0d5c6b}';

export function renderPage(entry, site = siteConfig()) {
  const canonical = new URL(entry.path, `${site.url}/`).href;
  const target = `${site.basePath}${hashRoute(entry.kind, entry.id)}`;
  const description = describe(entry);
  const descMeta = description ? `<meta name="description" content="${esc(description)}">\n` : '';
  const descOg = description ? `<meta property="og:description" content="${esc(description)}">\n` : '';
  const descTwitter = description ? `<meta name="twitter:description" content="${esc(description)}">\n` : '';
  const title = `${entry.title} — Инфузия`;
  const scriptTarget = JSON.stringify(target).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${descMeta}<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="noindex, follow">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Инфузия">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(entry.title)}">
${descOg}<meta property="og:url" content="${esc(canonical)}">
<meta property="article:section" content="${esc(entry.type)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(entry.title)}">
${descTwitter}<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="icon" type="image/webp" href="${esc(site.basePath)}assets/icons/paw.webp">
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<p>Открываем «${esc(entry.title)}»…</p>
<p><a href="${esc(target)}">Открыть в «Инфузии»</a></p>
</main>
<script>location.replace(${scriptTarget});</script>
</body>
</html>`;
}

export function render404(site = siteConfig()) {
  const target = `${site.basePath}#db`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Страница не найдена — Инфузия</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/webp" href="${esc(site.basePath)}assets/icons/paw.webp">
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<p>Такой страницы нет.</p>
<p><a href="${esc(target)}">Перейти к базе</a></p>
</main>
</body>
</html>`;
}

function listedFiles() {
  // Отслеживаемые + новые неигнорируемые файлы: локальная сборка видит правки
  // до коммита, а секреты и _site остаются за бортом благодаря --exclude-standard.
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

async function copySite() {
  const files = listedFiles().filter((file) => !SKIP.some((re) => re.test(file)));
  for (const file of files) {
    const dest = join(OUT, file);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(ROOT, file), dest);
  }
  return files.length;
}

async function main() {
  const site = siteConfig();
  const raw = JSON.parse(await readFile(join(ROOT, 'data/data.json'), 'utf8'));
  const entries = collectEntries(indexData(raw));
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`Дубликат пермалинка: ${entry.path}`);
    seen.add(entry.path);
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const copied = await copySite();
  await writeFile(join(OUT, '.nojekyll'), '');
  await writeFile(join(OUT, '404.html'), render404(site), 'utf8');

  for (const entry of entries) {
    const file = join(OUT, entry.path, 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, renderPage(entry, site), 'utf8');
  }

  const counts = entries.reduce((acc, entry) => {
    acc[entry.kind] = (acc[entry.kind] || 0) + 1;
    return acc;
  }, {});
  console.log(`Сайт: ${site.url}/`);
  console.log(`Скопировано файлов: ${copied}`);
  console.log(`OG-страниц: ${entries.length} (предметы ${counts.items}, карты ${counts.cards}, справочник ${counts.rules})`);
  console.log(`Готово: ${relative(ROOT, OUT)}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main().catch((error) => { console.error(error); process.exitCode = 1; });
