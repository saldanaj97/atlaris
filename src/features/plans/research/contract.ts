import type { OpenRouterUrlCitation } from '@/features/ai/providers/openrouter-grounded-response';

import { extractFirstJsonObject } from '@/features/ai/providers/openrouter-json';
import { z } from 'zod';

/**
 * The research step's output (JCS-158). The outline (2b) reads `brief`; lessons
 * (3a) cite `sources` by `key`. Keys run `S1`, `S2`, … with no gaps, and every
 * `url` was cited by the web search in the same response.
 */
export type ResearchCitationKey = `S${number}`;

export type ResearchSource = {
  readonly key: ResearchCitationKey;
  readonly title: string;
  readonly url: string;
  /** The model's publisher, else the URL's host without `www.`. */
  readonly publisher: string;
};

export type ResearchBrief = {
  /** Plain prose, at most `RESEARCH_BRIEF_MAX_CHARS`; cites sources as `[S1]`. */
  readonly brief: string;
  readonly sources: readonly ResearchSource[];
};

/** About 1.5k tokens at ~4 characters per token. */
export const RESEARCH_BRIEF_MAX_CHARS = 6_000;

/** What the research preset asks the model to return. */
const modelResearchSchema = z.object({
  brief: z.string().trim().min(1),
  sources: z.array(
    z.object({
      key: z.string().trim(),
      title: z.string().trim(),
      url: z.string().trim(),
      publisher: z.string().trim().nullish(),
    }),
  ),
});

export class ResearchOutputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResearchOutputError';
  }
}

export type CheckedResearch = {
  readonly research: ResearchBrief;
  /** Sources dropped because no `url_citation` annotation named their URL. */
  readonly droppedSourceCount: number;
};

/** Host, path and query, ignoring the fragment, a trailing slash and host case. */
function normalizeUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.host.toLowerCase()}${path}${url.search}`;
}

function hostPublisher(url: string): string {
  return new URL(url).hostname.replace(/^www\./i, '');
}

/**
 * Renames `[Sn]` markers to their new keys and removes markers of dropped
 * sources. A combined marker such as `[S1, S3]` becomes `[S1][S3]`.
 */
function rekeyBriefMarkers(
  brief: string,
  keyMap: ReadonlyMap<string, ResearchCitationKey>,
): string {
  return brief
    .replace(/\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g, (_marker, keys: string) =>
      [...new Set(keys.split(/\s*[,;]\s*/).map((key) => keyMap.get(key)))]
        .filter((key) => key !== undefined)
        .map((key) => `[${key}]`)
        .join(''),
    )
    .replace(/ {2,}/g, ' ')
    .replace(/ +([.,;:])/g, '$1')
    .trim();
}

/** Cuts at the last whitespace within the cap. */
function capBrief(brief: string): string {
  if (brief.length <= RESEARCH_BRIEF_MAX_CHARS) {
    return brief;
  }
  const cut = brief.slice(0, RESEARCH_BRIEF_MAX_CHARS);
  const lastSpace = cut.search(/\s\S*$/);
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Parses the model's text and enforces the contract: keeps only sources whose
 * URL appears in `citations` (deduplicated), renumbers them `S1…Sn` in order,
 * rewrites the brief's markers to match and caps the brief's length. Throws
 * `ResearchOutputError` when the text is not the expected JSON or no cited
 * source is left, so the step retries.
 */
export function checkResearchOutput(
  text: string,
  citations: readonly OpenRouterUrlCitation[],
): CheckedResearch {
  let raw: unknown;
  try {
    raw = extractFirstJsonObject(text);
  } catch (error) {
    throw new ResearchOutputError('Research response is not JSON', {
      cause: error,
    });
  }
  const parsed = modelResearchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ResearchOutputError(
      'Research response does not match the brief contract',
      { cause: parsed.error },
    );
  }

  const cited = new Map<string, OpenRouterUrlCitation>();
  for (const citation of citations) {
    const normalized = normalizeUrl(citation.url);
    if (normalized && !cited.has(normalized)) {
      cited.set(normalized, citation);
    }
  }

  const sources: ResearchSource[] = [];
  const keyMap = new Map<string, ResearchCitationKey>();
  const keptUrls = new Map<string, ResearchCitationKey>();
  let droppedSourceCount = 0;
  for (const source of parsed.data.sources) {
    const normalized = normalizeUrl(source.url);
    const citation = normalized ? cited.get(normalized) : undefined;
    if (!normalized || !citation) {
      droppedSourceCount += 1;
      continue;
    }
    const existing = keptUrls.get(normalized);
    if (existing) {
      keyMap.set(source.key, existing);
      continue;
    }
    const key: ResearchCitationKey = `S${sources.length + 1}`;
    keptUrls.set(normalized, key);
    keyMap.set(source.key, key);
    sources.push({
      key,
      title:
        source.title || citation.title?.trim() || hostPublisher(source.url),
      url: source.url,
      publisher: source.publisher || hostPublisher(source.url),
    });
  }

  if (sources.length === 0) {
    throw new ResearchOutputError(
      'Research response has no source cited by the web search',
    );
  }

  const brief = capBrief(rekeyBriefMarkers(parsed.data.brief, keyMap));
  if (brief.length === 0) {
    throw new ResearchOutputError('Research brief is empty');
  }

  return {
    research: { brief, sources },
    droppedSourceCount,
  };
}
