/**
 * Unit tests for ranking module
 * Tests: scoring components, blending, cutoff, diversity, early-stop
 */

import { describe, expect, it } from 'vitest';
import type { ResourceCandidate } from '@/lib/curation/types';
import {
  scoreDoc,
  scoreYouTube,
  selectTop,
  type Scored,
} from '@/lib/curation/ranking';

describe('Ranking Module', () => {
  describe('scoreYouTube', () => {
    it('should compute all score components for YouTube video', () => {
      const candidate: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=abc123',
        title: 'Learn React Hooks in 2024',
        source: 'youtube',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'react hooks tutorial',
          viewCount: 1000000,
          publishedAt: new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
          durationMinutes: 15,
        },
      };

      const scored = scoreYouTube(candidate);

      expect(scored.numericScore).toBeGreaterThan(0);
      expect(scored.numericScore).toBeLessThanOrEqual(1);
      expect(scored.components.popularity).toBeGreaterThan(0);
      expect(scored.components.recency).toBeGreaterThan(0);
      expect(scored.components.relevance).toBeGreaterThan(0);
      expect(scored.components.suitability).toBeGreaterThan(0);
    });

    it('should assign high popularity score to videos with many views', () => {
      const highViews: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=high',
        title: 'Popular Video',
        source: 'youtube',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'test',
          viewCount: 10000000, // 10M views
          publishedAt: new Date().toISOString(),
          durationMinutes: 20,
        },
      };

      const lowViews: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=low',
        title: 'Unpopular Video',
        source: 'youtube',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'test',
          viewCount: 1000,
          publishedAt: new Date().toISOString(),
          durationMinutes: 20,
        },
      };

      const scoredHigh = scoreYouTube(highViews);
      const scoredLow = scoreYouTube(lowViews);

      expect(scoredHigh.components.popularity).toBeGreaterThan(
        scoredLow.components.popularity
      );
    });

    it('should assign high recency score to recent videos', () => {
      const recent: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=recent',
        title: 'Recent Video',
        source: 'youtube',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'test',
          viewCount: 10000,
          publishedAt: new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000
          ).toISOString(), // 7 days ago
          durationMinutes: 20,
        },
      };

      const old: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=old',
        title: 'Old Video',
        source: 'youtube',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'test',
          viewCount: 10000,
          publishedAt: new Date(
            Date.now() - 730 * 24 * 60 * 60 * 1000
          ).toISOString(), // 2 years ago
          durationMinutes: 20,
        },
      };

      const scoredRecent = scoreYouTube(recent);
      const scoredOld = scoreYouTube(old);

      expect(scoredRecent.components.recency).toBeGreaterThan(
        scoredOld.components.recency
      );
    });

    it('should assign high relevance score to matching titles', () => {
      const matching: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=match',
        title: 'React Hooks Tutorial Complete Guide',
        source: 'youtube',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'react hooks tutorial',
          viewCount: 10000,
          publishedAt: new Date().toISOString(),
          durationMinutes: 20,
        },
      };

      const nonMatching: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=nomatch',
        title: 'Vue Component Basics',
        source: 'youtube',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'react hooks tutorial',
          viewCount: 10000,
          publishedAt: new Date().toISOString(),
          durationMinutes: 20,
        },
      };

      const scoredMatch = scoreYouTube(matching);
      const scoredNoMatch = scoreYouTube(nonMatching);

      expect(scoredMatch.components.relevance).toBeGreaterThan(
        scoredNoMatch.components.relevance
      );
    });

    it('should assign optimal suitability score to 5-30 minute videos', () => {
      const optimal: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=optimal',
        title: 'Perfect Length',
        source: 'youtube',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'test',
          viewCount: 10000,
          publishedAt: new Date().toISOString(),
          durationMinutes: 15, // Ideal length
        },
      };

      const tooShort: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=short',
        title: 'Too Short',
        source: 'youtube',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'test',
          viewCount: 10000,
          publishedAt: new Date().toISOString(),
          durationMinutes: 1,
        },
      };

      const scoredOptimal = scoreYouTube(optimal);
      const scoredShort = scoreYouTube(tooShort);

      expect(scoredOptimal.components.suitability).toBe(1.0);
      expect(scoredShort.components.suitability).toBeLessThan(1.0);
    });
  });

  describe('scoreDoc', () => {
    it('should compute all score components for documentation', () => {
      const candidate: ResourceCandidate = {
        url: 'https://react.dev/learn/hooks',
        title: 'React Hooks Documentation',
        source: 'doc',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'react hooks',
        },
      };

      const scored = scoreDoc(candidate);

      expect(scored.numericScore).toBeGreaterThan(0);
      expect(scored.numericScore).toBeLessThanOrEqual(1);
      expect(scored.components.authority).toBeGreaterThan(0);
      expect(scored.components.relevance).toBeGreaterThan(0);
      expect(scored.components.recency).toBeGreaterThanOrEqual(0);
    });

    it('should assign high authority to official documentation domains', () => {
      const official: ResourceCandidate = {
        url: 'https://react.dev/learn',
        title: 'React Official Docs',
        source: 'doc',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'react',
        },
      };

      const unknown: ResourceCandidate = {
        url: 'https://random-blog.com/react',
        title: 'React Tutorial',
        source: 'doc',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'react',
        },
      };

      const scoredOfficial = scoreDoc(official);
      const scoredUnknown = scoreDoc(unknown);

      expect(scoredOfficial.components.authority).toBeGreaterThan(
        scoredUnknown.components.authority!
      );
    });

    it('should assign relevance based on title match', () => {
      const matching: ResourceCandidate = {
        url: 'https://example.com/typescript-generics',
        title: 'TypeScript Generics Complete Guide',
        source: 'doc',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'typescript generics',
        },
      };

      const nonMatching: ResourceCandidate = {
        url: 'https://example.com/python-basics',
        title: 'Python Basics for Beginners',
        source: 'doc',
        score: {
          blended: 0,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'typescript generics',
        },
      };

      const scoredMatch = scoreDoc(matching);
      const scoredNoMatch = scoreDoc(nonMatching);

      expect(scoredMatch.components.relevance).toBeGreaterThan(
        scoredNoMatch.components.relevance
      );
    });
  });

  describe('selectTop', () => {
    const mockCandidates: Scored[] = [
      {
        url: 'https://youtube.com/1',
        title: 'Video 1',
        source: 'youtube',
        numericScore: 0.9,
        score: {
          blended: 0.9,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0.9, recency: 0.8, relevance: 0.9 },
        metadata: {},
      },
      {
        url: 'https://react.dev/1',
        title: 'Doc 1',
        source: 'doc',
        numericScore: 0.85,
        score: {
          blended: 0.85,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: {
          authority: 1.0,
          relevance: 0.8,
          recency: 0.5,
          popularity: 0,
        },
        metadata: {},
      },
      {
        url: 'https://youtube.com/2',
        title: 'Video 2',
        source: 'youtube',
        numericScore: 0.8,
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0.7, recency: 0.9, relevance: 0.8 },
        metadata: {},
      },
      {
        url: 'https://react.dev/2',
        title: 'Doc 2',
        source: 'doc',
        numericScore: 0.75,
        score: {
          blended: 0.75,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: {
          authority: 0.8,
          relevance: 0.7,
          recency: 0.6,
          popularity: 0,
        },
        metadata: {},
      },
      {
        url: 'https://youtube.com/3',
        title: 'Video 3',
        source: 'youtube',
        numericScore: 0.5,
        score: {
          blended: 0.5,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0.5, recency: 0.5, relevance: 0.5 },
        metadata: {},
      },
    ];

    it('should enforce minimum score cutoff', () => {
      const selected = selectTop(mockCandidates, {
        minScore: 0.7,
        maxItems: 5,
      });

      expect(selected.length).toBe(4);
      expect(selected.every((c) => c.numericScore >= 0.7)).toBe(true);
    });

    it('should return empty array when no candidates meet threshold', () => {
      const selected = selectTop(mockCandidates, {
        minScore: 0.95,
        maxItems: 5,
      });

      expect(selected.length).toBe(0);
    });

    it('should limit results to maxItems', () => {
      const selected = selectTop(mockCandidates, {
        minScore: 0.5,
        maxItems: 3,
      });

      expect(selected.length).toBe(3);
    });

    it('should return results sorted by score descending', () => {
      const selected = selectTop(mockCandidates, {
        minScore: 0.5,
        maxItems: 5,
      });

      for (let i = 1; i < selected.length; i++) {
        expect(selected[i - 1].numericScore).toBeGreaterThanOrEqual(
          selected[i].numericScore
        );
      }
    });

    it('should prefer source diversity when enabled', () => {
      const selected = selectTop(mockCandidates, {
        minScore: 0.5,
        maxItems: 3,
        preferDiversity: true,
      });

      const sources = selected.map((c) => c.source);
      const uniqueSources = new Set(sources);

      // Should have both youtube and doc sources
      expect(uniqueSources.size).toBeGreaterThan(1);
    });

    it('should work without diversity when only one source available', () => {
      const singleSource: Scored[] = [
        {
          url: 'https://youtube.com/1',
          title: 'Video 1',
          source: 'youtube',
          numericScore: 0.9,
          score: {
            blended: 0.9,
            components: {},
            scoredAt: new Date().toISOString(),
          },
          components: { popularity: 0.9, recency: 0.8, relevance: 0.9 },
          metadata: {},
        },
        {
          url: 'https://youtube.com/2',
          title: 'Video 2',
          source: 'youtube',
          numericScore: 0.8,
          score: {
            blended: 0.8,
            components: {},
            scoredAt: new Date().toISOString(),
          },
          components: { popularity: 0.7, recency: 0.9, relevance: 0.8 },
          metadata: {},
        },
      ];

      const selected = selectTop(singleSource, {
        minScore: 0.5,
        maxItems: 2,
        preferDiversity: true,
      });

      expect(selected.length).toBe(2);
      expect(selected.every((c) => c.source === 'youtube')).toBe(true);
    });

    it('should respect score order when diversity disabled', () => {
      const selected = selectTop(mockCandidates, {
        minScore: 0.5,
        maxItems: 3,
        preferDiversity: false,
      });

      // Should be top 3 by score regardless of source
      expect(selected[0].numericScore).toBe(0.9);
      expect(selected[1].numericScore).toBe(0.85);
      expect(selected[2].numericScore).toBe(0.8);
    });

    it('should handle empty candidate array', () => {
      const selected = selectTop([], {
        minScore: 0.5,
        maxItems: 3,
      });

      expect(selected.length).toBe(0);
    });

    it('should default maxItems to 3', () => {
      const selected = selectTop(mockCandidates, {
        minScore: 0.5,
      });

      expect(selected.length).toBeLessThanOrEqual(3);
    });

    it('should default preferDiversity to true', () => {
      const selected = selectTop(mockCandidates, {
        minScore: 0.5,
        maxItems: 3,
      });

      const sources = selected.map((c) => c.source);
      const uniqueSources = new Set(sources);

      expect(uniqueSources.size).toBeGreaterThan(1);
    });
  });
});

