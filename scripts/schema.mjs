export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'articulo';
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeInlineHtml(html) {
  let out = String(html ?? '');
  // Strip dangerous tags and their content
  out = out.replace(/<\s*(script|style|iframe|object|embed|form|input|button)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  out = out.replace(/<\s*(script|style|iframe|object|embed|form|input|button)\b[^>]*\/?>/gi, '');
  // Strip inline event handlers
  out = out.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Neutralize javascript: or data: URIs in href/src
  out = out.replace(/(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript|data):[^"']*\2/gi, '$1="#"');
  return out.trim();
}

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractSectionFromKicker(kicker) {
  const clean = String(kicker || '').trim();
  if (!clean) return 'General';
  const first = clean.split(/[·|•\/—–-]/)[0]?.trim();
  return first || clean;
}

export function estimateReadingMinutes(article) {
  const parts = [article.title, article.deck];
  for (const block of article.blocks || []) {
    if (block.html) parts.push(stripHtml(block.html));
    if (block.text) parts.push(block.text);
    if (block.titleHtml) parts.push(stripHtml(block.titleHtml));
    if (block.bodyHtml) parts.push(stripHtml(block.bodyHtml));
    if (Array.isArray(block.items)) {
      for (const item of block.items) parts.push(stripHtml(item));
    }
  }
  if (article.readersBox?.bodyHtml) {
    parts.push(stripHtml(article.readersBox.bodyHtml));
  }
  const words = parts
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 220)) };
}

export function validateAndNormalizeArticle(raw, config = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('El artículo debe ser un objeto JSON válido.');
  }
  if (!raw.title || typeof raw.title !== 'string' || !raw.title.trim()) {
    throw new Error('Falta el campo obligatorio "title".');
  }
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) {
    throw new Error('Falta el campo obligatorio "blocks" (debe ser una lista no vacía).');
  }

  const validTypes = new Set([
    'lead',
    'paragraph',
    'heading',
    'subheading',
    'blockquote',
    'list',
    'section_break',
    'callout',
  ]);

  const blocks = raw.blocks.map((block, index) => {
    if (!block || typeof block !== 'object' || !validTypes.has(block.type)) {
      throw new Error(`Bloque #${index + 1} inválido (tipo: ${block?.type ?? 'desconocido'}).`);
    }
    switch (block.type) {
      case 'lead':
      case 'paragraph': {
        const html = sanitizeInlineHtml(block.html ?? escapeHtml(block.text ?? ''));
        if (!html) throw new Error(`Bloque #${index + 1} (${block.type}) está vacío.`);
        return { type: block.type, html };
      }
      case 'heading':
      case 'subheading': {
        const text = String(block.text ?? stripHtml(block.html ?? '')).trim();
        if (!text) throw new Error(`Bloque #${index + 1} (${block.type}) está vacío.`);
        return { type: block.type, text };
      }
      case 'blockquote': {
        const html = sanitizeInlineHtml(block.html ?? escapeHtml(block.text ?? ''));
        if (!html) throw new Error(`Bloque #${index + 1} (blockquote) está vacío.`);
        const out = { type: 'blockquote', html };
        if (block.cite && String(block.cite).trim()) {
          out.cite = String(block.cite).trim();
        }
        return out;
      }
      case 'list': {
        if (!Array.isArray(block.items) || block.items.length === 0) {
          throw new Error(`Bloque #${index + 1} (list) requiere "items" no vacío.`);
        }
        return {
          type: 'list',
          ordered: Boolean(block.ordered),
          items: block.items.map((item) => sanitizeInlineHtml(item)).filter(Boolean),
        };
      }
      case 'section_break':
        return { type: 'section_break' };
      case 'callout': {
        const titleHtml = sanitizeInlineHtml(block.titleHtml ?? escapeHtml(block.title ?? ''));
        const bodyHtml = sanitizeInlineHtml(block.bodyHtml ?? escapeHtml(block.body ?? ''));
        if (!titleHtml && !bodyHtml) {
          throw new Error(`Bloque #${index + 1} (callout) está vacío.`);
        }
        return { type: 'callout', titleHtml, bodyHtml };
      }
      default:
        return block;
    }
  });

  const kicker = String(raw.kicker || 'Lectura').trim();
  const slug = slugify(raw.slug || raw.title);
  const dateIso = raw.dateIso ? String(raw.dateIso).trim() : new Date().toISOString().slice(0, 10);
  const addedAt = raw.addedAt ? String(raw.addedAt).trim() : new Date().toISOString();

  const normalized = {
    slug,
    title: raw.title.trim(),
    kicker,
    section: String(raw.section || extractSectionFromKicker(kicker)).trim(),
    deck: raw.deck ? String(raw.deck).trim() : '',
    masthead: String(raw.masthead || raw.sourceName || config.defaultMasthead || 'El Archivo').trim(),
    sourceName: raw.sourceName ? String(raw.sourceName).trim() : '',
    sourceUrl: raw.sourceUrl ? String(raw.sourceUrl).trim() : '',
    author: raw.author ? String(raw.author).trim() : '',
    date: raw.date ? String(raw.date).trim() : '',
    dateIso,
    addedAt,
    dateline: raw.dateline ? String(raw.dateline).trim() : '',
    blocks,
  };

  if (raw.readersBox && (raw.readersBox.bodyHtml || raw.readersBox.body)) {
    normalized.readersBox = {
      title: String(raw.readersBox.title || 'Qué están diciendo los lectores').trim(),
      bodyHtml: sanitizeInlineHtml(raw.readersBox.bodyHtml ?? escapeHtml(raw.readersBox.body ?? '')),
      aiNote: raw.readersBox.aiNote ? String(raw.readersBox.aiNote).trim() : '',
    };
  }

  return normalized;
}
