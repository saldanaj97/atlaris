import { pdfPreviewEditSchema } from '@/features/pdf/validation/pdf';

import type { PdfPreviewEditInput } from '@/features/pdf/validation/pdf.types';
import type {
  PdfContext,
  PdfContextCaps,
  PdfContextSection,
} from './context.types';

import {
  PERSISTED_PDF_CONTEXT_CAPS,
  PROMPT_PDF_CONTEXT_CAPS,
} from './constants';

const PDF_CONTEXT_INPUT_SCHEMA = pdfPreviewEditSchema.pick({
  mainTopic: true,
  sections: true,
});

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
      let remainingBudget = Math.max(0, caps.maxTotalChars - mainTopicLen);
      const fallbackTitle = firstSection.title.slice(
        0,
        Math.max(1, Math.min(firstSection.title.length, remainingBudget))
      );
      remainingBudget = Math.max(0, remainingBudget - fallbackTitle.length);

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
