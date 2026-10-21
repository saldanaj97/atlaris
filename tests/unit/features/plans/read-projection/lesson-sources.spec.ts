import type { DbResearchSource } from '@/lib/db/queries/types/plan-research.types';

import {
  readCitedSourceIds,
  resolveLessonSources,
} from '@/features/plans/read-projection/lesson-sources';
import { describe, expect, it } from 'vitest';

const RETRIEVED_AT = new Date('2026-10-01T12:00:00.000Z');

function researchSource(
  citationKey: string,
  overrides: Partial<DbResearchSource> = {},
): DbResearchSource {
  return {
    id: `source-${citationKey}`,
    researchId: 'research-1',
    citationKey,
    url: `https://example.com/${citationKey}`,
    title: `Source ${citationKey}`,
    publisher: 'example.com',
    retrievedAt: RETRIEVED_AT,
    ...overrides,
  };
}

describe('readCitedSourceIds', () => {
  it('reads sourceIds from stored lesson content', () => {
    expect(
      readCitedSourceIds({ version: 1, blocks: [], sourceIds: ['S1', 'S3'] }),
    ).toEqual(['S1', 'S3']);
  });

  it.each([
    ['null content', null],
    ['content without sourceIds', { version: 1, blocks: [] }],
    ['malformed sourceIds', { version: 1, blocks: [], sourceIds: 'S1' }],
  ])('returns no IDs for %s', (_label, content) => {
    expect(readCitedSourceIds(content)).toEqual([]);
  });
});

describe('resolveLessonSources', () => {
  const sources = [
    researchSource('S1'),
    researchSource('S2', { publisher: null }),
    researchSource('S3'),
  ];

  it('returns only the cited sources, in citation order', () => {
    expect(resolveLessonSources(['S3', 'S1', 'S3'], sources)).toEqual([
      {
        citationKey: 'S1',
        title: 'Source S1',
        publisher: 'example.com',
        url: 'https://example.com/S1',
        retrievedAt: RETRIEVED_AT,
      },
      {
        citationKey: 'S3',
        title: 'Source S3',
        publisher: 'example.com',
        url: 'https://example.com/S3',
        retrievedAt: RETRIEVED_AT,
      },
    ]);
  });

  it('drops cited IDs with no matching source', () => {
    expect(
      resolveLessonSources(['S2', 'S9'], sources).map((s) => s.citationKey),
    ).toEqual(['S2']);
  });

  it('returns nothing when the lesson cites nothing or the plan has no sources', () => {
    expect(resolveLessonSources([], sources)).toEqual([]);
    expect(resolveLessonSources(['S1'], [])).toEqual([]);
  });
});
