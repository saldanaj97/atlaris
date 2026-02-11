import { nanoid } from 'nanoid';

import type { ExtractedSection, ExtractedStructure } from './types';

const HEADER_MAX_LENGTH = 120;

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
  reasons: string[];
  limits: {
    maxTextChars: number;
    maxSections: number;
    maxSectionChars: number;
  };
}

const truncateToMaxChars = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value;
  }

  return value.slice(0, maxChars);
};

const payloadSizeBytes = (payload: ExtractionResponsePayload): number => {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
};

export function capExtractionResponsePayload(
  payload: ExtractionResponsePayload,
  config: ExtractionResponseCapConfig = DEFAULT_EXTRACTION_RESPONSE_CAPS
): {
  payload: ExtractionResponsePayload;
  truncation: ExtractionTruncationMetadata;
} {
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

  let returnedBytes = payloadSizeBytes(boundedPayload);

  if (returnedBytes > config.maxBytes && boundedPayload.text.length > 0) {
    const overflow = returnedBytes - config.maxBytes;
    boundedPayload = {
      ...boundedPayload,
      text: boundedPayload.text.slice(
        0,
        Math.max(0, boundedPayload.text.length - overflow)
      ),
    };
    reasons.push('byte_cap_text_trim');
    returnedBytes = payloadSizeBytes(boundedPayload);
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

  let guard = 0;
  while (returnedBytes > config.maxBytes && guard < 20) {
    guard += 1;

    if (boundedPayload.text.length > 0) {
      boundedPayload = {
        ...boundedPayload,
        text: boundedPayload.text.slice(
          0,
          Math.floor(boundedPayload.text.length / 2)
        ),
      };
      reasons.push('byte_cap_text_trim');
    } else if (boundedPayload.structure.sections.length > 1) {
      boundedPayload = {
        ...boundedPayload,
        structure: {
          ...boundedPayload.structure,
          sections: boundedPayload.structure.sections.slice(
            0,
            Math.ceil(boundedPayload.structure.sections.length / 2)
          ),
        },
      };
      reasons.push('byte_cap_section_trim');
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
      reasons.push('byte_cap_section_content_trim');
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
      reasons.push('byte_cap_topic_trim');
    } else {
      break;
    }

    returnedBytes = payloadSizeBytes(boundedPayload);
  }

  if (returnedBytes > config.maxBytes) {
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
    reasons.push('byte_cap_hard_reset');
    returnedBytes = payloadSizeBytes(boundedPayload);
  }

  const truncation: ExtractionTruncationMetadata = {
    truncated: reasons.length > 0,
    maxBytes: config.maxBytes,
    returnedBytes,
    reasons,
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
