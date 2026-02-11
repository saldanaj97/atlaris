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

/** Builds pdfProofToken and pdfExtractionHash with unique values per call. */
export function createPdfProof(overrides?: {
  pdfProofToken?: string;
  pdfExtractionHash?: string;
}): { pdfProofToken: string; pdfExtractionHash: string } {
  return {
    pdfProofToken: overrides?.pdfProofToken ?? nanoid(32),
    pdfExtractionHash:
      overrides?.pdfExtractionHash ?? randomBytes(32).toString('hex'),
  };
}

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
