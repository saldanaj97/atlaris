/**
 * YouTube adapter for curation
 * Handles search, stats retrieval, and curation with caching
 */

import type { ResourceCandidate, CurationParams } from '@/lib/curation/types';
import { buildCacheKey, getOrSetWithLock } from '@/lib/curation/cache';
import { curationConfig } from '@/lib/curation/config';
import { isYouTubeEmbeddable } from '@/lib/curation/validate';
import { scoreYouTube, selectTop, type Scored } from '@/lib/curation/ranking';

/**
 * YouTube API search result from search.list
 */
interface YouTubeSearchResult {
  id: string;
  title: string;
  channelTitle: string;
}

/**
 * YouTube API video stats from videos.list
 */
interface YouTubeVideoStats {
  id: string;
  viewCount: number;
  publishedAt: string;
  duration: string;
  status: {
    privacyStatus?: string;
    embeddable?: boolean;
  };
}

/**
 * Duration filter options for YouTube search
 */
type DurationFilter = 'short' | 'medium' | 'long';

/**
 * Search YouTube videos
 * @param query Search query
 * @param params Curation parameters
 * @param duration Optional duration filter
 * @returns Array of search results with minimal fields
 */
export async function searchYouTube(
  query: string,
  params: CurationParams & { duration?: DurationFilter }
): Promise<YouTubeSearchResult[]> {
  const paramsVersion =
    params.duration != null ? `search-v1-${params.duration}` : 'search-v1';
  const cacheKey = buildCacheKey({
    query,
    source: 'youtube',
    paramsVersion,
    cacheVersion: params.cacheVersion,
  });

  return getOrSetWithLock(cacheKey, 'search', async () => {
    const apiKey = curationConfig.youtubeApiKey!;
    const baseUrl = 'https://www.googleapis.com/youtube/v3/search';

    const searchParams = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: '10',
      q: query,
      key: apiKey,
      videoDefinition: 'high',
      fields: 'items(id/videoId,snippet/title,snippet/channelTitle)',
    });

    // Add duration filter if specified
    if (params.duration) {
      searchParams.append('videoDuration', params.duration);
    }

    const response = await fetch(`${baseUrl}?${searchParams.toString()}`);

    if (!response.ok) {
      // Surface error so callers/caching treat it as transient, not negative cache
      let body = '';
      try {
        const text = await response.text();
        body = text;
      } catch {
        body = '<no body>';
      }
      const err = new Error(
        `YouTube search API error: ${response.status} ${response.statusText} — ${body}`
      );
      // Throw so getOrSetWithLock does not cache this failure
      throw err;
    }

    const data = (await response.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string };
      }>;
    };

    const results: YouTubeSearchResult[] = [];

    for (const item of data.items || []) {
      const videoId = item.id?.videoId;
      const title = item.snippet?.title;
      const channelTitle = item.snippet?.channelTitle;

      if (videoId && title && channelTitle) {
        results.push({
          id: videoId,
          title,
          channelTitle,
        });
      }
    }

    return results;
  });
}

/**
 * Get video statistics in batch
 * @param ids Array of video IDs
 * @returns Array of video stats
 */
