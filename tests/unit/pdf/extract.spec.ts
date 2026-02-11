import { describe, expect, it } from 'vitest';

import {
  extractTextFromPdf,
  getPdfPageCountFromBuffer,
} from '@/lib/pdf/extract';
import {
  capExtractionResponsePayload,
  detectStructure,
  type CapExtractionResponse,
} from '@/lib/pdf/structure';
import { validatePdfFile } from '@/lib/pdf/validate';

const KB = 1024;
const MB = KB * 1024;

const buildPdfBuffer = (text: string) => {
  const header = '%PDF-1.4\n';
  const streamContent = [
    'BT\n',
    '/F1 24 Tf\n',
    '72 120 Td\n',
    `(${text}) Tj\n`,
    'ET\n',
  ].join('');
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = header;
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  const xrefLines = offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `)
    .join('\n');

  pdf += `xref\n0 6\n0000000000 65535 f \n${xrefLines}\n`;
  pdf += `trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
};

describe('getPdfPageCountFromBuffer', () => {
  it('returns page count from PDF metadata for a valid PDF', async () => {
    const buffer = buildPdfBuffer('Hello PDF');
    const count = await getPdfPageCountFromBuffer(buffer);
    expect(count).toBe(1);
  });

  it('falls back to size-based estimate when metadata fetch fails', async () => {
    const buffer = Buffer.from('not a valid PDF', 'utf8');
    const count = await getPdfPageCountFromBuffer(buffer);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe('pdf extraction', () => {
  it('extracts text from a valid PDF', async () => {
    const buffer = buildPdfBuffer('Hello PDF');
    const result = await extractTextFromPdf(buffer);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.text).toContain('Hello PDF');
      expect(result.pageCount).toBe(1);
    }
  });

  it('returns invalid_file for non-PDF input', async () => {
    const result = await extractTextFromPdf(Buffer.from('not a pdf'));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_file');
    }
  });

  // SMOKE TEST: This is a string-match detection test only, not a real encryption check.
  // Real encrypted PDFs require a fixture or parser mock for proper validation.
  it('returns password_protected for encrypted PDFs', async () => {
    const buffer = Buffer.from('%PDF-1.7\n/Encrypt', 'utf8');
    const result = await extractTextFromPdf(buffer);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('password_protected');
    }
  });
});

describe('pdf structure detection', () => {
  it('identifies sections and headers', () => {
    const text = [
      'INTRODUCTION',
      'This is the intro.',
      '',
      '1. Getting Started',
      'Step by step guidance.',
      '',
      '2. Next Steps',
      'More content here.',
    ].join('\n');

    const structure = detectStructure(text);

    expect(structure.sections).toHaveLength(3);
    expect(structure.sections[0].title).toBe('INTRODUCTION');
    expect(structure.sections[1].title).toContain('Getting Started');
    expect(structure.sections[2].title).toContain('Next Steps');
    expect(structure.confidence).toBe('high');
  });
});

