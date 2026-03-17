import type { PdfContextCaps } from './context.types';

/** Exported for tests; values used by sanitizePdfContextForPersistence / parsePersistedPdfContext */
export const PERSISTED_PDF_CONTEXT_CAPS: PdfContextCaps = {
  maxSections: 25,
  maxTotalChars: 20_000,
  maxSectionContentChars: 2_000,
};

/** Exported for tests; values used by sanitizePdfContextForPrompt */
export const PROMPT_PDF_CONTEXT_CAPS: PdfContextCaps = {
  maxSections: 12,
  maxTotalChars: 8_000,
  maxSectionContentChars: 1_200,
};

/** Section content character limit used when building prompts. Same as PROMPT_PDF_CONTEXT_CAPS.maxSectionContentChars. */
export const PDF_SECTION_CONTENT_LIMIT =
  PROMPT_PDF_CONTEXT_CAPS.maxSectionContentChars;