export async function getVideoStats(
  ids: string[]
): Promise<YouTubeVideoStats[]> {
  if (ids.length === 0) {
    return [];
  }

  const apiKey = curationConfig.youtubeApiKey!;
  const baseUrl = 'https://www.googleapis.com/youtube/v3/videos';
  const key = buildCacheKey({
    query: ids.slice().sort().join(','),
    source: 'youtube',
    paramsVersion: 'yt-stats-v1',
    cacheVersion: curationConfig.cacheVersion,
  });

  const searchParams = new URLSearchParams({
    part: 'statistics,snippet,contentDetails,status',
    id: ids.join(','),
    key: apiKey,
    fields:
      'items(id,statistics/viewCount,snippet/publishedAt,contentDetails/duration,status/privacyStatus,status/embeddable)',
  });

  try {
    return await getOrSetWithLock(key, 'yt-stats', async () => {
      const response = await fetch(`${baseUrl}?${searchParams.toString()}`);

      if (!response.ok) {
        let body = '';
        try {
          body = await response.text();
        } catch {
          body = '<no body>';
        }
        console.error(
          `YouTube stats API error: ${response.status} ${response.statusText}`,
          { body }
        );
        throw new Error(`YouTube stats API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        items?: Array<{
          id?: string;
          statistics?: { viewCount?: string };
          snippet?: { publishedAt?: string };
          contentDetails?: { duration?: string };
          status?: { privacyStatus?: string; embeddable?: boolean };
        }>;
      };

      const results: YouTubeVideoStats[] = [];

      for (const item of data.items || []) {
        const videoId = item.id;
        const viewCount = item.statistics?.viewCount;
        const publishedAt = item.snippet?.publishedAt;
        const duration = item.contentDetails?.duration;
        const status = item.status;

        if (videoId && viewCount && publishedAt && duration && status) {
          results.push({
            id: videoId,
            viewCount: Number.parseInt(viewCount, 10),
            publishedAt,
            duration,
            status: {
              privacyStatus: status.privacyStatus,
              embeddable: status.embeddable,
            },
          });
        }
      }

      return results;
    });
  } catch {
    return [];
  }
}

/**
 * Parse ISO 8601 duration (PT1H2M3S) to minutes
 */
function parseDurationToMinutes(duration: string): number {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const match = duration.match(regex);

  if (!match) {
    return 0;
  }

  const hours = Number.parseInt(match[1] || '0', 10);
  const minutes = Number.parseInt(match[2] || '0', 10);
  const seconds = Number.parseInt(match[3] || '0', 10);

  return hours * 60 + minutes + seconds / 60;
}

/**
 * Curate YouTube resources for a given query
 * Searches, fetches stats, scores, filters, and returns top candidates
 * @param params Curation parameters
 * @returns Array of scored resource candidates (Scored[])
 */
export async function curateYouTube(params: CurationParams): Promise<Scored[]> {
  // Skip YouTube curation if API key is not available
  if (!curationConfig.youtubeApiKey) {
    return [];
  }

  const batchTimestamp = new Date().toISOString();
  // Search for videos
  const searchResults = await searchYouTube(params.query, params);

  if (searchResults.length === 0) {
    return [];
  }

  // Batch fetch stats for all videos
  const videoIds = searchResults.map((r) => r.id);
  const stats = await getVideoStats(videoIds);

  // Map to ResourceCandidate and score
  const candidates: ResourceCandidate[] = [];

  for (const searchResult of searchResults) {
    const stat = stats.find((s) => s.id === searchResult.id);

    if (!stat) {
      continue;
    }

    // Validate embeddability
    if (!isYouTubeEmbeddable(stat.status)) {
      continue;
    }

    const durationMinutes = parseDurationToMinutes(stat.duration);
    const url = `https://www.youtube.com/watch?v=${searchResult.id}`;

    const candidate: ResourceCandidate = {
      url,
      title: searchResult.title,
      source: 'youtube',
      score: {
        blended: 0, // Will be computed by scoring
        components: {},
        scoredAt: batchTimestamp,
      },
      metadata: {
        videoId: searchResult.id,
        channelTitle: searchResult.channelTitle,
        viewCount: stat.viewCount,
        publishedAt: stat.publishedAt,
        durationMinutes,
        query: params.query,
      },
    };

    candidates.push(candidate);
  }

  // Score all candidates
  const scored = candidates.map((c) => scoreYouTube(c));

  // Select top candidates with cutoff and diversity
  const top = selectTop(scored, {
    minScore: params.minScore,
    maxItems: params.maxResults || 3,
    preferDiversity: false, // YouTube only, no diversity needed
    earlyStopEnabled: true,
  });

  return top;
}