describe('pdf extraction response caps', () => {
  const basePayload = {
    text: 'Hello PDF',
    pageCount: 1,
    metadata: { title: 'Sample' },
    structure: {
      suggestedMainTopic: 'Sample',
      confidence: 'medium' as const,
      sections: [{ title: 'Section 1', content: 'Body', level: 1 }],
    },
  };

  it('keeps payload intact when under configured limits', () => {
    const result: CapExtractionResponse = capExtractionResponsePayload(
      basePayload,
      {
        maxBytes: 10_000,
        maxTextChars: 1_000,
        maxSections: 10,
        maxSectionChars: 500,
        maxSectionTitleChars: 100,
        maxSuggestedTopicChars: 100,
      }
    );

    expect(result.truncation.truncated).toBe(false);
    expect(result.truncation.reasons).toHaveLength(0);
    expect(result.payload.text).toBe(basePayload.text);
    expect(result.payload.structure.sections).toHaveLength(1);
    expect(result.truncation.returnedBytes).toBeLessThanOrEqual(10_000);
  });

  it('caps text and section counts at configured limits', () => {
    const sectionTitleCap = 50;
    const suggestedTopicCap = 50;
    const oversizedTitle =
      'Section with a very long title that exceeds the cap';
    const oversizedTopic =
      'An oversized suggested main topic string for testing';
    expect(oversizedTitle.length).toBeGreaterThan(sectionTitleCap);
    expect(oversizedTopic.length).toBeGreaterThan(suggestedTopicCap);

    const result: CapExtractionResponse = capExtractionResponsePayload(
      {
        ...basePayload,
        text: 'x'.repeat(500),
        structure: {
          ...basePayload.structure,
          suggestedMainTopic: oversizedTopic,
          sections: Array.from({ length: 5 }, (_, i) => ({
            title: i === 0 ? oversizedTitle : `Section ${i + 1}`,
            content: 'y'.repeat(300),
            level: 1,
          })),
        },
      },
      {
        maxBytes: 100_000,
        maxTextChars: 100,
        maxSections: 2,
        maxSectionChars: 50,
        maxSectionTitleChars: sectionTitleCap,
        maxSuggestedTopicChars: suggestedTopicCap,
      }
    );

    expect(result.truncation.truncated).toBe(true);
    expect(result.truncation.reasons).toEqual(
      expect.arrayContaining([
        'text_char_cap',
        'section_count_cap',
        'section_content_cap',
        'section_title_cap',
        'suggested_topic_cap',
      ])
    );
    expect(result.payload.text.length).toBeLessThanOrEqual(100);
    expect(result.payload.structure.sections).toHaveLength(2);
    expect(
      result.payload.structure.suggestedMainTopic.length
    ).toBeLessThanOrEqual(suggestedTopicCap);
    for (const section of result.payload.structure.sections) {
      expect(section.title.length).toBeLessThanOrEqual(sectionTitleCap);
    }
    expect(
      result.payload.structure.sections[0]?.content.length
    ).toBeLessThanOrEqual(50);
    expect(
      result.payload.structure.sections[1]?.content.length
    ).toBeLessThanOrEqual(50);
  });

  it('enforces byte cap metadata for oversized payloads', () => {
    const titleCap = 200;
    const topicCap = 200;
    const oversizedTitle = 'x'.repeat(250);
    const oversizedTopic = 'y'.repeat(250);

    const result: CapExtractionResponse = capExtractionResponsePayload(
      {
        ...basePayload,
        text: 'a'.repeat(2_000),
        structure: {
          ...basePayload.structure,
          suggestedMainTopic: oversizedTopic,
          sections: Array.from({ length: 20 }, (_, i) => ({
            title: i === 0 ? oversizedTitle : `Section ${i + 1}`,
            content: 'b'.repeat(500),
            level: 1,
          })),
        },
      },
      {
        maxBytes: 800,
        maxTextChars: 2_000,
        maxSections: 20,
        maxSectionChars: 500,
        maxSectionTitleChars: titleCap,
        maxSuggestedTopicChars: topicCap,
      }
    );

    const allowedReasons = [
      'byte_cap_text_trim',
      'byte_cap_section_trim',
      'byte_cap_section_content_trim',
      'byte_cap_topic_trim',
      'byte_cap_hard_reset',
      'byte_cap_hard_reset_warning',
      'section_title_cap',
      'suggested_topic_cap',
    ] as const;

    expect(result.truncation.truncated).toBe(true);
    expect(result.truncation.maxBytes).toBe(800);
    expect(result.truncation.returnedBytes).toBeLessThanOrEqual(800);
    expect(result.truncation.reasons.length).toBeGreaterThan(0);
    expect(
      result.truncation.reasons.every((r) =>
        (allowedReasons as readonly string[]).includes(r)
      )
    ).toBe(true);
    expect(result.truncation.reasons).toEqual(
      expect.arrayContaining(['section_title_cap', 'suggested_topic_cap'])
    );
    expect(
      result.payload.structure.suggestedMainTopic.length
    ).toBeLessThanOrEqual(topicCap);
    for (const section of result.payload.structure.sections) {
      expect(section.title.length).toBeLessThanOrEqual(titleCap);
    }
  });

  it('truncates section titles and suggestedMainTopic to maxSectionTitleChars and maxSuggestedTopicChars', () => {
    const maxSectionTitleChars = 20;
    const maxSuggestedTopicChars = 15;
    const longTitle = 'A very long section title that exceeds twenty chars';
    const longTopic = 'A long suggested main topic';

    const result = capExtractionResponsePayload(
      {
        ...basePayload,
        structure: {
          ...basePayload.structure,
          suggestedMainTopic: longTopic,
          sections: [
            { title: longTitle, content: 'Short', level: 1 },
            {
              title: 'Another long section title here',
              content: 'Body',
              level: 1,
            },
          ],
        },
      },
      {
        maxBytes: 50_000,
        maxTextChars: 10_000,
        maxSections: 10,
        maxSectionChars: 1_000,
        maxSectionTitleChars: maxSectionTitleChars,
        maxSuggestedTopicChars: maxSuggestedTopicChars,
      }
    );

    expect(result.truncation.truncated).toBe(true);
    expect(result.truncation.reasons).toEqual(
      expect.arrayContaining(['section_title_cap', 'suggested_topic_cap'])
    );
    expect(
      result.payload.structure.suggestedMainTopic.length
    ).toBeLessThanOrEqual(maxSuggestedTopicChars);
    expect(result.payload.structure.suggestedMainTopic).toBe(
      longTopic.slice(0, maxSuggestedTopicChars)
    );
    for (const section of result.payload.structure.sections) {
      expect(section.title.length).toBeLessThanOrEqual(maxSectionTitleChars);
    }
    expect(result.payload.structure.sections[0]?.title).toBe(
      longTitle.slice(0, maxSectionTitleChars)
    );
    expect(result.payload.structure.sections[1]?.title).toBe(
      'Another long section '.slice(0, maxSectionTitleChars)
    );
  });
});

