/** What a page says about itself: its description and its first heading. */
export interface PageInfo {
  description: string | null;
  heading: string | null;
}

const MAX_DESCRIPTION = 300;
const MAX_HEADING = 200;
const MAX_BYTES = 400_000;
const TIMEOUT_MS = 8000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1]?.toLowerCase() === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const tidy = (text: string, limit: number): string | null => {
  const clean = decodeEntities(text).replace(/\s+/g, ' ').trim();
  return clean === '' ? null : clean.slice(0, limit);
};

function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    out.set((m[1] ?? '').toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/**
 * Reads the description (meta description, then Open Graph, then Twitter) and the first <h1> from page source.
 * Works on text alone, so it runs anywhere (page, service worker, tests).
 */
export function parsePageInfo(html: string): PageInfo {
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, '');
  const metas = new Map<string, string>();
  for (const m of source.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(m[0]);
    const key = (attrs.get('name') ?? attrs.get('property') ?? '').toLowerCase();
    const content = attrs.get('content');
    if (key !== '' && content !== undefined && !metas.has(key)) metas.set(key, content);
  }
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(source)?.[1];
  return {
    description: tidy(metas.get('description') ?? metas.get('og:description') ?? metas.get('twitter:description') ?? '', MAX_DESCRIPTION),
    heading: h1 === undefined ? null : tidy(h1.replace(/<[^>]*>/g, ' '), MAX_HEADING),
  };
}

/** The charset a response announces: in its Content-Type, or in a <meta> near the top of the page. */
function charsetOf(contentType: string | null, head: Uint8Array): string {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  if (fromHeader) return fromHeader;
  const ascii = new TextDecoder('latin1').decode(head.slice(0, 2048));
  return /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(ascii)?.[1] ?? 'utf-8';
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Downloads a page (at most about 400 KB, eight seconds) and reads its description and heading.
 * Throws when the page cannot be loaded or is not HTML; the caller decides what to do about it.
 */
export async function fetchPageInfo(url: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)): Promise<PageInfo> {
  if (!/^https?:\/\//.test(url)) throw new Error('Only http and https pages can be read');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow', credentials: 'omit', headers: { accept: 'text/html,application/xhtml+xml' } });
    if (!response.ok) throw new Error(`The page answered ${response.status}`);
    const type = response.headers.get('content-type');
    if (type !== null && !/html/i.test(type)) throw new Error('The address is not a web page');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The page sent nothing');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    void reader.cancel();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    let label = charsetOf(type, bytes);
    try {
      new TextDecoder(label);
    } catch {
      label = 'utf-8'; // an unknown charset name: the page is most likely UTF-8
    }
    return parsePageInfo(new TextDecoder(label).decode(bytes));
  } finally {
    clearTimeout(timer);
  }
}
