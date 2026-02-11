import { describe, expect, it } from 'vitest';

import {
  countPdfContextChars,
  parsePersistedPdfContext,
  PERSISTED_PDF_CONTEXT_CAPS,
  PROMPT_PDF_CONTEXT_CAPS,
  sanitizePdfContextForPersistence,
  sanitizePdfContextForPrompt,
} from '@/lib/pdf/context';

/** Input size to exceed persistence caps (maxSections=25, maxTotalChars=20k) */
const PERSISTENCE_OVERFLOW_SECTIONS = 40;
const PERSISTENCE_OVERFLOW_CONTENT_REPEAT = 5_000;

/** Input size to exceed prompt caps (maxSections=12, maxTotalChars=8k) */
const PROMPT_OVERFLOW_SECTIONS = 30;
const PROMPT_OVERFLOW_CONTENT_REPEAT = 3_000;

/** Sections count for "keeps first N" test (must exceed PROMPT_MAX_SECTIONS) */
const SECTIONS_ABOVE_PROMPT_LIMIT = 15;

/** Minimal content length for section order tests */
const SECTION_CONTENT_FOR_ORDER_TEST = 600;

describe('countPdfContextChars', () => {
  it('returns 0 for empty mainTopic and no sections', () => {
    expect(countPdfContextChars({ mainTopic: '', sections: [] })).toBe(0);
  });

  it('returns mainTopic length when sections is empty', () => {
    expect(countPdfContextChars({ mainTopic: 'abc', sections: [] })).toBe(3);
  });

  it('counts single section: title + content only', () => {
    expect(
      countPdfContextChars({
        mainTopic: 'x',
        sections: [{ title: 'T', content: 'CC', level: 1 }],
      })
    ).toBe(1 + 1 + 2);
  });

  it('counts single section with suggestedTopic', () => {
    expect(
      countPdfContextChars({
        mainTopic: 'ab',
        sections: [
          {
            title: 'T',
            content: 'C',
            level: 1,
            suggestedTopic: 'ST',
          },
        ],
      })
    ).toBe(2 + 1 + 1 + 2);
  });

  it('counts multiple sections correctly', () => {
    expect(
      countPdfContextChars({
        mainTopic: 'M',
        sections: [
          { title: 'A', content: 'B', level: 1 },
          { title: 'C', content: 'D', level: 2, suggestedTopic: 'E' },
        ],
      })
    ).toBe(1 + 1 + 1 + 1 + 1 + 1); // M + A + B + C + D + E
  });
});

