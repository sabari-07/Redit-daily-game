const PROFANITY_ROOTS = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga',
  'faggot', 'retard', 'whore', 'slut',
];

/** Masks profanity with asterisks, case-insensitive — matches root word at a word boundary prefix */
function maskProfanity(text: string): string {
  let result = text;
  for (const root of PROFANITY_ROOTS) {
    // Match the root at a word boundary, allowing suffix characters (e.g. fucking, shitty)
    const re = new RegExp(`\\b${root}\\w*`, 'gi');
    result = result.replace(re, (m) => '*'.repeat(m.length));
  }
  return result;
}

/**
 * Sanitizes a Reddit post title for safe display.
 * - Strips control characters
 * - Collapses whitespace
 * - Truncates to 60 chars with ellipsis
 * - Masks profanity
 * Returns empty string if input is empty.
 */
export function sanitizeTitle(raw: string): string {
  if (!raw) return '';
  // Strip control characters (keep printable unicode)
  let title = raw.replace(/[\x00-\x1f\x7f]/g, '');
  // Collapse whitespace
  title = title.replace(/\s+/g, ' ').trim();
  if (!title) return '';
  // Mask profanity before truncating
  title = maskProfanity(title);
  // Truncate to 60 chars
  if (title.length > 60) {
    title = title.slice(0, 59) + '…';
  }
  return title;
}

/**
 * Escapes HTML special chars — used only as a double safety net for
 * any path that might eventually reach innerHTML (should be none).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
