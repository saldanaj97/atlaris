/**
 * Test factories for validation schemas (createLearningPlanSchema, etc.).
 * Generates unique values (nanoid, random hex) per call.
 */

import { randomBytes } from 'node:crypto';

import { nanoid } from 'nanoid';

import type { PdfPreviewEditInput } from '@/lib/validation/pdf';

type BaseLearningPlanInputOverrides = Partial<{
  topic: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  origin: 'ai' | 'manual' | 'template' | 'pdf';
}>;

/** Builds a valid base input for createLearningPlanSchema. Generates unique topic per call. */
export function createBaseLearningPlanInput(
  overrides: BaseLearningPlanInputOverrides = {}
): {
  topic: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  origin?: 'ai' | 'manual' | 'template' | 'pdf';
} {
  const topic = `Learn ${nanoid(12)}`;
  return {
    topic,
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'reading',
    ...overrides,
  };
}

const DEFAULT_PDF_PROOF_VERSION = 1 as const;

/** Builds pdfProofToken, pdfExtractionHash, and pdfProofVersion with unique values per call. */
export function createPdfProof(overrides?: {
  pdfProofToken?: string;
  pdfExtractionHash?: string;
  pdfProofVersion?: typeof DEFAULT_PDF_PROOF_VERSION;
}): {
  pdfProofToken: string;
  pdfExtractionHash: string;
  pdfProofVersion: typeof DEFAULT_PDF_PROOF_VERSION;
} {
  return {
    pdfProofToken: overrides?.pdfProofToken ?? nanoid(32),
    pdfExtractionHash:
      overrides?.pdfExtractionHash ?? randomBytes(32).toString('hex'),
    pdfProofVersion: overrides?.pdfProofVersion ?? DEFAULT_PDF_PROOF_VERSION,
  };
}

export { DEFAULT_PDF_PROOF_VERSION };

/** Builds extractedContent for pdf origin. Generates unique mainTopic per call. */
export function createExtractedContent(
  overrides: Partial<PdfPreviewEditInput> = {}
): PdfPreviewEditInput {
  const mainTopic = `Intro to ${nanoid(8)}`;
  return {
    mainTopic,
    sections: [
      {
        title: 'Basics',
        content: 'Types, interfaces, and functions.',
        level: 1,
      },
    ],
    ...overrides,
  };
}
