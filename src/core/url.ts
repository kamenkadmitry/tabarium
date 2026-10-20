/** Normalises a URL for duplicate detection: drops the hash and a trailing slash. */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}
