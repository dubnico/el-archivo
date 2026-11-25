import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { extractText, getDocumentProxy } from 'unpdf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INBOX_DIR = path.join(ROOT, 'entrada');

const PAYWALL_PATTERNS = [
  /subscribe to (?:continue|keep) reading/i,
  /already a subscriber/i,
  /create a free account to continue/i,
  /sign in to (?:continue|read)/i,
  /this article is for subscribers/i,
  /unlock this (?:article|story)/i,
  /suscr[ií]bete para seguir leyendo/i,
  /inicia sesi[oó]n para seguir leyendo/i,
  /contenido exclusivo para suscriptores/i,
  /please enable javascript/i,
  /verify you are human/i,
  /checking your browser/i,
  /attention required! \| cloudflare/i,
  /access denied/i,
];

function parseArgs(argv) {
  const args = { source: null, out: null, inbox: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--inbox') {
      args.inbox = true;
    } else if (a === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    } else if (!a.startsWith('-') && !args.source) {
      args.source = a;
    }
  }
  return args;
}

function htmlToStructuredText(html) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const lines = [];

  function walk(node) {
    if (!node) return;
    const tag = node.tagName ? node.tagName.toLowerCase() : '';
    if (!tag) {
      return;
    }
    if (['script', 'style', 'noscript', 'svg', 'button', 'form', 'nav'].includes(tag)) {
      return;
    }
    if (tag === 'h1' || tag === 'h2') {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines.push(`## ${t}`);
      return;
    }
    if (tag === 'h3' || tag === 'h4') {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines.push(`### ${t}`);
      return;
    }
    if (tag === 'hr') {
      lines.push('---');
      return;
    }
    if (tag === 'blockquote') {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines.push(`> ${t}`);
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = [...node.querySelectorAll(':scope > li')];
      if (items.length) {
        items.forEach((li, idx) => {
          const t = li.textContent.replace(/\s+/g, ' ').trim();
          if (t) lines.push(tag === 'ol' ? `${idx + 1}. ${t}` : `- ${t}`);
        });
        return;
      }
    }
    if (tag === 'p') {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines.push(t);
      return;
    }
    if (node.children && node.children.length > 0) {
      for (const child of node.children) walk(child);
    } else {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines.push(t);
    }
  }

  for (const child of document.body.children) {
    walk(child);
  }
  return lines.join('\n\n').trim();
}

function getMeta(document, selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const val = el?.getAttribute('content') || el?.textContent;
    if (val && val.trim()) return val.trim();
  }
  return '';
}

async function extractUrl(url) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
  } catch (err) {
    return {
      ok: false,
      blocked: true,
      sourceType: 'url',
      source: url,
      reason: `Error de red al descargar la URL: ${err.message}`,
      hint: 'Pegá el texto del artículo acá o guardalo como PDF desde el navegador en entrada/.',
    };
  }

  if ([401, 402, 403, 429, 451].includes(response.status)) {
    return {
      ok: false,
      blocked: true,
      sourceType: 'url',
      source: url,
      status: response.status,
      reason: `El sitio bloqueó la descarga automática (HTTP ${response.status}).`,
      hint: 'Posible paywall o protección anti-bot. Pegá el texto directamente o guardá la página como PDF en entrada/.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      blocked: true,
      sourceType: 'url',
      source: url,
      status: response.status,
      reason: `Respuesta HTTP inesperada (${response.status}).`,
      hint: 'Verificá el link o pegá el texto / PDF directamente.',
    };
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    const buf = new Uint8Array(await response.arrayBuffer());
    return extractPdfBuffer(buf, url);
  }

  const rawHtml = await response.text();
  const { document } = parseHTML(rawHtml);

  const meta = {
    title: getMeta(document, ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'title']),
    description: getMeta(document, ['meta[property="og:description"]', 'meta[name="description"]']),
    siteName: getMeta(document, ['meta[property="og:site_name"]', 'meta[name="application-name"]']),
    author: getMeta(document, ['meta[name="author"]', 'meta[property="article:author"]']),
    publishedTime: getMeta(document, [
      'meta[property="article:published_time"]',
      'meta[name="pubdate"]',
      'meta[name="publish-date"]',
      'time[datetime]',
    ]),
    section: getMeta(document, ['meta[property="article:section"]']),
  };

  if (!meta.siteName) {
    try {
      meta.siteName = new URL(response.url || url).hostname.replace(/^www\./, '');
    } catch {}
  }

  // Clone DOM for Readability since it mutates the document
  const { document: readableDoc } = parseHTML(rawHtml);
  try {
    Object.defineProperty(readableDoc, 'baseURI', { value: response.url || url });
  } catch {}

  const reader = new Readability(readableDoc);
  const parsed = reader.parse();

  const structuredText = parsed?.content
    ? htmlToStructuredText(parsed.content)
    : (parsed?.textContent || '').trim();

  const text = structuredText || (document.body?.textContent || '').replace(/\s+/g, ' ').trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const hasPaywallSignal = PAYWALL_PATTERNS.some((re) => re.test(rawHtml) || re.test(text));
  if (text.length < 600 && hasPaywallSignal) {
    return {
      ok: false,
      blocked: true,
      sourceType: 'url',
      source: response.url || url,
      meta: {
        ...meta,
        title: parsed?.title || meta.title,
        author: parsed?.byline || meta.author,
      },
      charCount: text.length,
      wordCount,
      reason: 'El sitio parece tener paywall, login obligatorio o bloqueo de JavaScript.',
      hint: 'Pegá el texto del artículo en el chat o guardalo como PDF desde tu navegador en la carpeta entrada/.',
    };
  }

  if (text.length < 250) {
    return {
      ok: false,
      blocked: true,
      sourceType: 'url',
      source: response.url || url,
      meta,
      charCount: text.length,
      wordCount,
      reason: 'Casi no se pudo extraer texto de la página (posible sitio renderizado con JS o paywall).',
      hint: 'Pegá el texto del artículo en el chat o guardalo como PDF desde tu navegador en entrada/.',
    };
  }

  return {
    ok: true,
    blocked: false,
    sourceType: 'url',
    source: response.url || url,
    warning:
      text.length < 1200 && hasPaywallSignal
        ? 'Se detectaron avisos de suscripción y el texto es relativamente corto; verificá si el artículo está completo antes de maquetar.'
        : undefined,
    meta: {
      title: parsed?.title || meta.title,
      description: parsed?.excerpt || meta.description,
      siteName: parsed?.siteName || meta.siteName,
      author: parsed?.byline || meta.author,
      publishedTime: parsed?.publishedTime || meta.publishedTime,
      section: meta.section,
    },
    charCount: text.length,
    wordCount,
    text,
  };
}

