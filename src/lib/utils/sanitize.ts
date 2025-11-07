/**
 * Sanitizes plain text input by removing HTML tags, comments, and normalizing content.
 * This function ensures that text stored in the database is safe for plain text rendering
 * and prevents XSS attacks if the content is later rendered as HTML without proper escaping.
 *
 * @param input - The input string to sanitize
 * @param maxLength - Maximum length of the output (default: 10000 characters)
 * @returns Sanitized plain text string
 */
export function sanitizePlainText(input: string, maxLength = 10_000): string {
  if (!input) {
    return '';
  }

  let sanitized = input;

  // Remove script and style blocks first (including their content), case-insensitive and non-greedy
  let prevSanitized;
  do {
    prevSanitized = sanitized;
    sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');
  } while (sanitized !== prevSanitized);
  do {
    prevSanitized = sanitized;
    sanitized = sanitized.replace(/<style[\s\S]*?<\/style>/gi, '');
  } while (sanitized !== prevSanitized);

  // Remove HTML comments (including multi-line) robustly (repeatedly until gone)
  do {
    prevSanitized = sanitized;
    sanitized = sanitized.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  } while (sanitized !== prevSanitized);

  // Remove HTML tags (including script, style, and other potentially dangerous tags)
  do {
    prevSanitized = sanitized;
    sanitized = sanitized.replace(/<[^>]*>/gi, '');
  } while (sanitized !== prevSanitized);

  // Decode common HTML entities to plain text equivalents
  // IMPORTANT: &amp; must be decoded LAST to prevent double-decoding vulnerabilities
  // (e.g., &amp;lt; -> &lt; -> < would reintroduce dangerous characters)
  sanitized = sanitized
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

  // Normalize line endings to \n
  sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Collapse excessive blank lines (more than 2 consecutive newlines -> 2)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace from start and end
  sanitized = sanitized.trim();

  // Enforce maximum length with safe truncation (at word boundary if possible)
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    // Try to truncate at a word boundary (last space before maxLength)
    const lastSpace = sanitized.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.9) {
      sanitized = sanitized.substring(0, lastSpace);
    }
    sanitized = sanitized.trim() + '...';
  }

  return sanitized;
}
