import { nanoid } from 'nanoid';

import type { ExtractedSection, ExtractedStructure } from './types';

const HEADER_MAX_LENGTH = 120;

const HEADER_PATTERNS = [
  /^[A-Z0-9][A-Z0-9\s\-:]+$/,
  /^\d+(?:\.\d+)*[.)]\s+.+$/,
  /^[IVXLC]+\.[\s]+.+$/,
];

const isHeaderLine = (line: string): boolean => {
  if (line.length === 0 || line.length > HEADER_MAX_LENGTH) {
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
