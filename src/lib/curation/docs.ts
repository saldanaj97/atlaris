/**
 * Documentation adapter for curation
 * Handles CSE search and heuristic fallback with validation
 */

import type { ResourceCandidate, CurationParams } from '@/lib/curation/types';
import { buildCacheKey, getOrSetWithLock } from '@/lib/curation/cache';
import { curationConfig } from '@/lib/curation/config';
import { headOk, canonicalizeUrl } from '@/lib/curation/validate';
import { scoreDoc, selectTop } from '@/lib/curation/ranking';

/**
 * CSE search result
 */
interface DocsSearchResult {
  url: string;
  title: string;
  snippet?: string;
}

/**
 * CSE API response
 */
interface CSESearchResponse {
  items?: Array<{
    link?: string;
    title?: string;
    snippet?: string;
  }>;
}

/**
 * Domain allowlist for docs search
 */
const DOMAIN_ALLOWLIST = [
  'developer.mozilla.org',
  'docs.python.org',
  'nodejs.org',
  'reactjs.org',
  'react.dev',
  'vuejs.org',
  'angular.io',
  'typescriptlang.org',
  'go.dev',
  'rust-lang.org',
  'docs.microsoft.com',
  'cloud.google.com',
  'docs.aws.amazon.com',
  'tailwindcss.com',
  'nextjs.org',
  'svelte.dev',
  'flutter.dev',
  'dart.dev',
];

/**
 * Topic keywords to canonical docs mapping
 */
const TOPIC_HEURISTICS: Record<string, string[]> = {
  react: ['https://react.dev', 'https://reactjs.org'],
  typescript: ['https://www.typescriptlang.org/docs/'],
  javascript: ['https://developer.mozilla.org/en-US/docs/Web/JavaScript'],
  python: ['https://docs.python.org/3/'],
  node: ['https://nodejs.org/docs/'],
  'node.js': ['https://nodejs.org/docs/'],
  vue: ['https://vuejs.org/guide/'],
  angular: ['https://angular.io/docs'],
  golang: ['https://go.dev/doc/'],
  rust: ['https://doc.rust-lang.org/book/'],
  tailwind: ['https://tailwindcss.com/docs'],
  nextjs: ['https://nextjs.org/docs'],
  svelte: ['https://svelte.dev/docs'],
  flutter: ['https://docs.flutter.dev/'],
  dart: ['https://dart.dev/guides'],
};

/**
 * Search docs using Google CSE if available
 * @param query Search query
 * @param params Curation parameters
 * @returns Array of search results
 */
async function searchDocsCSE(
  query: string,
  params: CurationParams
): Promise<DocsSearchResult[]> {
  const cseId = curationConfig.cseId;
  const cseKey = curationConfig.cseKey;

  if (!cseId || !cseKey) {
    return [];
  }

  const cacheKey = buildCacheKey({
    query,
    source: 'doc',
    paramsVersion: 'cse-v1',
    cacheVersion: params.cacheVersion,
  });

  return getOrSetWithLock(cacheKey, 'search', async () => {
    const baseUrl = 'https://www.googleapis.com/customsearch/v1';

    // Build site restrict parameter from allowlist
    const siteRestrict = DOMAIN_ALLOWLIST.join(' OR site:');

    const searchParams = new URLSearchParams({
      q: query,
      cx: cseId,
      key: cseKey,
      num: '5',
      fields: 'items(link,title,snippet)',
    });

    searchParams.append('siteSearch', siteRestrict);

    const response = await fetch(`${baseUrl}?${searchParams.toString()}`);

    if (!response.ok) {
      try {
        const status = response.status;
        const statusText = response.statusText;
        const requestUrl = `${baseUrl}?${searchParams.toString()}`;
        let body = '';
        try {
          const text = await response.text();
          try {
            const parsedBody: unknown = JSON.parse(text);
            body = JSON.stringify(parsedBody, null, 2);
          } catch {
            body = text;
          }
        } catch {
          body = 'Failed to read response body';
        }
        console.error(
          `CSE API error: ${status} ${statusText} for request: ${requestUrl}`,
          { body }
        );
      } catch (logError) {
        console.error('Failed to log CSE API error:', logError);
      }
      return [];
    }

    const data = (await response.json()) as CSESearchResponse;

    const results: DocsSearchResult[] = [];

    for (const item of data.items || []) {
      const url = item.link;
      const title = item.title;
      const snippet = item.snippet;

      if (url && title) {
        results.push({
          url,
          title,
          snippet,
        });
      }
    }

    return results;
  });
}

/**
 * Fallback to heuristic mapping
 * @param query Search query
 * @returns Array of URLs from heuristics
 */
function searchDocsHeuristic(query: string): DocsSearchResult[] {
  const queryLower = query.toLowerCase();
  const results: DocsSearchResult[] = [];

  // Check for topic matches
  for (const [topic, urls] of Object.entries(TOPIC_HEURISTICS)) {
    if (queryLower.includes(topic)) {
      for (const url of urls) {
        results.push({
          url,
          title: `${topic.charAt(0).toUpperCase() + topic.slice(1)} Documentation`,
        });
      }
      break; // First match wins
    }
  }

  // Fallback: general docs URLs
  if (results.length === 0) {
    results.push({
      url: 'https://developer.mozilla.org',
      title: 'MDN Web Docs',
    });
  }

  return results.slice(0, 3); // Limit to 3
}

/**
 * Search docs using CSE or heuristics
 * @param query Search query
 * @param params Curation parameters
 * @returns Array of search results
 */
export async function searchDocs(
  query: string,
  params: CurationParams
): Promise<DocsSearchResult[]> {
  // Try CSE first
  const cseResults = await searchDocsCSE(query, params);

  if (cseResults.length > 0) {
    return cseResults;
  }

  // Fallback to heuristics
  return searchDocsHeuristic(query);
}

/**
 * Curate documentation resources
 * Searches, validates, scores, filters, and returns top candidates
 * @param params Curation parameters
 * @returns Array of curated resource candidates
 */
export async function curateDocs(
  params: CurationParams
): Promise<ResourceCandidate[]> {
  // Search for docs
  const searchResults = await searchDocs(params.query, params);

  if (searchResults.length === 0) {
    return [];
  }

  // Map to ResourceCandidate and validate
  const candidates: ResourceCandidate[] = [];

  for (const result of searchResults) {
    // Canonicalize URL
    const canonicalUrl = canonicalizeUrl(result.url);

    // Validate with HEAD request (cache via docs-head stage)
    const headCacheKey = buildCacheKey({
      query: canonicalUrl,
      source: 'doc',
      paramsVersion: 'head-v1',
      cacheVersion: params.cacheVersion,
    });

    const isValid = await getOrSetWithLock(
      headCacheKey,
      'docs-head',
      async () => {
        const check = await headOk(canonicalUrl);
        return check.ok;
      }
    );

    if (!isValid) {
      continue;
    }

    const candidate: ResourceCandidate = {
      url: canonicalUrl,
      title: result.title,
      source: 'doc',
      score: {
        blended: 0, // Will be computed by scoring
        components: {},
        scoredAt: new Date().toISOString(),
      },
      metadata: {
        query: params.query,
        snippet: result.snippet,
      },
    };

    candidates.push(candidate);
  }

  // Score all candidates
  const scored = candidates.map((c) => scoreDoc(c));

  // Select top candidates with cutoff
  const top = selectTop(scored, {
    minScore: params.minScore,
    maxItems: params.maxResults || 3,
    preferDiversity: false, // Docs only, no diversity needed
    earlyStopEnabled: true,
  });

  return top;
}
