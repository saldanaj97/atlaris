import {
  pdfPreviewEditSchema,
  type PdfPreviewEditInput,
} from '@/lib/validation/pdf';

export interface PdfContextSection {
  title: string;
  content: string;
  level: number;
  suggestedTopic?: string;
}

export interface PdfContext {
  mainTopic: string;
  sections: PdfContextSection[];
}

interface PdfContextCaps {
  maxSections: number;
  maxTotalChars: number;
  maxSectionContentChars: number;
}

const PDF_CONTEXT_INPUT_SCHEMA = pdfPreviewEditSchema.pick({
  mainTopic: true,
  sections: true,
});

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

type PdfContextInput = Pick<PdfPreviewEditInput, 'mainTopic' | 'sections'>;

/**
 * Counts total characters used by a PDF context (mainTopic + all section fields).
 * Must match the logic used in applyPdfContextCaps for cap enforcement.
 */
export function countPdfContextChars(
  context: Pick<PdfContext, 'mainTopic' | 'sections'>
): number {
  return (
    context.mainTopic.length +
    context.sections.reduce((total, section) => {
      return (
        total +
        section.title.length +
        section.content.length +
        (section.suggestedTopic?.length ?? 0)
      );
    }, 0)
  );
}

function applyPdfContextCaps(
  context: PdfContextInput,
  caps: PdfContextCaps
): PdfContext {
  const boundedSections: PdfContextSection[] = [];
  let remainingChars = Math.max(
    0,
    caps.maxTotalChars - context.mainTopic.length
  );

  for (const section of context.sections.slice(0, caps.maxSections)) {
    if (remainingChars <= 0) {
      break;
    }

    let title = section.title;
    if (title.length > remainingChars) {
      title = title.slice(0, remainingChars);
    }

    if (title.length === 0) {
      break;
    }

    remainingChars -= title.length;

    let suggestedTopic = section.suggestedTopic;
    if (suggestedTopic) {
      if (suggestedTopic.length > remainingChars) {
        suggestedTopic = suggestedTopic.slice(0, remainingChars);
      }

      if (suggestedTopic.length > 0) {
        remainingChars -= suggestedTopic.length;
      } else {
        suggestedTopic = undefined;
      }
    }

    const content = section.content
      .slice(0, caps.maxSectionContentChars)
      .slice(0, remainingChars);

    remainingChars -= content.length;

    boundedSections.push({
      title,
      content,
      level: section.level,
      ...(suggestedTopic ? { suggestedTopic } : {}),
    });
  }

  if (boundedSections.length === 0 && context.sections.length > 0) {
    const firstSection = context.sections[0];
    if (firstSection) {
      const mainTopicLen = context.mainTopic?.length ?? 0;
      const remainingBudget = Math.max(0, caps.maxTotalChars - mainTopicLen);
      const fallbackTitle = firstSection.title.slice(
        0,
        Math.max(1, Math.min(firstSection.title.length, remainingBudget))
      );

      let suggestedTopic = firstSection.suggestedTopic;
      if (suggestedTopic && suggestedTopic.length > remainingBudget) {
        suggestedTopic = suggestedTopic.slice(0, remainingBudget);
      }

      boundedSections.push({
        title: fallbackTitle,
        content: '',
        level: firstSection.level,
        ...(suggestedTopic ? { suggestedTopic } : {}),
      });
    }
  }

  const mainTopic = context.mainTopic.slice(0, caps.maxTotalChars);

  return {
    mainTopic,
    sections: boundedSections,
  };
}

export function sanitizePdfContextForPersistence(
  extractedContent: Pick<PdfPreviewEditInput, 'mainTopic' | 'sections'>
): PdfContext {
  const parsed = PDF_CONTEXT_INPUT_SCHEMA.parse(extractedContent);
  return applyPdfContextCaps(parsed, PERSISTED_PDF_CONTEXT_CAPS);
}

export function sanitizePdfContextForPrompt(
  pdfContext: PdfContext
): PdfContext {
  const parsed = PDF_CONTEXT_INPUT_SCHEMA.parse(pdfContext);
  return applyPdfContextCaps(parsed, PROMPT_PDF_CONTEXT_CAPS);
}

export function parsePersistedPdfContext(value: unknown): PdfContext | null {
  const parsed = PDF_CONTEXT_INPUT_SCHEMA.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return applyPdfContextCaps(parsed.data, PERSISTED_PDF_CONTEXT_CAPS);
}
