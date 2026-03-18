import { hashSha256 } from '@/lib/crypto/hash';
import { truncateToLength } from '@/lib/db/queries/helpers/truncation';
import type {
  AttemptMetadata,
  MetadataParams,
  PdfProvenanceData,
  SanitizedInput,
} from '@/lib/db/queries/types/attempts.types';
import {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from '@/shared/constants/learning-plans';
import type { GenerationInput } from '@/shared/types/ai-provider.types';

export function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).toSorted();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

function getPdfContextDigest(input: GenerationInput): string | null {
  if (!input.pdfContext) {
    return null;
  }

  return hashSha256(stableSerialize(input.pdfContext));
}

function hasPdfProvenanceInput(
  input: GenerationInput
): input is GenerationInput & {
  pdfContext: NonNullable<GenerationInput['pdfContext']>;
  pdfExtractionHash: string;
  pdfProofVersion?: 1;
} {
  return (
    input.pdfContext !== undefined &&
    input.pdfContext !== null &&
    typeof input.pdfExtractionHash === 'string' &&
    input.pdfExtractionHash !== ''
  );
}

export function getPdfProvenance(
  input: GenerationInput
): PdfProvenanceData | null {
  if (!hasPdfProvenanceInput(input)) {
    return null;
  }

  const contextDigest = getPdfContextDigest(input);
  if (!contextDigest) {
    return null;
  }

  return {
    extractionHash: input.pdfExtractionHash,
    proofVersion: input.pdfProofVersion ?? 1,
    contextDigest,
  };
}

export function buildMetadata(params: MetadataParams): AttemptMetadata {
  const {
    sanitized,
    providerMetadata,
    modulesClamped,
    tasksClamped,
    startedAt,
    finishedAt,
    extendedTimeout,
    pdfProvenance,
    failure,
  } = params;

  return {
    input: {
      topic: {
        truncated: sanitized.topic.truncated,
        original_length: sanitized.topic.originalLength,
      },
      notes:
        sanitized.notes.originalLength !== undefined
          ? {
              truncated: sanitized.notes.truncated,
              original_length: sanitized.notes.originalLength,
            }
          : null,
    },
    normalization: {
      modules_clamped: modulesClamped,
      tasks_clamped: tasksClamped,
    },
    timing: {
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(
        0,
        Math.round(finishedAt.getTime() - startedAt.getTime())
      ),
      extended_timeout: extendedTimeout,
    },
    pdf: pdfProvenance
      ? {
          extraction_hash: pdfProvenance.extractionHash,
          proof_version: pdfProvenance.proofVersion,
          context_digest: pdfProvenance.contextDigest,
        }
      : null,
    provider: providerMetadata ?? null,
    failure: failure ?? null,
  };
}

export function sanitizeInput(input: GenerationInput): SanitizedInput {
  const topicResult = truncateToLength(input.topic, TOPIC_MAX_LENGTH);
  if (topicResult.value === undefined) {
    throw new Error('Topic is required for generation attempts.');
  }

  const topicValue = topicResult.value;

  if (typeof topicValue !== 'string' || topicValue.trim().length === 0) {
    throw new Error('GenerationInput.topic must be a non-empty string.');
  }

  const notesResult = truncateToLength(
    input.notes ?? undefined,
    NOTES_MAX_LENGTH
  );

  return {
    topic: {
      value: topicValue,
      truncated: topicResult.truncated,
      originalLength: topicResult.originalLength ?? topicValue.length,
    },
    notes: {
      value: notesResult.value,
      truncated: notesResult.truncated,
      originalLength: notesResult.originalLength,
    },
  };
}

export function toPromptHashPayload(
  planId: string,
  userId: string,
  input: GenerationInput,
  sanitized: SanitizedInput
): Record<string, unknown> {
  const pdfContextDigest = getPdfContextDigest(input);

  return {
    planId,
    userId,
    topic: sanitized.topic.value,
    notes: sanitized.notes.value ?? null,
    skillLevel: input.skillLevel,
    weeklyHours: input.weeklyHours,
    learningStyle: input.learningStyle,
    pdfExtractionHash: input.pdfExtractionHash ?? null,
    pdfProofVersion: input.pdfProofVersion ?? null,
    pdfContextDigest,
  } satisfies Record<string, unknown>;
}
