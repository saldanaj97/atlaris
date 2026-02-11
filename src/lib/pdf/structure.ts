import { nanoid } from 'nanoid';

import { logger } from '@/lib/logging/logger';
import type { ExtractedSection, ExtractedStructure } from '@/lib/pdf/types';

const HEADER_MAX_LENGTH = 120;
const UTF8_ENCODER = new TextEncoder();

/** Max iterations for the byte-cap trim loop to avoid runaway trimming. */
const MAX_TRIM_ITERATIONS = 20;

export interface ExtractionResponseCapConfig {
  maxBytes: number;
  maxTextChars: number;
  maxSections: number;
  maxSectionChars: number;
  maxSectionTitleChars: number;
  maxSuggestedTopicChars: number;
}

export const DEFAULT_EXTRACTION_RESPONSE_CAPS: ExtractionResponseCapConfig = {
  maxBytes: 120_000,
  maxTextChars: 40_000,
  maxSections: 20,
  maxSectionChars: 1_200,
  maxSectionTitleChars: 200,
  maxSuggestedTopicChars: 200,
};

export interface ExtractionResponsePayload {
  text: string;
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
  };
  structure: ExtractedStructure;
}

export interface ExtractionTruncationMetadata {
  truncated: boolean;
  maxBytes: number;
  returnedBytes: number;
  hardResetApplied: boolean;
  hardResetBytesBeforeReset?: number;
  reasons: string[];
  limits: {
    maxTextChars: number;
    maxSections: number;
    maxSectionChars: number;
  };
}

export interface CapExtractionResponse {
  payload: ExtractionResponsePayload;
  truncation: ExtractionTruncationMetadata;
}

const truncateToMaxChars = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value;
  }

  return value.slice(0, maxChars);
};

const payloadSizeBytes = (payload: ExtractionResponsePayload): number => {
  return UTF8_ENCODER.encode(JSON.stringify(payload)).length;
};

/**
 * UTF-8 byte length of the JSON-encoded string value (matches how "text" is
 * serialized inside payloadSizeBytes / JSON.stringify(payload)).
 */
const utf8JsonStringValueBytes = (text: string): number => {
  return UTF8_ENCODER.encode(JSON.stringify(text)).length;
};

/**
 * Trims payload.text so that the full payload fits in maxBytes. Uses
 * payloadSizeBytes once for base overhead; loop uses utf8JsonStringValueBytes
 * instead of re-serializing the whole payload each iteration.
 */
const trimTextToFitByteCap = (
  payload: ExtractionResponsePayload,
  maxBytes: number
): string => {
  const originalText = payload.text;
  const basePayload: ExtractionResponsePayload = { ...payload, text: '' };
  const baseBytes = payloadSizeBytes(basePayload);
  const emptyTextBytes = utf8JsonStringValueBytes('');
  let low = 0;
  let high = originalText.length;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidateText = originalText.slice(0, mid);
    const candidateTextBytes = utf8JsonStringValueBytes(candidateText);
    const totalBytes = baseBytes - emptyTextBytes + candidateTextBytes;

    if (totalBytes <= maxBytes) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return originalText.slice(0, best);
};

