/**
 * Test fixture factories for security scanner buffers.
 * Centralizes magic byte sequences to avoid duplication across security tests.
 */

/** Returns a minimal valid PDF buffer (clean, no embedded scripts). */
export function createCleanPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.7\n%%EOF', 'utf8');
}

/** Returns a PDF buffer with embedded JavaScript, commonly flagged by heuristic scanners. */
export function createSuspiciousJsPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.7\n/JavaScript\n%%EOF', 'latin1');
}