async function extractPdfBuffer(uint8Array, sourceLabel) {
  const pdf = await getDocumentProxy(uint8Array);
  const { totalPages, text: pages } = await extractText(pdf, { mergePages: false });

  const cleanedPages = (Array.isArray(pages) ? pages : [String(pages || '')]).map((pageText, idx) => {
    const cleaned = String(pageText || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return cleaned ? `[Página ${idx + 1}]\n${cleaned}` : '';
  });

  const fullText = cleanedPages.filter(Boolean).join('\n\n').trim();
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  if (fullText.length < 100) {
    return {
      ok: false,
      blocked: true,
      sourceType: 'pdf',
      source: sourceLabel,
      pageCount: totalPages,
      charCount: fullText.length,
      wordCount,
      reason: 'El PDF no tiene texto seleccionable (parece escaneado como imagen o protegido).',
      hint: 'Si podés, pasame el texto copiado o un PDF con texto seleccionable (OCR).',
    };
  }

  return {
    ok: true,
    blocked: false,
    sourceType: 'pdf',
    source: sourceLabel,
    pageCount: totalPages,
    meta: {
      title: path.basename(sourceLabel, path.extname(sourceLabel)),
    },
    charCount: fullText.length,
    wordCount,
    text: fullText,
  };
}

async function extractFile(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
  const ext = path.extname(resolved).toLowerCase();

  if (ext === '.pdf') {
    const buf = await fs.readFile(resolved);
    return extractPdfBuffer(new Uint8Array(buf), resolved);
  }

  const text = (await fs.readFile(resolved, 'utf8')).trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return {
    ok: true,
    blocked: false,
    sourceType: ext.replace('.', '') || 'text',
    source: resolved,
    meta: {
      title: path.basename(resolved, ext),
    },
    charCount: text.length,
    wordCount,
    text,
  };
}

async function listInbox() {
  try {
    const entries = await fs.readdir(INBOX_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase() !== 'readme.txt')
      .map((e) => path.join('entrada', e.name));
    console.log(JSON.stringify({ inboxDir: INBOX_DIR, files }, null, 2));
  } catch {
    console.log(JSON.stringify({ inboxDir: INBOX_DIR, files: [] }, null, 2));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.inbox) {
    await listInbox();
    return;
  }
  if (!args.source) {
    console.error('Uso: node scripts/extract.mjs <url | ruta-pdf | ruta-txt> [--out salida.json]');
    console.error('     node scripts/extract.mjs --inbox');
    process.exit(1);
  }

  const isUrl = /^https?:\/\//i.test(args.source);
  const result = isUrl ? await extractUrl(args.source) : await extractFile(args.source);

  if (args.out) {
    const outPath = path.isAbsolute(args.out) ? args.out : path.resolve(ROOT, args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');
    const summary = {
      ok: result.ok,
      blocked: result.blocked,
      sourceType: result.sourceType,
      source: result.source,
      pageCount: result.pageCount,
      charCount: result.charCount,
      wordCount: result.wordCount,
      meta: result.meta,
      warning: result.warning,
      reason: result.reason,
      hint: result.hint,
      savedTo: outPath,
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (!result.ok) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('Error en extract.mjs:', err.message);
  process.exit(1);
});