export function capExtractionResponsePayload(
  payload: ExtractionResponsePayload,
  config: ExtractionResponseCapConfig = DEFAULT_EXTRACTION_RESPONSE_CAPS
): CapExtractionResponse {
  const reasons: string[] = [];

  let boundedPayload: ExtractionResponsePayload = {
    text: truncateToMaxChars(payload.text, config.maxTextChars),
    pageCount: payload.pageCount,
    metadata: {
      title: payload.metadata.title,
      author: payload.metadata.author,
      subject: payload.metadata.subject,
    },
    structure: {
      suggestedMainTopic: truncateToMaxChars(
        payload.structure.suggestedMainTopic,
        config.maxSuggestedTopicChars
      ),
      confidence: payload.structure.confidence,
      sections: payload.structure.sections
        .slice(0, config.maxSections)
        .map((s) => ({
          title: truncateToMaxChars(s.title, config.maxSectionTitleChars),
          content: truncateToMaxChars(s.content, config.maxSectionChars),
          level: Math.min(Math.max(s.level, 1), 5),
          suggestedTopic: s.suggestedTopic
            ? truncateToMaxChars(
                s.suggestedTopic,
                config.maxSuggestedTopicChars
              )
            : undefined,
        })),
    },
  };

  if (boundedPayload.text.length !== payload.text.length) {
    reasons.push('text_char_cap');
  }
  if (
    boundedPayload.structure.sections.length !==
    payload.structure.sections.length
  ) {
    reasons.push('section_count_cap');
  }
  if (
    boundedPayload.structure.suggestedMainTopic.length !==
    payload.structure.suggestedMainTopic.length
  ) {
    reasons.push('suggested_topic_cap');
  }
  const anySectionTitleTruncated = payload.structure.sections.some((s, i) => {
    const boundedSection = boundedPayload.structure.sections[i];
    if (!boundedSection) {
      return false;
    }

    return boundedSection.title.length < s.title.length;
  });
  if (anySectionTitleTruncated) {
    reasons.push('section_title_cap');
  }

  const sectionContentTruncated = boundedPayload.structure.sections.some(
    (bounded, i) => {
      const original = payload.structure.sections[i];
      return (
        original !== undefined &&
        original.content.length > bounded.content.length
      );
    }
  );
  if (sectionContentTruncated) {
    reasons.push('section_content_cap');
  }

  let returnedBytes = payloadSizeBytes(boundedPayload);
  let hardResetBytesBeforeReset: number | undefined;

  if (returnedBytes > config.maxBytes && boundedPayload.text.length > 0) {
    const byteBoundedText = trimTextToFitByteCap(
      boundedPayload,
      config.maxBytes
    );
    if (byteBoundedText.length !== boundedPayload.text.length) {
      boundedPayload = {
        ...boundedPayload,
        text: byteBoundedText,
      };
      reasons.push('byte_cap_text_trim');
      returnedBytes = payloadSizeBytes(boundedPayload);
    }
  }

  if (
    returnedBytes > config.maxBytes &&
    boundedPayload.structure.sections.length > 1
  ) {
    boundedPayload = {
      ...boundedPayload,
      structure: {
        ...boundedPayload.structure,
        sections: boundedPayload.structure.sections.slice(
          0,
          Math.max(1, Math.floor(boundedPayload.structure.sections.length / 2))
        ),
      },
    };
    reasons.push('byte_cap_section_trim');
    returnedBytes = payloadSizeBytes(boundedPayload);
  }

  const trimReasonCounts = new Map<string, number>();
  let guard = 0;
  while (returnedBytes > config.maxBytes && guard < MAX_TRIM_ITERATIONS) {
    guard += 1;

    if (boundedPayload.text.length > 0) {
      boundedPayload = {
        ...boundedPayload,
        text: boundedPayload.text.slice(
          0,
          Math.floor(boundedPayload.text.length / 2)
        ),
      };
      trimReasonCounts.set(
        'byte_cap_text_trim',
        (trimReasonCounts.get('byte_cap_text_trim') ?? 0) + 1
      );
    } else if (boundedPayload.structure.sections.length > 1) {
      boundedPayload = {
        ...boundedPayload,
        structure: {
          ...boundedPayload.structure,
          sections: boundedPayload.structure.sections.slice(
            0,
            Math.max(
              1,
              Math.floor(boundedPayload.structure.sections.length / 2)
            )
          ),
        },
      };
      trimReasonCounts.set(
        'byte_cap_section_trim',
        (trimReasonCounts.get('byte_cap_section_trim') ?? 0) + 1
      );
    } else if (
      (boundedPayload.structure.sections[0]?.content.length ?? 0) > 0
    ) {
      const firstSection = boundedPayload.structure.sections[0];
      if (!firstSection) {
        break;
      }

      boundedPayload = {
        ...boundedPayload,
        structure: {
          ...boundedPayload.structure,
          sections: [
            {
              ...firstSection,
              content: firstSection.content.slice(
                0,
                Math.floor(firstSection.content.length / 2)
              ),
            },
          ],
        },
      };
      trimReasonCounts.set(
        'byte_cap_section_content_trim',
        (trimReasonCounts.get('byte_cap_section_content_trim') ?? 0) + 1
      );
    } else if (boundedPayload.structure.suggestedMainTopic.length > 0) {
      boundedPayload = {
        ...boundedPayload,
        structure: {
          ...boundedPayload.structure,
          suggestedMainTopic: boundedPayload.structure.suggestedMainTopic.slice(
            0,
            Math.floor(boundedPayload.structure.suggestedMainTopic.length / 2)
          ),
        },
      };
      trimReasonCounts.set(
        'byte_cap_topic_trim',
        (trimReasonCounts.get('byte_cap_topic_trim') ?? 0) + 1
      );
    } else {
      break;
    }

    returnedBytes = payloadSizeBytes(boundedPayload);
  }

  for (const [reason] of trimReasonCounts) {
    reasons.push(reason);
  }

  if (returnedBytes > config.maxBytes) {
    hardResetBytesBeforeReset = returnedBytes;
    reasons.push('byte_cap_hard_reset');
    boundedPayload = {
      ...boundedPayload,
      text: '',
      metadata: {},
      structure: {
        ...boundedPayload.structure,
        sections: [],
        suggestedMainTopic: '',
      },
    };
    returnedBytes = payloadSizeBytes(boundedPayload);
    logger.warn(
      {
        hardResetBytesBeforeReset,
        maxBytes: config.maxBytes,
      },
      'byte_cap_hard_reset: payload exceeded maxBytes after trim, zeroed structure/text/metadata'
    );
  }

  const dedupedReasons = Array.from(new Set(reasons));

  const truncation: ExtractionTruncationMetadata = {
    truncated: dedupedReasons.length > 0,
    maxBytes: config.maxBytes,
    returnedBytes,
    hardResetApplied: hardResetBytesBeforeReset !== undefined,
    hardResetBytesBeforeReset,
    reasons: dedupedReasons,
    limits: {
      maxTextChars: config.maxTextChars,
      maxSections: config.maxSections,
      maxSectionChars: config.maxSectionChars,
    },
  };

  return {
    payload: boundedPayload,
    truncation,
  };
}

