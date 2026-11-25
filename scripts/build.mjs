import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  escapeHtml,
  estimateReadingMinutes,
  stripHtml,
  validateAndNormalizeArticle,
} from './schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const CONFIG_PATH = path.join(ROOT, 'data', 'config.json');
export const ARTICLES_DIR = path.join(ROOT, 'data', 'articulos');

function formatEditionDate(date = new Date()) {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

async function resolveFigureSrc(src) {
  if (/^(https?:|data:)/i.test(src)) return src;
  const resolved = path.isAbsolute(src) ? src : path.resolve(ROOT, src);
  const buf = await fs.readFile(resolved);
  const mime = guessMimeType(resolved);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function renderBlock(block, article) {
  switch (block.type) {
    case 'lead': {
      const hasInlineDateline = /class\s*=\s*["']dateline["']/i.test(block.html);
      const datelinePrefix =
        article.dateline && !hasInlineDateline
          ? `<span class="dateline">${escapeHtml(article.dateline)} —</span> `
          : '';
      return `      <p class="lead">${datelinePrefix}${block.html}</p>`;
    }
    case 'paragraph':
      return `      <p>${block.html}</p>`;
    case 'heading':
      return `      <h2>${escapeHtml(block.text)}</h2>`;
    case 'subheading':
      return `      <h3>${escapeHtml(block.text)}</h3>`;
    case 'blockquote': {
      const cite = block.cite ? `\n        <cite>${escapeHtml(block.cite)}</cite>` : '';
      return `      <blockquote class="editorial-quote">\n        <p>${block.html}</p>${cite}\n      </blockquote>`;
    }
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = block.items.map((item) => `        <li>${item}</li>`).join('\n');
      return `      <${tag} class="editorial-list">\n${items}\n      </${tag}>`;
    }
    case 'code': {
      const langLabel = block.language
        ? `<div class="code-lang">${escapeHtml(block.language)}</div>\n`
        : '';
      return `      <div class="editorial-code-wrap">\n${langLabel}        <pre class="editorial-code"><code>${escapeHtml(block.code)}</code></pre>\n      </div>`;
    }
    case 'figure': {
      const resolvedSrc = await resolveFigureSrc(block.src);
      const caption = block.caption
        ? `\n        <figcaption>${escapeHtml(block.caption)}</figcaption>`
        : '';
      return `      <figure class="editorial-figure">\n        <img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(block.alt)}" loading="lazy">${caption}\n      </figure>`;
    }
    case 'section_break':
      return `      <hr class="section-break">`;
    case 'callout': {
      const title = block.titleHtml
        ? `        <div class="callout-title">${block.titleHtml}</div>\n`
        : '';
      const body = block.bodyHtml ? `        <p>${block.bodyHtml}</p>\n` : '';
      return `      <aside class="callout" aria-label="Nota destacada">\n${title}${body}      </aside>`;
    }
    default:
      return '';
  }
}

async function renderArticleSection(article, index, allArticles) {
  const { minutes } = estimateReadingMinutes(article);
  const bylineParts = [];
  if (article.author) {
    bylineParts.push(`<span>Por <strong>${escapeHtml(article.author)}</strong></span>`);
  }
  if (article.date) {
    const dt = article.dateIso ? ` datetime="${escapeHtml(article.dateIso)}"` : '';
    bylineParts.push(`<time${dt}>${escapeHtml(article.date)}</time>`);
  }
  if (article.sourceName) {
    if (article.sourceUrl) {
      bylineParts.push(
        `<a class="source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.sourceName)}</a>`
      );
    } else {
      bylineParts.push(`<span>${escapeHtml(article.sourceName)}</span>`);
    }
  }
  bylineParts.push(`<span>${minutes} min de lectura</span>`);

  const bylineHtml = bylineParts.join('\n          <span class="dot">·</span>\n          ');
  const renderedBlocks = await Promise.all(article.blocks.map((b) => renderBlock(b, article)));
  const blocksHtml = renderedBlocks.join('\n\n');

  const readersHtml = article.readersBox
    ? `\n    <section class="readers-box" aria-label="${escapeHtml(article.readersBox.title)}">
      <h2>${escapeHtml(article.readersBox.title)}</h2>
      <p>${article.readersBox.bodyHtml}</p>${
        article.readersBox.aiNote
          ? `\n      <p class="ai-note">${escapeHtml(article.readersBox.aiNote)}</p>`
          : ''
      }
    </section>`
    : '';

  const newer = index > 0 ? allArticles[index - 1] : null;
  const older = index < allArticles.length - 1 ? allArticles[index + 1] : null;

  const navLinks = [];
  if (newer) {
    navLinks.push(
      `<a class="article-nav-link prev" href="#${escapeHtml(newer.slug)}" data-open-article="${escapeHtml(newer.slug)}"><span class="nav-label">← Más reciente</span><span class="nav-title">${escapeHtml(newer.title)}</span></a>`
    );
  }
  if (older) {
    navLinks.push(
      `<a class="article-nav-link next" href="#${escapeHtml(older.slug)}" data-open-article="${escapeHtml(older.slug)}"><span class="nav-label">Anterior →</span><span class="nav-title">${escapeHtml(older.title)}</span></a>`
    );
  }

  const footerNav = `
    <nav class="article-footer-nav" aria-label="Navegación del archivo">
      <div class="article-footer-top">
        <a class="back-cover-pill" href="#" data-go-home>← Volver a la portada</a>
      </div>${
        navLinks.length
          ? `\n      <div class="article-nav-grid">${navLinks.join('')}</div>`
          : ''
      }
    </nav>`;

  return `  <section class="article-view" id="article-${escapeHtml(article.slug)}" data-slug="${escapeHtml(article.slug)}" data-masthead="${escapeHtml(article.masthead)}" data-title="${escapeHtml(article.title)}" hidden>
    <main class="article-container">
      <header class="article-header">
        <div class="kicker">${escapeHtml(article.kicker)}</div>
        <h1>${escapeHtml(article.title)}</h1>${
          article.deck ? `\n        <p class="deck">${escapeHtml(article.deck)}</p>` : ''
        }
        <div class="byline">
          ${bylineHtml}
        </div>
      </header>

      <article class="article-body">
${blocksHtml}
      </article>${readersHtml}${footerNav}
    </main>
  </section>`;
}

function renderStoryCard(article, isLead = false) {
  const { minutes } = estimateReadingMinutes(article);
  const searchCorpus = [
    article.title,
    article.deck,
    article.kicker,
    article.section,
    article.author,
    article.sourceName,
    article.masthead,
    ...article.blocks.map((b) =>
      stripHtml(b.html || b.text || b.bodyHtml || (b.items || []).join(' '))
    ),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const metaParts = [];
  if (article.author) metaParts.push(`Por <strong>${escapeHtml(article.author)}</strong>`);
  if (article.date) metaParts.push(escapeHtml(article.date));
  if (article.sourceName) metaParts.push(escapeHtml(article.sourceName));
  metaParts.push(`${minutes} min`);

  const cls = isLead ? 'story-card lead-story' : 'story-card';

  let summaryText = article.deck;
  if (!summaryText && isLead) {
    const firstPara = article.blocks.find((b) => b.type === 'lead' || b.type === 'paragraph');
    if (firstPara) {
      const plain = stripHtml(firstPara.html || firstPara.text || '');
      summaryText = plain.length > 240 ? plain.slice(0, 237).replace(/\s+\S*$/, '') + '…' : plain;
    }
  }

  return `      <article class="${cls}" data-slug="${escapeHtml(article.slug)}" data-section="${escapeHtml(article.section)}" data-search="${escapeHtml(searchCorpus)}">
        <a class="story-card-link" href="#${escapeHtml(article.slug)}" data-open-article="${escapeHtml(article.slug)}">
          <div class="kicker">${escapeHtml(article.kicker)}</div>
          <h2 class="story-title">${escapeHtml(article.title)}</h2>${
            summaryText ? `\n          <p class="story-deck">${escapeHtml(summaryText)}</p>` : ''
          }
          <div class="story-meta">${metaParts.join(' <span class="dot">·</span> ')}</div>${
            isLead ? `\n          <span class="read-cta">Leer artículo completo →</span>` : ''
          }
        </a>
      </article>`;
}

async function buildHtml(config, articles) {
  const paperName = config.name || 'El Archivo';
  const paperSubtitle = config.subtitle || 'Lecturas escogidas · Edición personal';
  const sections = [...new Set(articles.map((a) => a.section).filter(Boolean))];
  const editionDate = formatEditionDate();
  const countLabel =
    articles.length === 1 ? '1 lectura archivada' : `${articles.length} lecturas archivadas`;

  const filterPills = [
    `<button class="filter-pill active" type="button" data-filter-section="all">Todas (${articles.length})</button>`,
    ...sections.map((sec) => {
      const count = articles.filter((a) => a.section === sec).length;
      return `<button class="filter-pill" type="button" data-filter-section="${escapeHtml(sec)}">${escapeHtml(sec)} (${count})</button>`;
    }),
  ].join('\n        ');

  const storiesHtml =
    articles.length > 0
      ? articles.map((article, idx) => renderStoryCard(article, idx === 0)).join('\n')
      : `      <div class="empty-archive">
        <p>Todavía no hay notas en este archivo. Pasale un link, PDF o texto a Antigravity con <code>/nota</code> para publicar la primera.</p>
      </div>`;

  const articlesViewsHtml = (
    await Promise.all(articles.map((article, idx) => renderArticleSection(article, idx, articles)))
  ).join('\n\n');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(config.language || 'es')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(paperName)} — ${escapeHtml(paperSubtitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #FAF8F5;
      --surface: #F2EFE9;
      --text: #1F1E1C;
      --text-muted: #5C5852;
      --border: #E2DDD5;
      --accent: #8B2635;
      --link: #7A2330;
      --progress: #8B2635;
      --font-size: 19px;
    }

    [data-theme="sepia"] {
      --bg: #F4ECD8;
      --surface: #EAE0C8;
      --text: #2C241B;
      --text-muted: #6A5D4D;
      --border: #D9CCA9;
      --accent: #7D3224;
      --link: #7D3224;
      --progress: #7D3224;
    }

    [data-theme="dark"] {
      --bg: #161615;
      --surface: #20201E;
      --text: #E6E2DA;
      --text-muted: #A19B91;
      --border: #2E2D2A;
      --accent: #D67A85;
      --link: #E08B95;
      --progress: #D67A85;
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      padding: 0;
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Newsreader', Georgia, 'Times New Roman', serif;
      font-size: var(--font-size);
      line-height: 1.75;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      transition: background-color 0.25s ease, color 0.25s ease;
    }

    [hidden] {
      display: none !important;
    }

    /* Barra de progreso de lectura */
    .progress-bar {
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      width: 0%;
      background: var(--progress);
      z-index: 100;
      transition: width 0.08s linear;
    }

    /* Barra superior minimalista */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      padding: 0.7rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      color: var(--text-muted);
    }

    .topbar-left {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      min-width: 0;
    }

    .back-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 500;
      padding: 0.28rem 0.62rem;
      border-radius: 5px;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .back-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .masthead {
      font-family: 'Newsreader', Georgia, serif;
      font-style: italic;
      font-size: 14px;
      letter-spacing: 0.01em;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-shrink: 0;
    }

    .ctrl-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 500;
      padding: 0.28rem 0.55rem;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .ctrl-btn:hover {
      border-color: var(--text-muted);
      color: var(--text);
    }

    .ctrl-btn.active {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
    }

    /* ===========================
       PORTADA DEL PERIÓDICO (GRILLA EDITORIAL)
       =========================== */
    .frontpage-container {
      max-width: 1260px;
      margin: 0 auto;
      padding: 2.5rem 2rem 5rem;
    }

    .paper-header {
      text-align: center;
      padding: 1.5rem 0 1.25rem;
      border-top: 3px solid var(--text);
      border-bottom: 1px solid var(--text);
      margin-bottom: 1.5rem;
    }

    .paper-title {
      font-family: 'Newsreader', Georgia, serif;
      font-size: clamp(2.35rem, 5.5vw, 3.6rem);
      font-weight: 600;
      letter-spacing: -0.025em;
      line-height: 1.05;
      margin: 0 0 0.45rem;
      color: var(--text);
    }

    .paper-subtitle {
      font-family: 'Newsreader', Georgia, serif;
      font-style: italic;
      font-size: 1.05rem;
      color: var(--text-muted);
      margin: 0 0 1rem;
    }

    .paper-meta {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.35rem 0.9rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .archive-toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.85rem 1.5rem;
      margin-bottom: 2.25rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
    }

    .search-wrap {
      position: relative;
      flex: 1 1 300px;
      max-width: 440px;
    }

    .search-input {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      padding: 0.65rem 2.25rem 0.65rem 0.95rem;
      border-radius: 6px;
      outline: none;
      transition: border-color 0.15s ease, background-color 0.2s ease;
    }

    .search-input::placeholder {
      color: var(--text-muted);
      opacity: 0.85;
    }

    .search-input:focus {
      border-color: var(--accent);
    }

    .search-clear {
      position: absolute;
      right: 0.5rem;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 16px;
      cursor: pointer;
      padding: 0.2rem 0.45rem;
      line-height: 1;
    }

    .search-clear:hover {
      color: var(--text);
    }

    .filter-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      align-items: center;
    }

    .filter-pill {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 500;
      padding: 0.3rem 0.7rem;
      border-radius: 999px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .filter-pill:hover {
      border-color: var(--text-muted);
      color: var(--text);
    }

    .filter-pill.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #FAF8F5;
    }

    [data-theme="dark"] .filter-pill.active {
      color: #161615;
    }

    .story-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
    }

    .story-card {
      border-bottom: 1px solid var(--border);
      padding: 1.5rem 0;
    }

    .story-card:first-child {
      padding-top: 0.25rem;
    }

    .story-card-link {
      display: block;
      text-decoration: none;
      color: inherit;
      height: 100%;
    }

    .story-card .story-title {
      font-family: 'Newsreader', Georgia, serif;
      font-size: clamp(1.32rem, 2.2vw, 1.62rem);
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: -0.015em;
      margin: 0 0 0.55rem;
      color: var(--text);
      transition: color 0.15s ease;
    }

    .story-card.lead-story {
      padding: 0.25rem 0 2rem;
      border-bottom: 1px solid var(--border);
    }

    .story-card.lead-story .story-title {
      font-size: clamp(1.9rem, 3.8vw, 2.75rem);
      line-height: 1.12;
      margin-bottom: 0.85rem;
    }

    .story-card-link:hover .story-title {
      color: var(--accent);
    }

    .story-deck {
      font-size: 1.02rem;
      line-height: 1.52;
      color: var(--text-muted);
      margin: 0 0 0.9rem;
    }

    .story-card.lead-story .story-deck {
      font-size: 1.16rem;
      line-height: 1.55;
      margin-bottom: 1.15rem;
    }

    /* Tablet: grilla de 2 columnas */
    @media (min-width: 680px) {
      .story-list {
        grid-template-columns: repeat(2, 1fr);
        column-gap: 2.25rem;
      }

      .story-card.lead-story {
        grid-column: 1 / -1;
        padding-bottom: 2.25rem;
        border-bottom: 2px solid var(--border);
      }
    }

    /* Desktop ancho: portada tipo diario (nota principal izquierda + columna derecha + 3 columnas abajo) */
    @media (min-width: 1000px) {
      .story-list:not(.is-filtered) {
        grid-template-columns: repeat(12, 1fr);
        column-gap: 0;
        align-items: start;
      }

      .story-list:not(.is-filtered) .story-card {
        grid-column: span 4;
        padding: 1.75rem 1.5rem;
        border-bottom: 1px solid var(--border);
      }

      .story-list:not(.is-filtered) .story-card.lead-story {
        grid-column: 1 / span 7;
        grid-row: 1 / span 2;
        padding: 0.25rem 2.5rem 2rem 0;
        border-right: 1px solid var(--border);
        border-bottom: 2px solid var(--border);
        align-self: stretch;
      }

      .story-list:not(.is-filtered) .story-card:nth-child(2) {
        grid-column: 8 / span 5;
        grid-row: 1;
        padding: 0.25rem 0 1.6rem 2.5rem;
      }

      .story-list:not(.is-filtered) .story-card:nth-child(3) {
        grid-column: 8 / span 5;
        grid-row: 2;
        padding: 1.6rem 0 2rem 2.5rem;
        border-bottom: 2px solid var(--border);
      }

      /* Si solo hay 2 notas, la segunda cierra el pliego principal */
      .story-list:not(.is-filtered) .story-card:nth-child(2):last-child {
        border-bottom: 2px solid var(--border);
        grid-row: 1 / span 2;
        align-self: stretch;
      }

      /* Si solo hay 1 nota, ocupa todo el ancho editorial */
      .story-list:not(.is-filtered) .story-card.lead-story:last-child {
        grid-column: 1 / -1;
        border-right: none;
        padding-right: 0;
      }

      /* Filas inferiores de 3 columnas con divisores sutiles */
      .story-list:not(.is-filtered) .story-card:nth-child(3n+4) {
        padding-left: 0;
      }

      .story-list:not(.is-filtered) .story-card:nth-child(3n+6) {
        padding-right: 0;
      }

      .story-list:not(.is-filtered) .story-card:nth-child(n+4):not(:nth-child(3n+6)) {
        border-right: 1px solid var(--border);
      }

      /* Vista filtrada/buscada: grilla limpia de 3 columnas */
      .story-list.is-filtered {
        grid-template-columns: repeat(3, 1fr);
        column-gap: 2.25rem;
      }

      .story-list.is-filtered .story-card.lead-story {
        grid-column: auto;
        border-bottom: 1px solid var(--border);
        padding: 1.5rem 0;
      }
    }

    .story-meta {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.3rem 0.65rem;
    }

    .story-meta strong {
      color: var(--text);
      font-weight: 600;
    }

    .story-meta .dot {
      opacity: 0.5;
    }

    .read-cta {
      display: inline-block;
      margin-top: 1.05rem;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: var(--accent);
    }

    .empty-archive,
    .no-results {
      text-align: center;
      padding: 3rem 1.5rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: 'Inter', sans-serif;
      font-size: 14.5px;
      color: var(--text-muted);
    }

    /* ===========================
       VISTA DE LECTURA (DISEÑO ORIGINAL)
       =========================== */
    .article-container {
      max-width: 680px;
      margin: 0 auto;
      padding: 3.5rem 1.5rem 5rem;
    }

    .article-header {
      margin-bottom: 2.5rem;
      padding-bottom: 1.75rem;
      border-bottom: 1px solid var(--border);
    }

    .kicker {
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 0.9rem;
    }

    .article-header h1 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: clamp(2rem, 4.5vw, 2.85rem);
      font-weight: 600;
      line-height: 1.15;
      letter-spacing: -0.02em;
      margin: 0 0 1.1rem;
      color: var(--text);
    }

    .deck {
      font-size: 1.22rem;
      line-height: 1.5;
      color: var(--text-muted);
      margin: 0 0 1.5rem;
      font-weight: 400;
    }

    .byline {
      font-family: 'Inter', sans-serif;
      font-size: 13.5px;
      color: var(--text-muted);
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 0.85rem;
      align-items: center;
    }

    .byline strong {
      color: var(--text);
      font-weight: 600;
    }

    .byline .dot {
      opacity: 0.5;
    }

    .byline .source-link {
      color: var(--link);
      text-decoration: none;
      border-bottom: 1px solid transparent;
    }

    .byline .source-link:hover {
      border-bottom-color: var(--link);
    }

    /* Cuerpo del texto */
    .article-body p {
      margin: 0 0 1.35rem;
      text-align: left;
      hyphens: auto;
    }

    .article-body a {
      color: var(--link);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .dateline {
      font-family: 'Inter', sans-serif;
      font-size: 0.8em;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text);
    }

    .article-body p.lead::first-letter {
      float: left;
      font-size: 3.4em;
      line-height: 0.82;
      padding-right: 0.14em;
      padding-top: 0.06em;
      font-weight: 600;
      color: var(--accent);
    }

    em {
      font-style: italic;
    }

    /* Extensiones discretas coherentes con la estética editorial */
    .article-body h2 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 1.48rem;
      font-weight: 600;
      line-height: 1.26;
      letter-spacing: -0.012em;
      color: var(--text);
      margin: 2.35rem 0 0.9rem;
    }

    .article-body h3 {
      font-family: 'Inter', sans-serif;
      font-size: 0.82em;
      font-weight: 600;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--accent);
      margin: 1.95rem 0 0.7rem;
    }

    .editorial-quote {
      margin: 2rem 0;
      padding: 0.25rem 0 0.25rem 1.35rem;
      border-left: 3px solid var(--accent);
      font-style: italic;
      color: var(--text-muted);
    }

    .editorial-quote p {
      margin: 0 0 0.45rem;
      font-size: 1.06em;
      line-height: 1.65;
    }

    .editorial-quote p:last-child {
      margin-bottom: 0;
    }

    .editorial-quote cite {
      display: block;
      margin-top: 0.5rem;
      font-family: 'Inter', sans-serif;
      font-style: normal;
      font-size: 13px;
      color: var(--text-muted);
      opacity: 0.9;
    }

    .editorial-list {
      margin: 0 0 1.45rem;
      padding-left: 1.45rem;
    }

    .editorial-list li {
      margin-bottom: 0.55rem;
      padding-left: 0.2rem;
    }

    .editorial-list li::marker {
      color: var(--accent);
    }

    /* Bloques de código editoriales */
    .editorial-code-wrap {
      margin: 1.85rem 0;
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }

    .code-lang {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      padding: 0.45rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    .editorial-code {
      margin: 0;
      padding: 1rem 1.15rem;
      overflow-x: auto;
      font-family: ui-monospace, 'Cascadia Code', 'SFMono-Regular', Menlo, Consolas, monospace;
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--text);
      tab-size: 2;
    }

    .editorial-code code {
      font-family: inherit;
    }

    .article-body p code,
    .article-body li code {
      font-family: ui-monospace, 'Cascadia Code', 'SFMono-Regular', Menlo, Consolas, monospace;
      font-size: 0.84em;
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.08em 0.35em;
    }

    /* Gráficos e imágenes editoriales */
    .editorial-figure {
      margin: 2.15rem 0;
      padding: 0;
    }

    .editorial-figure img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 6px;
      border: 1px solid var(--border);
      background-color: var(--surface);
    }

    .editorial-figure figcaption {
      margin-top: 0.65rem;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: var(--text-muted);
      text-align: center;
    }

    /* Separador editorial sutil */
    .section-break {
      border: 0;
      text-align: center;
      margin: 2.2rem 0;
      height: auto;
    }

    .section-break::before {
      content: "·  ·  ·";
      color: var(--text-muted);
      letter-spacing: 0.35em;
      font-size: 1rem;
    }

    /* Recuadro de contacto editorial */
    .callout {
      margin: 2.25rem 0;
      padding: 1.25rem 1.5rem;
      background-color: var(--surface);
      border-left: 3px solid var(--accent);
      border-radius: 0 6px 6px 0;
      font-family: 'Inter', sans-serif;
      font-size: 14.5px;
      line-height: 1.6;
    }

    .callout-title {
      font-weight: 600;
      color: var(--text);
      margin: 0 0 0.35rem;
      font-size: 15px;
    }

    .callout p {
      margin: 0 !important;
      color: var(--text-muted);
    }

    .callout a {
      color: var(--link);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    /* Bloque de comentarios de lectores */
    .readers-box {
      margin-top: 3rem;
      padding: 1.5rem 1.65rem;
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: 'Inter', sans-serif;
    }

    .readers-box h2 {
      font-size: 15px;
      font-weight: 600;
      margin: 0 0 0.7rem;
      color: var(--text);
      letter-spacing: -0.01em;
    }

    .readers-box p {
      font-size: 14.5px;
      line-height: 1.6;
      color: var(--text-muted);
      margin: 0 0 0.9rem;
    }

    .readers-box .ai-note {
      font-size: 12.5px;
      color: var(--text-muted);
      opacity: 0.85;
      margin: 0;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
      font-style: italic;
    }

    /* Navegación al pie del artículo */
    .article-footer-nav {
      margin-top: 3.5rem;
      padding-top: 1.75rem;
      border-top: 1px solid var(--border);
      font-family: 'Inter', sans-serif;
    }

    .article-footer-top {
      margin-bottom: 1.25rem;
    }

    .back-cover-pill {
      display: inline-block;
      font-size: 13px;
      font-weight: 500;
      color: var(--accent);
      text-decoration: none;
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 5px;
      transition: all 0.15s ease;
    }

    .back-cover-pill:hover {
      border-color: var(--accent);
      background: var(--surface);
    }

    .article-nav-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .article-nav-link {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.95rem 1.05rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s ease;
    }

    .article-nav-link:hover {
      border-color: var(--accent);
    }

    .article-nav-link.next {
      text-align: right;
    }

    .nav-label {
      font-size: 11.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
    }

    .nav-title {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 15.5px;
      line-height: 1.3;
      color: var(--text);
    }

    @media (max-width: 600px) {
      .article-container {
        padding: 2.2rem 1.15rem 3.5rem;
      }
      .frontpage-container {
        padding: 1.75rem 1.15rem 3.5rem;
      }
      .masthead {
        display: none;
      }
    }

    @media print {
      .topbar,
      .progress-bar,
      .frontpage-view,
      .article-footer-nav {
        display: none !important;
      }
      body {
        background: #fff;
        color: #000;
        font-size: 12pt;
      }
      .article-container {
        max-width: 100%;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="progress-bar" id="progressBar"></div>

  <nav class="topbar" aria-label="Controles de lectura">
    <div class="topbar-left">
      <a class="back-btn" id="backToFront" href="#" data-go-home hidden>← Portada</a>
      <div class="masthead" id="topbarMasthead" data-default-masthead="${escapeHtml(paperName)}">${escapeHtml(paperName)}</div>
    </div>
    <div class="controls">
      <button class="ctrl-btn" id="fontDec" type="button" title="Reducir tamaño de letra">A−</button>
      <button class="ctrl-btn" id="fontInc" type="button" title="Aumentar tamaño de letra">A+</button>
      <button class="ctrl-btn active" type="button" data-set-theme="light" title="Modo claro">Claro</button>
      <button class="ctrl-btn" type="button" data-set-theme="sepia" title="Modo sepia">Sepia</button>
      <button class="ctrl-btn" type="button" data-set-theme="dark" title="Modo oscuro">Oscuro</button>
    </div>
  </nav>

  <!-- VISTA PORTADA -->
  <section class="frontpage-view" id="frontpageView">
    <div class="frontpage-container">
      <header class="paper-header">
        <h1 class="paper-title">${escapeHtml(paperName)}</h1>
        <p class="paper-subtitle">${escapeHtml(paperSubtitle)}</p>
        <div class="paper-meta">
          <span>Actualizado el ${escapeHtml(editionDate)}</span>
          <span>·</span>
          <span>${escapeHtml(countLabel)}</span>
        </div>
      </header>

      <div class="archive-toolbar" aria-label="Buscar y filtrar archivo">
        <div class="search-wrap">
          <input
            type="search"
            id="archiveSearch"
            class="search-input"
            placeholder="Buscar por título, autor, medio o palabra clave…"
            autocomplete="off"
          >
          <button type="button" id="searchClear" class="search-clear" title="Limpiar búsqueda" hidden>×</button>
        </div>
        <div class="filter-pills" id="sectionFilters" role="tablist" aria-label="Filtrar por sección">
        ${filterPills}
        </div>
      </div>

      <div class="story-list" id="storyList">
${storiesHtml}
      </div>

      <div class="no-results" id="noResults" hidden>
        No se encontraron notas que coincidan con tu búsqueda.
      </div>
    </div>
  </section>

  <!-- VISTAS DE LECTURA -->
${articlesViewsHtml}

  <script>
    (function () {
      const PAPER_TITLE = ${JSON.stringify(`${paperName} — ${paperSubtitle}`)};
      const progressBar = document.getElementById('progressBar');
      const frontpageView = document.getElementById('frontpageView');
      const backToFront = document.getElementById('backToFront');
      const topbarMasthead = document.getElementById('topbarMasthead');
      const defaultMasthead = topbarMasthead.getAttribute('data-default-masthead') || '';
      const articleViews = Array.from(document.querySelectorAll('.article-view'));
      const storyCards = Array.from(document.querySelectorAll('.story-card'));
      const searchInput = document.getElementById('archiveSearch');
      const searchClear = document.getElementById('searchClear');
      const filterButtons = Array.from(document.querySelectorAll('[data-filter-section]'));
      const noResults = document.getElementById('noResults');

      let activeSlug = null;
      let activeSection = 'all';

      // --- Barra de progreso ---
      function updateProgress() {
        if (!activeSlug) {
          progressBar.style.width = '0%';
          return;
        }
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
        progressBar.style.width = progress + '%';
      }
      window.addEventListener('scroll', updateProgress, { passive: true });

      // --- Tema (Claro / Sepia / Oscuro) con persistencia ---
      const themeButtons = document.querySelectorAll('[data-set-theme]');
      function applyTheme(theme) {
        if (theme === 'light' || !theme) {
          document.documentElement.removeAttribute('data-theme');
          theme = 'light';
        } else {
          document.documentElement.setAttribute('data-theme', theme);
        }
        themeButtons.forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-set-theme') === theme);
        });
        try { localStorage.setItem('el-archivo-theme', theme); } catch {}
      }

      themeButtons.forEach((btn) => {
        btn.addEventListener('click', () => applyTheme(btn.getAttribute('data-set-theme')));
      });

      try {
        const savedTheme = localStorage.getItem('el-archivo-theme');
        if (savedTheme) applyTheme(savedTheme);
      } catch {}

      // --- Tamaño de fuente con persistencia ---
      let currentSize = 19;
      const minSize = 15;
      const maxSize = 25;
      function applyFontSize(size) {
        currentSize = Math.min(maxSize, Math.max(minSize, size));
        document.documentElement.style.setProperty('--font-size', currentSize + 'px');
        try { localStorage.setItem('el-archivo-font-size', String(currentSize)); } catch {}
      }
      try {
        const savedSize = Number(localStorage.getItem('el-archivo-font-size'));
        if (savedSize >= minSize && savedSize <= maxSize) applyFontSize(savedSize);
      } catch {}

      document.getElementById('fontDec').addEventListener('click', () => applyFontSize(currentSize - 1));
      document.getElementById('fontInc').addEventListener('click', () => applyFontSize(currentSize + 1));

      // --- Navegación Portada <-> Artículo ---
      function showFrontpage(updateHash) {
        activeSlug = null;
        articleViews.forEach((v) => { v.hidden = true; });
        frontpageView.hidden = false;
        backToFront.hidden = true;
        topbarMasthead.textContent = defaultMasthead;
        document.title = PAPER_TITLE;
        progressBar.style.width = '0%';
        if (updateHash && location.hash) {
          history.pushState(null, '', location.pathname + location.search);
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
      }

      function showArticle(slug, updateHash) {
        const target = articleViews.find((v) => v.getAttribute('data-slug') === slug);
        if (!target) {
          showFrontpage(false);
          return;
        }
        activeSlug = slug;
        frontpageView.hidden = true;
        articleViews.forEach((v) => { v.hidden = v !== target; });
        backToFront.hidden = false;
        topbarMasthead.textContent = target.getAttribute('data-masthead') || defaultMasthead;
        document.title = target.getAttribute('data-title') || PAPER_TITLE;
        if (updateHash && location.hash !== '#' + slug) {
          location.hash = slug;
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
        updateProgress();
      }

      document.addEventListener('click', (e) => {
        const openTrigger = e.target.closest('[data-open-article]');
        if (openTrigger) {
          e.preventDefault();
          showArticle(openTrigger.getAttribute('data-open-article'), true);
          return;
        }
        const homeTrigger = e.target.closest('[data-go-home]');
        if (homeTrigger) {
          e.preventDefault();
          showFrontpage(true);
        }
      });

      window.addEventListener('hashchange', () => {
        const slug = decodeURIComponent(location.hash.replace(/^#/, ''));
        if (slug) showArticle(slug, false);
        else showFrontpage(false);
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && activeSlug) {
          showFrontpage(true);
        }
      });

      // --- Búsqueda y filtros en portada ---
      const storyList = document.getElementById('storyList');
      function applyFilters() {
        const q = (searchInput?.value || '').trim().toLowerCase();
        const isFiltered = activeSection !== 'all' || Boolean(q);
        if (searchClear) searchClear.hidden = !q;
        if (storyList) storyList.classList.toggle('is-filtered', isFiltered);

        let visibleCount = 0;
        storyCards.forEach((card, idx) => {
          const sec = card.getAttribute('data-section') || '';
          const corpus = card.getAttribute('data-search') || '';
          const matchesSection = activeSection === 'all' || sec === activeSection;
          const matchesQuery = !q || corpus.includes(q);
          const visible = matchesSection && matchesQuery;
          card.hidden = !visible;
          // Mantener estilo lead solo cuando es la primera nota sin filtro/búsqueda activa
          if (idx === 0) {
            card.classList.toggle('lead-story', !isFiltered);
          }
          if (visible) visibleCount++;
        });

        if (noResults) {
          noResults.hidden = visibleCount > 0 || storyCards.length === 0;
        }
      }

      if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
      }
      if (searchClear) {
        searchClear.addEventListener('click', () => {
          searchInput.value = '';
          applyFilters();
          searchInput.focus();
        });
      }
      filterButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          activeSection = btn.getAttribute('data-filter-section') || 'all';
          filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
          applyFilters();
        });
      });

      // --- Estado inicial ---
      const initialSlug = decodeURIComponent(location.hash.replace(/^#/, ''));
      if (initialSlug) {
        showArticle(initialSlug, false);
      } else {
        showFrontpage(false);
      }
    })();
  </script>
</body>
</html>
`;
}

export async function loadConfig() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  } catch {
    return {
      name: 'El Archivo',
      subtitle: 'Lecturas escogidas · Edición personal',
      defaultMasthead: 'El Archivo',
      outputFile: 'periodico.html',
      language: 'es',
    };
  }
}

export async function loadArticles(config) {
  await fs.mkdir(ARTICLES_DIR, { recursive: true });
  const entries = await fs.readdir(ARTICLES_DIR, { withFileTypes: true });
  const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));

  const articles = [];
  for (const entry of jsonFiles) {
    const fullPath = path.join(ARTICLES_DIR, entry.name);
    const raw = JSON.parse(await fs.readFile(fullPath, 'utf8'));
    articles.push(validateAndNormalizeArticle(raw, config));
  }

  // Más reciente primero (por addedAt, luego dateIso)
  articles.sort((a, b) => {
    const ta = Date.parse(a.addedAt || a.dateIso || 0) || 0;
    const tb = Date.parse(b.addedAt || b.dateIso || 0) || 0;
    return tb - ta;
  });

  return articles;
}

export async function buildNewspaper() {
  const config = await loadConfig();
  const articles = await loadArticles(config);
  const html = await buildHtml(config, articles);
  const outputPath = path.resolve(ROOT, config.outputFile || 'periodico.html');
  await fs.writeFile(outputPath, html, 'utf8');
  // Mantener index.html sincronizado para GitHub Pages / hosting estático
  const indexPath = path.resolve(ROOT, 'index.html');
  if (indexPath !== outputPath) {
    await fs.writeFile(indexPath, html, 'utf8');
  }
  return { outputPath, articleCount: articles.length, articles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--list')) {
    loadConfig()
      .then((config) => loadArticles(config))
      .then((articles) => {
        console.log(
          JSON.stringify(
            articles.map((a) => ({
              slug: a.slug,
              title: a.title,
              author: a.author,
              sourceName: a.sourceName,
              sourceUrl: a.sourceUrl,
              dateIso: a.dateIso,
            })),
            null,
            2
          )
        );
      })
      .catch((err) => {
        console.error('Error al listar artículos:', err.message);
        process.exit(1);
      });
  } else {
    buildNewspaper()
      .then(({ outputPath, articleCount }) => {
        console.log(
          `Periódico generado: ${outputPath} (${articleCount} nota${articleCount === 1 ? '' : 's'})`
        );
      })
      .catch((err) => {
        console.error('Error al generar el periódico:', err.message);
        process.exit(1);
      });
  }
}