describe('pdf context utilities', () => {
  it('bounds extracted context before persistence', () => {
    const context = sanitizePdfContextForPersistence({
      mainTopic: 'Large PDF context',
      sections: Array.from(
        { length: PERSISTENCE_OVERFLOW_SECTIONS },
        (_, index) => ({
          title: `Section ${index + 1}`,
          content: 'x'.repeat(PERSISTENCE_OVERFLOW_CONTENT_REPEAT),
          level: 1,
          suggestedTopic: `Topic ${index + 1}`,
        })
      ),
    });

    expect(context.sections.length).toBeLessThanOrEqual(
      PERSISTED_PDF_CONTEXT_CAPS.maxSections
    );
    expect(countPdfContextChars(context)).toBeLessThanOrEqual(
      PERSISTED_PDF_CONTEXT_CAPS.maxTotalChars
    );
    for (const section of context.sections) {
      expect(section.content.length).toBeLessThanOrEqual(
        PERSISTED_PDF_CONTEXT_CAPS.maxSectionContentChars
      );
    }
  });

  it('leaves exactly max sections and max chars unchanged', () => {
    const { maxSections: maxS, maxTotalChars: maxT } =
      PERSISTED_PDF_CONTEXT_CAPS;
    const mainTopic = 'Abc';
    const titleLen = 3; // "S00".."S24" - fixed length
    const fixedChars = mainTopic.length + maxS * titleLen;
    const contentBudget = maxT - fixedChars;
    const baseContent = Math.floor(contentBudget / maxS);
    const remainder = contentBudget % maxS;
    const input = {
      mainTopic,
      sections: Array.from({ length: maxS }, (_, i) => ({
        title: `S${String(i).padStart(2, '0')}`,
        content: 'x'.repeat(baseContent + (i < remainder ? 1 : 0)),
        level: 1,
        suggestedTopic: undefined,
      })),
    };
    expect(countPdfContextChars(input)).toBe(maxT);

    const result = sanitizePdfContextForPersistence(input);

    expect(result.sections.length).toBe(maxS);
    expect(countPdfContextChars(result)).toBe(maxT);
  });

  it('trims to ≤max sections and ≤max chars when given 1 extra section', () => {
    const { maxSections, maxTotalChars } = PERSISTED_PDF_CONTEXT_CAPS;
    const sectionsOverLimit = maxSections + 1;
    const contentPerSection = 800;
    const input = {
      mainTopic: 'Topic',
      sections: Array.from({ length: sectionsOverLimit }, (_, i) => ({
        title: `Section ${i + 1}`,
        content: 'x'.repeat(contentPerSection),
        level: 1,
        suggestedTopic: undefined,
      })),
    };

    const result = sanitizePdfContextForPersistence(input);

    expect(result.sections.length).toBeLessThanOrEqual(maxSections);
    expect(countPdfContextChars(result)).toBeLessThanOrEqual(maxTotalChars);
  });

  it('truncates section content with multi-byte unicode and preserves valid UTF-8', () => {
    const { maxSectionContentChars } = PERSISTED_PDF_CONTEXT_CAPS;
    const emoji = '😀';
    // ASCII prefix + emojis so truncation at maxSectionContentChars lands on char boundary
    const contentOverLimit =
      'a'.repeat(maxSectionContentChars - emoji.length) + emoji + emoji;
    expect(contentOverLimit.length).toBeGreaterThan(maxSectionContentChars);

    const result = sanitizePdfContextForPersistence({
      mainTopic: 'Unicode test',
      sections: [
        {
          title: 'Section',
          content: contentOverLimit,
          level: 1,
          suggestedTopic: undefined,
        },
      ],
    });

    const section = result.sections[0];
    expect(section).toBeDefined();
    if (!section) {
      throw new Error('Expected section to be present after sanitization');
    }

    expect(section.content.length).toBeLessThan(contentOverLimit.length);
    expect(section.content.length).toBeLessThanOrEqual(maxSectionContentChars);

    const roundTripped = new TextDecoder().decode(
      new TextEncoder().encode(section.content)
    );
    expect(roundTripped).toBe(section.content);
  });

  describe('parsePersistedPdfContext', () => {
    it('returns null when input is null', () => {
      expect(parsePersistedPdfContext(null)).toBeNull();
    });

    it('returns null when input is undefined', () => {
      expect(parsePersistedPdfContext(undefined)).toBeNull();
    });

    it('returns null when object lacks mainTopic', () => {
      expect(
        parsePersistedPdfContext({
          sections: [{ title: 'T', content: 'C', level: 1 }],
        })
      ).toBeNull();
    });

    it('returns null when object has empty sections array', () => {
      expect(
        parsePersistedPdfContext({
          mainTopic: 'Valid topic',
          sections: [],
        })
      ).toBeNull();
    });

    it('returns null when sections have missing required fields', () => {
      expect(
        parsePersistedPdfContext({
          mainTopic: 'Invalid context',
          sections: [{ title: 'Missing required fields' }],
        })
      ).toBeNull();
    });

    it('returns parsed object for well-formed persisted context', () => {
      const input = {
        mainTopic: 'Machine Learning Fundamentals',
        sections: [
          { title: 'Introduction', content: 'Overview of ML.', level: 1 },
          {
            title: 'Neural Networks',
            content: 'Deep dive.',
            level: 2,
            suggestedTopic: 'Advanced NN',
          },
        ],
      };

      const parsed = parsePersistedPdfContext(input);

      expect(parsed).not.toBeNull();
      expect(parsed).toMatchObject({
        mainTopic: 'Machine Learning Fundamentals',
        sections: expect.arrayContaining([
          expect.objectContaining({
            title: 'Introduction',
            content: 'Overview of ML.',
            level: 1,
          }),
          expect.objectContaining({
            title: 'Neural Networks',
            content: 'Deep dive.',
            level: 2,
            suggestedTopic: 'Advanced NN',
          }),
        ]),
      });
      expect(parsed?.sections).toHaveLength(2);
    });
  });

  it('bounds PDF context when formatting for prompts', () => {
    const context = sanitizePdfContextForPrompt({
      mainTopic: 'Prompt context',
      sections: Array.from(
        { length: PROMPT_OVERFLOW_SECTIONS },
        (_, index) => ({
          title: `Section ${index + 1}`,
          content: 'a'.repeat(PROMPT_OVERFLOW_CONTENT_REPEAT),
          level: 2,
        })
      ),
    });

    expect(context.sections.length).toBeLessThanOrEqual(
      PROMPT_PDF_CONTEXT_CAPS.maxSections
    );
    expect(countPdfContextChars(context)).toBeLessThanOrEqual(
      PROMPT_PDF_CONTEXT_CAPS.maxTotalChars
    );
    for (const section of context.sections) {
      expect(section.content.length).toBeLessThanOrEqual(
        PROMPT_PDF_CONTEXT_CAPS.maxSectionContentChars
      );
    }
  });

  describe('sanitizePdfContextForPrompt', () => {
    it('keeps first 12 sections by input order when given >12 sections', () => {
      const sections = Array.from(
        { length: SECTIONS_ABOVE_PROMPT_LIMIT },
        (_, i) => ({
          title: `Section-${String(i + 1).padStart(2, '0')}`,
          content: 'x'.repeat(SECTION_CONTENT_FOR_ORDER_TEST),
          level: 1,
        })
      );
      const result = sanitizePdfContextForPrompt({
        mainTopic: 'Topic',
        sections,
      });

      expect(result.sections).toHaveLength(PROMPT_PDF_CONTEXT_CAPS.maxSections);
      result.sections.forEach((s, idx) => {
        expect(s.title).toBe(`Section-${String(idx + 1).padStart(2, '0')}`);
      });
    });

    it('leaves section content unchanged when exactly 1200 chars', () => {
      const content1200 = 'a'.repeat(
        PROMPT_PDF_CONTEXT_CAPS.maxSectionContentChars
      );
      const result = sanitizePdfContextForPrompt({
        mainTopic: 'Topic',
        sections: [{ title: 'T', content: content1200, level: 1 }],
      });

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0]?.content).toHaveLength(1_200);
      expect(result.sections[0]?.content).toBe(content1200);
    });

    it('truncates section content to 1200 when 1201 chars', () => {
      const content1201 = 'b'.repeat(
        PROMPT_PDF_CONTEXT_CAPS.maxSectionContentChars + 1
      );
      const result = sanitizePdfContextForPrompt({
        mainTopic: 'Topic',
        sections: [{ title: 'T', content: content1201, level: 1 }],
      });

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0]?.content).toHaveLength(1_200);
      expect(result.sections[0]?.content).toBe(content1201.slice(0, 1_200));
    });

    it('does not truncate when total chars equal exactly 8000', () => {
      const { maxTotalChars, maxSectionContentChars } = PROMPT_PDF_CONTEXT_CAPS;
      const mainTopic = 'x'.repeat(200);
      const title = 't'.repeat(100);
      const sections = Array.from({ length: 6 }, () => ({
        title,
        content: 'c'.repeat(maxSectionContentChars),
        level: 1,
      }));
      const input = { mainTopic, sections };
      expect(countPdfContextChars(input)).toBe(maxTotalChars);

      const result = sanitizePdfContextForPrompt(input);
      expect(countPdfContextChars(result)).toBe(maxTotalChars);
      expect(result.sections).toHaveLength(6);
      result.sections.forEach((s) => {
        expect(s.content).toHaveLength(maxSectionContentChars);
      });
    });

    it('trims to 8000 when total chars equal 8001', () => {
      const { maxTotalChars, maxSectionContentChars } = PROMPT_PDF_CONTEXT_CAPS;
      const mainTopic = 'x'.repeat(200);
      const title = 't'.repeat(100);
      const sections = [
        ...Array.from({ length: 5 }, () => ({
          title,
          content: 'c'.repeat(maxSectionContentChars),
          level: 1,
        })),
        { title, content: 'c'.repeat(maxSectionContentChars + 1), level: 1 },
      ];
      const input = { mainTopic, sections };
      expect(countPdfContextChars(input)).toBe(maxTotalChars + 1);

      const result = sanitizePdfContextForPrompt(input);
      expect(countPdfContextChars(result)).toBeLessThanOrEqual(maxTotalChars);
      expect(result.sections[0]?.content).toHaveLength(maxSectionContentChars);
    });
  });
});
