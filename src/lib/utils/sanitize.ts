import sanitizeHtml from 'sanitize-html';

/**
 * Sanitizes plain text input by removing ALL HTML tags, comments, and normalizing content.
 * Uses the robust `sanitize-html` library to handle edge cases that naive regex misses
 * (malformed closing tags like `</script >`, mixed case tags, unusual comment terminators).
 *
 * WARNING: This function decodes HTML entities (e.g., &lt; → <, &amp; → &).
 * The output is NOT safe for direct HTML rendering - use proper escaping if needed.
 *
 * @param input - The input string to sanitize
 * @param maxLength - Maximum length of the output (default: 10000 characters)
 * @returns Sanitized plain text string with no HTML tags or script/style content
 */
export function sanitizePlainText(input: string, maxLength = 10_000): string {
  if (!input) {
    return '';
  }

  let sanitized = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });

  // SECURITY: decode &amp; LAST to prevent double-decoding (e.g., &amp;lt; -> &lt; -> <)
  sanitized = sanitized
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/&amp;/g, '&');

  sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  sanitized = sanitized.trim();

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    const lastSpace = sanitized.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.9) {
      sanitized = sanitized.substring(0, lastSpace);
    }
    sanitized = sanitized.trim() + '...';
  }

  return sanitized;
}
