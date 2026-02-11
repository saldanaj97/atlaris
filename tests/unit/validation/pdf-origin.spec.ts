import { describe, expect, it } from 'vitest';

import { createLearningPlanSchema } from '@/lib/validation/learningPlans';
import {
  createBaseLearningPlanInput,
  createExtractedContent,
  createPdfProof,
} from '../../fixtures/validation';

describe('createLearningPlanSchema PDF origin', () => {
  it('requires extractedContent when origin is pdf', () => {
    const baseInput = createBaseLearningPlanInput({ origin: 'pdf' });
    const pdfProof = createPdfProof();
    const result = createLearningPlanSchema.safeParse({
      ...baseInput,
      ...pdfProof,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.extractedContent).toBeDefined();
    }
  });

  it('accepts extractedContent for pdf origin', () => {
    const baseInput = createBaseLearningPlanInput({ origin: 'pdf' });
    const pdfProof = createPdfProof();
    const extractedContent = createExtractedContent();
    const result = createLearningPlanSchema.safeParse({
      ...baseInput,
      ...pdfProof,
      extractedContent,
    });

    expect(result.success).toBe(true);
  });

  it('rejects extractedContent for non-pdf origin', () => {
    const baseInput = createBaseLearningPlanInput({ origin: 'ai' });
    const pdfProof = createPdfProof();
    const extractedContent = createExtractedContent();
    const result = createLearningPlanSchema.safeParse({
      ...baseInput,
      ...pdfProof,
      extractedContent,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const flatErrors = result.error.flatten();
      expect(flatErrors.fieldErrors.extractedContent).toEqual([
        'extractedContent is only allowed for PDF-based plans.',
      ]);
      expect(flatErrors.fieldErrors.pdfProofToken).toEqual([
        'pdfProofToken is only allowed for PDF-based plans.',
      ]);
      expect(flatErrors.fieldErrors.pdfExtractionHash).toEqual([
        'pdfExtractionHash is only allowed for PDF-based plans.',
      ]);
    }
  });

  it('requires extraction proof fields for pdf origin', () => {
    const baseInput = createBaseLearningPlanInput({ origin: 'pdf' });
    const extractedContent = createExtractedContent();
    const result = createLearningPlanSchema.safeParse({
      ...baseInput,
      extractedContent,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const flatErrors = result.error.flatten();
      expect(flatErrors.fieldErrors.pdfProofToken).toEqual([
        'pdfProofToken is required for PDF-based plans.',
      ]);
      expect(flatErrors.fieldErrors.pdfExtractionHash).toEqual([
        'pdfExtractionHash is required for PDF-based plans.',
      ]);
    }
  });
});
