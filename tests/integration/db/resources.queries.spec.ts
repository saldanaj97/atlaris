import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import type { ResourceCandidate } from '@/lib/curation/types';
import { upsertResource } from '@/lib/db/queries/resources';
import { resources } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

function buildCandidate(
  overrides: Partial<ResourceCandidate> = {}
): ResourceCandidate {
  const scoreTimestamp = new Date().toISOString();
  const { metadata, ...rest } = overrides;

  return {
    url: 'https://example.com/resource',
    title: 'Example Resource',
    source: 'doc',
    score: {
      blended: 0.85,
      components: { relevance: 0.9, authority: 0.8 },
      scoredAt: scoreTimestamp,
    },
    ...rest,
    metadata: metadata ?? {},
  };
}

describe('Resource Queries', () => {
  describe('upsertResource', () => {
    it('creates a new resource and returns its id', async () => {
      const candidate = buildCandidate({
        url: 'https://www.react.dev/learn',
        title: 'React Learn',
        source: 'doc',
        metadata: { durationMinutes: 12.6 },
      });

      const resourceId = await upsertResource({ candidate, dbClient: db });

      const [row] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, resourceId));

      expect(row).toBeDefined();
      expect(row?.id).toBe(resourceId);
      expect(row?.url).toBe(candidate.url);
      expect(row?.type).toBe('doc');
      expect(row?.title).toBe('React Learn');
      expect(row?.domain).toBe('react.dev');
      expect(row?.durationMinutes).toBe(13);
    });

    it('deduplicates by URL and updates mutable fields on conflict', async () => {
      const url = 'https://youtube.com/watch?v=abc123';

      const firstId = await upsertResource({
        candidate: buildCandidate({
          url,
          title: 'First Title',
          source: 'doc',
          metadata: { durationMinutes: 5 },
        }),
        dbClient: db,
      });

      const secondId = await upsertResource({
        candidate: buildCandidate({
          url,
          title: 'Updated Title',
          source: 'youtube',
          metadata: { durationMinutes: 18 },
        }),
        dbClient: db,
      });

      const rows = await db
        .select()
        .from(resources)
        .where(eq(resources.url, url));

      expect(secondId).toBe(firstId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(firstId);
      expect(rows[0]?.type).toBe('youtube');
      expect(rows[0]?.title).toBe('Updated Title');
      expect(rows[0]?.durationMinutes).toBe(18);
    });

    it('rejects invalid URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com/file',
        'javascript:alert(1)',
      ];

      for (const invalidUrl of invalidUrls) {
        await expect(
          upsertResource({
            candidate: buildCandidate({
              url: invalidUrl,
              title: 'Invalid URL Candidate',
            }),
            dbClient: db,
          })
        ).rejects.toThrow(/invalid url/i);
      }
    });
  });
});