describe('pdf validation', () => {
  it('rejects files over the size limit', () => {
    const result = validatePdfFile(
      {
        mimeType: 'application/pdf',
        sizeBytes: 10,
        pageCount: 1,
        text: 'Hello',
      },
      { maxSizeBytes: 5, maxPages: 10 }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('too_large');
    }
  });

  it('allows valid files within limits', () => {
    const result = validatePdfFile(
      {
        mimeType: 'application/pdf',
        sizeBytes: 1 * MB,
        pageCount: 10,
        text: 'Hello PDF',
      },
      { maxSizeBytes: 5 * MB, maxPages: 50 }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sizeBytes).toBe(1 * MB);
      expect(result.pageCount).toBe(10);
    }
  });

  it.each([
    ['NaN', Number.NaN],
    ['negative', -100],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s file size', (_label, sizeBytes) => {
    const result = validatePdfFile(
      {
        mimeType: 'application/pdf',
        sizeBytes,
        pageCount: 1,
        text: 'Hello',
      },
      { maxSizeBytes: 5 * MB, maxPages: 50 }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_size');
      expect(result.message).toContain('Invalid file size');
    }
  });

  it('rejects NaN page count', () => {
    const result = validatePdfFile(
      {
        mimeType: 'application/pdf',
        sizeBytes: 1 * MB,
        pageCount: NaN,
        text: 'Hello',
      },
      { maxSizeBytes: 5 * MB, maxPages: 50 }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_page_count');
      expect(result.message).toContain('Invalid page count');
    }
  });

  it('rejects negative page count', () => {
    const result = validatePdfFile(
      {
        mimeType: 'application/pdf',
        sizeBytes: 1 * MB,
        pageCount: -5,
        text: 'Hello',
      },
      { maxSizeBytes: 5 * MB, maxPages: 50 }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_page_count');
      expect(result.message).toContain('Invalid page count');
    }
  });

  it('rejects Infinity page count', () => {
    const result = validatePdfFile(
      {
        mimeType: 'application/pdf',
        sizeBytes: 1 * MB,
        pageCount: Infinity,
        text: 'Hello',
      },
      { maxSizeBytes: 5 * MB, maxPages: 50 }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_page_count');
      expect(result.message).toContain('Invalid page count');
    }
  });

  it('rejects zero page count', () => {
    const result = validatePdfFile(
      {
        mimeType: 'application/pdf',
        sizeBytes: 0,
        pageCount: 0,
        text: 'Hello',
      },
      { maxSizeBytes: 5 * MB, maxPages: 50 }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('empty_document');
    }
  });
});