const HEADER_PATTERNS = [
  /^[A-Z0-9][A-Z0-9\s\-:]+$/,
  /^\d+(?:\.\d+)*[.)]\s+.+$/,
  /^[IVXLC]+\.[\s]+.+$/,
];

const isHeaderLine = (line: string): boolean => {
  if (line.length < 3 || line.length > HEADER_MAX_LENGTH) {
    return false;
  }

  return HEADER_PATTERNS.some((pattern) => pattern.test(line));
};

const getHeaderLevel = (line: string): number => {
  const numericMatch = line.match(/^(\d+(?:\.\d+)*)[.)]/);
  if (!numericMatch) {
    return 1;
  }

  const segments = numericMatch[1].split('.');
  return Math.min(Math.max(segments.length, 1), 5);
};

const normalizeHeader = (line: string): string =>
  line
    .replace(/^\d+(?:\.\d+)*[.)]\s+/, '')
    .replace(/^[IVXLC]+\.[\s]+/, '')
    .trim();

export const detectStructure = (text: string): ExtractedStructure => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sections: ExtractedSection[] = [];
  let currentSection: ExtractedSection | null = null;

  for (const line of lines) {
    if (isHeaderLine(line)) {
      if (currentSection) {
        sections.push({
          ...currentSection,
          id: nanoid(),
          content: currentSection.content.trim(),
        });
      }

      const normalized = normalizeHeader(line);
      currentSection = {
        title: line,
        content: '',
        level: getHeaderLevel(line),
        suggestedTopic: normalized !== line ? normalized : undefined,
      };
      continue;
    }

    if (!currentSection) {
      currentSection = {
        title: line,
        content: '',
        level: 1,
      };
      continue;
    }

    currentSection.content = currentSection.content
      ? `${currentSection.content}\n${line}`
      : line;
  }

  if (currentSection) {
    sections.push({
      ...currentSection,
      id: nanoid(),
      content: currentSection.content.trim(),
    });
  }

  const suggestedMainTopic =
    sections[0]?.suggestedTopic || sections[0]?.title || '';
  const confidence =
    sections.length >= 3 ? 'high' : sections.length > 0 ? 'medium' : 'low';

  return {
    sections,
    suggestedMainTopic,
    confidence,
  };
};
