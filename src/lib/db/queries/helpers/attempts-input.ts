import { truncateToLength } from '@/lib/db/queries/helpers/truncation';
import type {
  AttemptMetadata,
  MetadataParams,
  SanitizedInput,
} from '@/lib/db/queries/types/attempts.types';
import {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from '@/shared/constants/learning-plans';
import type { GenerationInput } from '@/shared/types/ai-provider.types';

export function buildMetadata(params: MetadataParams): AttemptMetadata {
  const {
    sanitized,
    providerMetadata,
    modulesClamped,
    tasksClamped,
    startedAt,
    finishedAt,
    extendedTimeout,
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
  return {
    planId,
    userId,
    topic: sanitized.topic.value,
    notes: sanitized.notes.value ?? null,
    skillLevel: input.skillLevel,
    weeklyHours: input.weeklyHours,
    learningStyle: input.learningStyle,
  } satisfies Record<string, unknown>;
}