describe('selectTop early-stop behavior', () => {
  const earlyStopCandidates: Scored[] = [
    // Youtube dominant source with enough high-scorers
    {
      url: 'https://youtube.com/1',
      title: 'YT1',
      source: 'youtube',
      numericScore: 0.9,
      score: {
        blended: 0.9,
        components: {},
        scoredAt: new Date().toISOString(),
      },
      components: { popularity: 0.9, recency: 0.8, relevance: 0.9 },
      metadata: {},
    },
    {
      url: 'https://youtube.com/2',
      title: 'YT2',
      source: 'youtube',
      numericScore: 0.85,
      score: {
        blended: 0.85,
        components: {},
        scoredAt: new Date().toISOString(),
      },
      components: { popularity: 0.85, recency: 0.85, relevance: 0.85 },
      metadata: {},
    },
    {
      url: 'https://youtube.com/3',
      title: 'YT3',
      source: 'youtube',
      numericScore: 0.8,
      score: {
        blended: 0.8,
        components: {},
        scoredAt: new Date().toISOString(),
      },
      components: { popularity: 0.8, recency: 0.8, relevance: 0.8 },
      metadata: {},
    },
    // Doc source with lower scores
    {
      url: 'https://doc.com/1',
      title: 'Doc1',
      source: 'doc',
      numericScore: 0.7,
      score: {
        blended: 0.7,
        components: {},
        scoredAt: new Date().toISOString(),
      },
      components: {
        authority: 0.7,
        relevance: 0.7,
        recency: 0.7,
        popularity: 0,
      },
      metadata: {},
    },
    {
      url: 'https://doc.com/2',
      title: 'Doc2',
      source: 'doc',
      numericScore: 0.65,
      score: {
        blended: 0.65,
        components: {},
        scoredAt: new Date().toISOString(),
      },
      components: {
        authority: 0.65,
        relevance: 0.65,
        recency: 0.65,
        popularity: 0,
      },
      metadata: {},
    },
  ];

  it('should early-stop and return only dominant source when enabled and quota filled', () => {
    const selected = selectTop(earlyStopCandidates, {
      minScore: 0.7,
      maxItems: 3,
      earlyStopEnabled: true,
    });

    expect(selected.length).toBe(3);
    expect(selected.every((c) => c.source === 'youtube')).toBe(true);
    expect(selected[0].numericScore).toBe(0.9);
    expect(selected[1].numericScore).toBe(0.85);
    expect(selected[2].numericScore).toBe(0.8);
  });

  it('should fallback to diversity when early-stop criterion not met', () => {
    const insufficient: Scored[] = [
      // Only 2 YT above threshold
      {
        url: 'https://youtube.com/1',
        title: 'YT1',
        source: 'youtube',
        numericScore: 0.9,
        score: {
          blended: 0.9,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0, recency: 0, relevance: 0 },
        metadata: {},
      },
      {
        url: 'https://youtube.com/2',
        title: 'YT2',
        source: 'youtube',
        numericScore: 0.75,
        score: {
          blended: 0.75,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0, recency: 0, relevance: 0 },
        metadata: {},
      },
      // Doc with high score
      {
        url: 'https://doc.com/1',
        title: 'Doc1',
        source: 'doc',
        numericScore: 0.85,
        score: {
          blended: 0.85,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0, recency: 0, relevance: 0 },
        metadata: {},
      },
      {
        url: 'https://doc.com/2',
        title: 'Doc2',
        source: 'doc',
        numericScore: 0.7,
        score: {
          blended: 0.7,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0, recency: 0, relevance: 0 },
        metadata: {},
      },
    ];

    const selected = selectTop(insufficient, {
      minScore: 0.7,
      maxItems: 3,
      preferDiversity: true,
      earlyStopEnabled: true,
    });

    // Should include both sources since YT can't fill 3 alone
    const sources = selected.map((c) => c.source);
    expect(new Set(sources).size).toBe(2);
    expect(selected.length).toBe(3);
  });

  it('should maintain existing behavior with earlyStopEnabled false (default)', () => {
    // Reuse mockCandidates from existing tests
    const mockCandidates: Scored[] = [
      {
        url: 'https://youtube.com/1',
        title: 'Video 1',
        source: 'youtube',
        numericScore: 0.9,
        score: {
          blended: 0.9,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0, recency: 0, relevance: 0 },
        metadata: {},
      },
      {
        url: 'https://react.dev/1',
        title: 'Doc 1',
        source: 'doc',
        numericScore: 0.85,
        score: {
          blended: 0.85,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0, recency: 0, relevance: 0 },
        metadata: {},
      },
      {
        url: 'https://youtube.com/2',
        title: 'Video 2',
        source: 'youtube',
        numericScore: 0.8,
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0, recency: 0, relevance: 0 },
        metadata: {},
      },
      {
        url: 'https://react.dev/2',
        title: 'Doc 2',
        source: 'doc',
        numericScore: 0.75,
        score: {
          blended: 0.75,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0, recency: 0, relevance: 0 },
        metadata: {},
      },
      {
        url: 'https://youtube.com/3',
        title: 'Video 3',
        source: 'youtube',
        numericScore: 0.5,
        score: {
          blended: 0.5,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        components: { popularity: 0, recency: 0, relevance: 0 },
        metadata: {},
      },
    ];

    const selected = selectTop(mockCandidates, {
      minScore: 0.5,
      maxItems: 3,
      preferDiversity: true,
      // earlyStopEnabled defaults to false
    });

    // Should behave as before: diversity preferred
    const sources = selected.map((c) => c.source);
    expect(new Set(sources).size).toBe(2); // Includes both youtube and doc
    expect(selected.length).toBe(3);
  });
});
