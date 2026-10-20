/** Turns user input ("#Machine Learning", " ai ") into the stored form: lowercase, no "#", words joined by "-". Empty when nothing usable is left. */
export function normalizeHashtag(input: string): string {
  return input
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
