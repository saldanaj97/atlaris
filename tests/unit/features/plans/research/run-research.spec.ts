import {
  toByteStream,
  toSseBody,
} from '../../../ai/providers/fixtures/openrouter-grounded-streams';
import {
  GROUNDED_PRESET_SLUGS,
  getGroundedOperationPolicy,
} from '@/features/ai/model-operation-policy';
import { billedUsageOf } from '@/features/ai/usage';
import { runPlanResearch } from '@/features/plans/research/run-research';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNERSHIP_URL =
  'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html';

const RESEARCH_JSON = JSON.stringify({
  brief: 'Ownership rules [S1]. A blog says otherwise [S2].',
  sources: [
    {
      key: 'S1',
      title: 'Understanding Ownership',
      url: OWNERSHIP_URL,
      publisher: 'The Rust Project',
    },
    { key: 'S2', title: 'Blog', url: 'https://blog.example.com/rust' },
  ],
});

/** Spike-shaped stream: citations on deltas, search count and cost in usage. */
const RESEARCH_STREAM_CHUNKS: readonly unknown[] = [
  {
    model: 'served/model',
    choices: [
      {
        index: 0,
        delta: {
          content: RESEARCH_JSON.slice(0, 50),
          annotations: [
            {
              type: 'url_citation',
              url_citation: { url: OWNERSHIP_URL, title: 'Ownership' },
            },
          ],
        },
      },
    ],
  },
  {
    model: 'served/model',
    choices: [
      {
        index: 0,
        delta: { content: RESEARCH_JSON.slice(50) },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 900,
      completion_tokens: 300,
      total_tokens: 1200,
      cost: 0.0215,
      server_tool_use_details: { web_search_requests: 3 },
    },
  },
];

function researchFetch() {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(toByteStream(toSseBody(RESEARCH_STREAM_CHUNKS)), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    ),
  );
}

const INPUT = {
  topic: 'Rust ownership',
  skillLevel: 'beginner',
  learningStyle: 'mixed',
  weeklyHours: 5,
} as const;

describe('runPlanResearch', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'shared-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['free', 'starter', 'pro'] as const)(
    'sends the %s tier research route, preset and web search limits',
    async (tier) => {
      const fetchMock = researchFetch();

      await runPlanResearch({ tier, input: INPUT }, { fetch: fetchMock });

      const policy = getGroundedOperationPolicy(tier, 'research');
      if (!policy.allowed || !policy.research) {
        throw new Error('research policy missing');
      }
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      const [primary] = policy.models;
      expect(body.models).toEqual(
        policy.models.map(
          (model) =>
            `${model.modelId}@preset/${GROUNDED_PRESET_SLUGS.research}`,
        ),
      );
      expect(body.tools).toEqual([
        {
          type: 'openrouter:web_search',
          parameters: {
            engine: 'parallel',
            mode: primary.researchMode,
            max_results: policy.research.maxResults,
            max_total_results: policy.research.maxTotalResults,
          },
        },
      ]);
      expect(body.response_format).toEqual({ type: 'json_object' });
      const prompt = JSON.stringify(body.messages);
      expect(prompt).toContain('Topic: Rust ownership');
      expect(prompt).toContain('untrusted data');
    },
  );

  it('adds regeneration guidance after the fenced request', async () => {
    const fetchMock = researchFetch();

    await runPlanResearch(
      {
        tier: 'pro',
        input: INPUT,
        guidance: 'REGENERATION FEEDBACK: favor recent sources',
      },
      { fetch: fetchMock },
    );

    const prompt = JSON.stringify(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).messages,
    );
    expect(prompt.indexOf('---END USER INPUT---')).toBeLessThan(
      prompt.indexOf('REGENERATION FEEDBACK: favor recent sources'),
    );
  });

  it('sends advanced mode for pro and fast mode for free', async () => {
    const proFetch = researchFetch();
    const freeFetch = researchFetch();

    const pro = await runPlanResearch(
      { tier: 'pro', input: INPUT },
      { fetch: proFetch },
    );
    const free = await runPlanResearch(
      { tier: 'free', input: INPUT },
      { fetch: freeFetch },
    );

    expect(pro.mode).toBe('advanced');
    expect(free.mode).toBe('fast');
  });

  it('returns the checked brief with only cited sources, search count and cost', async () => {
    const result = await runPlanResearch(
      { tier: 'starter', input: INPUT },
      { fetch: researchFetch() },
    );

    expect(result).toEqual({
      research: {
        brief: 'Ownership rules [S1]. A blog says otherwise.',
        sources: [
          {
            key: 'S1',
            title: 'Understanding Ownership',
            url: OWNERSHIP_URL,
            publisher: 'The Rust Project',
          },
        ],
      },
      droppedSourceCount: 1,
      mode: 'fast',
      searchCount: 3,
      costMicrousd: 21_500,
      model: 'served/model',
    });
  });

  it('keeps the billed cost on the error when the brief is rejected (DEV-185)', async () => {
    const [, last] = RESEARCH_STREAM_CHUNKS as [unknown, { usage: unknown }];
    const rejectedChunks = [
      {
        model: 'served/model',
        choices: [
          {
            index: 0,
            delta: { content: 'I could not find sources.' },
            finish_reason: 'stop',
          },
        ],
        usage: last.usage,
      },
    ];
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(toByteStream(toSseBody(rejectedChunks)), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const error = await runPlanResearch(
      { tier: 'starter', input: INPUT },
      { fetch: fetchMock },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(billedUsageOf(error)).toMatchObject({
      inputTokens: 900,
      outputTokens: 300,
      providerCostMicrousd: 21_500,
    });
  });
});
