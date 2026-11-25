import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARTICLES_DIR, ROOT, buildNewspaper, loadConfig } from './build.mjs';
import { validateAndNormalizeArticle } from './schema.mjs';

function parseArgs(argv) {
  const args = { file: null, open: false, overwrite: false, cleanup: false };
  for (const a of argv) {
    if (a === '--open') args.open = true;
    else if (a === '--overwrite') args.overwrite = true;
    else if (a === '--cleanup') args.cleanup = true;
    else if (!a.startsWith('-') && !args.file) args.file = a;
  }
  return args;
}

function openInBrowser(filePath) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', '', filePath], () => resolve());
    } else if (process.platform === 'darwin') {
      execFile('open', [filePath], () => resolve());
    } else {
      execFile('xdg-open', [filePath], () => resolve());
    }
  });
}

async function findExistingBySlug(slug) {
  await fs.mkdir(ARTICLES_DIR, { recursive: true });
  const entries = await fs.readdir(ARTICLES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const p = path.join(ARTICLES_DIR, entry.name);
    try {
      const data = JSON.parse(await fs.readFile(p, 'utf8'));
      if (data.slug === slug) return p;
    } catch {}
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Uso: node scripts/add-article.mjs <articulo.json> [--open] [--overwrite]');
    process.exit(1);
  }

  const inputPath = path.isAbsolute(args.file) ? args.file : path.resolve(ROOT, args.file);
  const raw = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const config = await loadConfig();
  const article = validateAndNormalizeArticle(raw, config);

  const existing = await findExistingBySlug(article.slug);
  let targetPath;
  if (existing) {
    if (!args.overwrite) {
      console.error(
        `Ya existe una nota con slug "${article.slug}" en ${existing}. Usá --overwrite para reemplazarla.`
      );
      process.exit(1);
    }
    targetPath = existing;
  } else {
    const datePrefix = /^\d{4}-\d{2}-\d{2}$/.test(article.dateIso)
      ? article.dateIso
      : new Date().toISOString().slice(0, 10);
    targetPath = path.join(ARTICLES_DIR, `${datePrefix}-${article.slug}.json`);
  }

  await fs.mkdir(ARTICLES_DIR, { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(article, null, 2) + '\n', 'utf8');

  const { outputPath, articleCount } = await buildNewspaper();

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug: article.slug,
        title: article.title,
        articleJson: targetPath,
        newspaperHtml: outputPath,
        totalArticles: articleCount,
      },
      null,
      2
    )
  );

  if (args.cleanup) {
    const tmpDir = path.join(ROOT, '.tmp');
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  if (args.open) {
    await openInBrowser(outputPath);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Error en add-article.mjs:', err.message);
    process.exit(1);
  });
}
