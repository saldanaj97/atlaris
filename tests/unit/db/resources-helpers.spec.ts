import { describe, expect, it } from 'vitest';

import {
  buildTaskResourceInsertValues,
  dedupePreparedCandidatesByUrl,
  prepareResourceCandidate,
} from '@/lib/db/queries/helpers/resources-helpers';
import { createId } from '../../fixtures/ids';
import { createResourceCandidate } from '../../fixtures/resource-candidates';

describe('resources helpers', () => {
  describe('prepareResourceCandidate', () => {
    it('validates URL, normalizes domain, and rounds duration', () => {
      const candidate = createResourceCandidate({
        metadata: { durationMinutes: 12.6 },
      });

      const result = prepareResourceCandidate(candidate);

      expect(result.url).toBe(candidate.url);
      expect(result.domain).toBe('example.com');
      expect(result.durationMinutes).toBe(13);
      expect(result.type).toBe('doc');
    });

    it('sanitizes titles and rejects empty sanitized values', () => {
      const sanitized = prepareResourceCandidate(
        createResourceCandidate({ title: '<b>JavaScript</b> Basics' })
      );

      expect(sanitized.title).toBe('JavaScript Basics');

      expect(() =>
        prepareResourceCandidate(
          createResourceCandidate({ title: '<script></script>' })
        )
      ).toThrow(/invalid title/i);
    });

    it('rejects non-http URL schemes', () => {
      expect(() =>
        prepareResourceCandidate(
          createResourceCandidate({ url: 'javascript:alert(1)' })
        )
      ).toThrow(/invalid url/i);
    });
  });

  describe('dedupePreparedCandidatesByUrl', () => {
    it('keeps the last entry for a duplicate URL', () => {
      const first = prepareResourceCandidate(
        createResourceCandidate({
          title: 'First',
          url: 'https://example.com/a',
        })
      );
      const second = prepareResourceCandidate(
        createResourceCandidate({
          title: 'Second',
          url: 'https://example.com/a',
        })
      );

      const result = dedupePreparedCandidatesByUrl([first, second]);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Second');
    });
  });

  describe('buildTaskResourceInsertValues', () => {
    it('builds deterministic 1-based ordering', () => {
      const taskId = createId('task');
      const resourceIds = [
        createId('resource'),
        createId('resource'),
        createId('resource'),
      ];

      const values = buildTaskResourceInsertValues({
        taskId,
        resourceIds,
      });

      expect(values).toEqual([
        { taskId, resourceId: resourceIds[0], order: 1 },
        { taskId, resourceId: resourceIds[1], order: 2 },
        { taskId, resourceId: resourceIds[2], order: 3 },
      ]);
    });
  });
});
