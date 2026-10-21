import type { ResearchBrief } from '@/features/plans/research/contract';

import {
  toByteStream,
  toSseBody,
} from '../../../ai/providers/fixtures/openrouter-grounded-streams';
import {
  GROUNDED_PRESET_SLUGS,
  getGroundedModelRoute,
} from '@/features/ai/model-operation-policy';
import { ParserError } from '@/features/ai/parser';
import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import { readableStreamToAsyncIterable } from '@/features/ai/streaming/utils';
import { createGroundedOutlineProvider } from '@/features/plans/outline/grounded-writer';
import { runOutlineRepair } from '@/features/plans/outline/repair';
import {
  isOutlineVerifierAvailable,
  parseVerifierOutput,
  runOutlineVerifier,
} from '@/features/plans/outline/verifier';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PLAN_PRESET = 'atlaris-plan-test';

const INPUT = {
  topic: 'TypeScript generics',
  skillLevel: 'beginner',
  learningStyle: 'mixed',
  weeklyHours: 5,
} as const;

const RESEARCH: ResearchBrief = {
  brief: 'Start with type parameters [S1].',
  sources: [
    {
      key: 'S1',
      title: 'Generics',
      url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
      publisher: 'typescriptlang.org',
    },
  ],
};

const MODULES = [
  {
    title: 'Type parameters',
    estimatedMinutes: 60,
    tasks: [
      { title: 'Generic functions', estimatedMinutes: 30 },
      { title: 'Generic interfaces', estimatedMinutes: 30 },
    ],
  },
  {
    title: 'Constraints',
    estimatedMinutes: 60,
    tasks: [
      { title: 'extends constraints', estimatedMinutes: 30 },
      { title: 'keyof constraints', estimatedMinutes: 30 },
    ],
  },
];

/** A fixture SSE response whose content is `text`, split over two chunks. */
function textFetch(text: string) {
  const half = Math.floor(text.length / 2);
  const chunks = [
    {
      model: 'served/model',
      choices: [{ index: 0, delta: { content: text.slice(0, half) } }],
    },
    {
      model: 'served/model',
      choices: [
        {
          index: 0,
          delta: { content: text.slice(half) },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost: 0.001,
      },
    },
  ];
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(toByteStream(toSseBody(chunks)), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    ),
  );
}

function sentBody(fetchMock: ReturnType<typeof textFetch>) {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
    models: string[];
    messages: unknown[];
    response_format: unknown;
  };
}

function routeModels(
  tier: 'free' | 'starter' | 'pro',
  operation: Parameters<typeof getGroundedModelRoute>[1],
  slug: string,
) {
  return (getGroundedModelRoute(tier, operation) ?? []).map(
    (model) => `${model.modelId}@preset/${slug}`,
  );
}

async function readAll(stream: ReadableStream<string>): Promise<string> {
  let text = '';
  for await (const chunk of readableStreamToAsyncIterable(stream)) {
    text += chunk;
  }
  return text;
}

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'shared-key');
  vi.stubEnv('OPENROUTER_PLAN_PRESET', PLAN_PRESET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('grounded outline writer', () => {
  it('sends the brief, then the title-scope contract, through the plan preset', async () => {
    const fetchMock = textFetch(
      `Here you go:\n\`\`\`json\n${JSON.stringify({ modules: MODULES })}\n\`\`\``,
    );
    const provider = createGroundedOutlineProvider(
      { tier: 'pro', purpose: 'initial', research: RESEARCH },
      { fetch: fetchMock },
    );

    const { stream, metadata } = await provider.generate(INPUT);

    expect(JSON.parse(await readAll(stream))).toEqual({ modules: MODULES });
    expect(metadata.model).toBe('served/model');
    const body = sentBody(fetchMock);
    expect(body.models).toEqual(
      routeModels('pro', 'initial_outline', PLAN_PRESET),
    );
    expect(body.response_format).toEqual({ type: 'json_object' });
    const prompt = JSON.stringify(body.messages);
    expect(prompt).toContain('RESEARCH BRIEF');
    expect(prompt).toContain('[S1] Generics (typescriptlang.org)');
    expect(prompt).toContain('TITLE-SCOPE CONTRACT');
    expect(prompt.indexOf('RESEARCH BRIEF')).toBeLessThan(
      prompt.indexOf('TITLE-SCOPE CONTRACT'),
    );
  });

  it('runs with the contract and no brief when research was skipped', async () => {
    const fetchMock = textFetch(JSON.stringify({ modules: MODULES }));
    const provider = createGroundedOutlineProvider(
      { tier: 'free', purpose: 'regeneration', research: null },
      { fetch: fetchMock },
    );

    await provider.generate(INPUT);

    const body = sentBody(fetchMock);
    expect(body.models).toEqual(
      routeModels('free', 'regeneration', PLAN_PRESET),
    );
    const prompt = JSON.stringify(body.messages);
    expect(prompt).not.toContain('RESEARCH BRIEF');
    expect(prompt).toContain('TITLE-SCOPE CONTRACT');
    expect(prompt).toContain('TypeScript generics');
  });

  it('adds regeneration guidance after the contract', async () => {
    const fetchMock = textFetch(JSON.stringify({ modules: MODULES }));
    const provider = createGroundedOutlineProvider(
      {
        tier: 'pro',
        purpose: 'regeneration',
        research: RESEARCH,
        guidance: 'REGENERATION FEEDBACK: go deeper',
      },
      { fetch: fetchMock },
    );

    await provider.generate(INPUT);

    const prompt = JSON.stringify(sentBody(fetchMock).messages);
    expect(prompt.indexOf('TITLE-SCOPE CONTRACT')).toBeLessThan(
      prompt.indexOf('REGENERATION FEEDBACK: go deeper'),
    );
  });

  it('rejects output with no JSON object', async () => {
    const provider = createGroundedOutlineProvider(
      { tier: 'free', purpose: 'initial', research: null },
      { fetch: textFetch('Sorry, I cannot help with that.') },
    );

    await expect(provider.generate(INPUT)).rejects.toBeInstanceOf(
      ProviderInvalidResponseError,
    );
  });
});

describe('outline verifier', () => {
  it('is skipped on free and runs on starter and pro', () => {
    expect(isOutlineVerifierAvailable('free')).toBe(false);
    expect(isOutlineVerifierAvailable('starter')).toBe(true);
    expect(isOutlineVerifierAvailable('pro')).toBe(true);
  });

  it('refuses to run on free', async () => {
    const fetchMock = textFetch('{"issues":[]}');

    await expect(
      runOutlineVerifier(
        { tier: 'free', input: INPUT, modules: MODULES, research: null },
        { fetch: fetchMock },
      ),
    ).rejects.toThrow('not available for free');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the outline through the verifier preset and returns structured issues', async () => {
    const fetchMock = textFetch(
      JSON.stringify({
        issues: [
          {
            code: 'Overlapping Titles',
            blockRef: 'modules[1].tasks[1]',
            message: 'Repeats the previous lesson.',
          },
        ],
      }),
    );

    const run = await runOutlineVerifier(
      { tier: 'starter', input: INPUT, modules: MODULES, research: RESEARCH },
      { fetch: fetchMock },
    );

    expect(run).toEqual({
      issues: [
        {
          code: 'verifier.overlapping_titles',
          blockRef: 'modules[1].tasks[1]',
          message: 'Repeats the previous lesson.',
          source: 'verifier',
        },
      ],
      model: 'served/model',
    });
    const body = sentBody(fetchMock);
    expect(body.models).toEqual(
      routeModels('starter', 'outline_verify', GROUNDED_PRESET_SLUGS.verifier),
    );
    const prompt = JSON.stringify(body.messages);
    expect(prompt).toContain('OUTLINE (JSON)');
    expect(prompt).toContain('keyof constraints');
  });

  it('points refs outside the outline at the nearest block', () => {
    const issues = parseVerifierOutput(
      {
        issues: [
          { code: 'a', blockRef: 'modules[9]', message: 'x' },
          { code: 'b', blockRef: 'modules[0].tasks[9]', message: 'x' },
          { code: 'c', blockRef: 'the second module', message: 'x' },
          { code: 'd', message: 'x' },
        ],
      },
      MODULES,
    );

    expect(issues.map((issue) => issue.blockRef)).toEqual([
      'plan',
      'modules[0]',
      'plan',
      'plan',
    ]);
  });

  it('points a null ref at the plan', () => {
    const issues = parseVerifierOutput(
      { issues: [{ code: 'scope', blockRef: null, message: 'x' }] },
      MODULES,
    );

    expect(issues.map((issue) => issue.blockRef)).toEqual(['plan']);
  });

  it('rejects output that is not the issues contract', () => {
    expect(() => parseVerifierOutput({ problems: [] }, MODULES)).toThrow(
      ProviderInvalidResponseError,
    );
  });
});

describe('outline repair', () => {
  it('sends the outline and issues through the repair preset and returns the parsed outline', async () => {
    const repaired = [
      MODULES[0]!,
      { ...MODULES[1]!, title: 'Generic constraints' },
    ];
    const fetchMock = textFetch(JSON.stringify({ modules: repaired }));

    const run = await runOutlineRepair(
      {
        tier: 'pro',
        purpose: 'initial',
        input: INPUT,
        modules: MODULES,
        issues: [
          {
            code: 'off_topic_module',
            blockRef: 'modules[1]',
            message: 'Module "Constraints" does not mention the plan topic.',
            source: 'code',
          },
        ],
        research: RESEARCH,
      },
      { fetch: fetchMock },
    );

    expect(run.modules.map((module) => module.title)).toEqual([
      'Type parameters',
      'Generic constraints',
    ]);
    expect(run.model).toBe('served/model');
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = sentBody(fetchMock);
    expect(body.models).toEqual(
      routeModels('pro', 'initial_outline', GROUNDED_PRESET_SLUGS.repair),
    );
    const prompt = JSON.stringify(body.messages);
    expect(prompt).toContain('RESEARCH BRIEF');
    expect(prompt).toContain(
      '- [modules[1]] off_topic_module: Module \\"Constraints\\" does not mention the plan topic.',
    );
  });

  it('throws when the repaired outline fails validation', async () => {
    await expect(
      runOutlineRepair(
        {
          tier: 'free',
          purpose: 'initial',
          input: INPUT,
          modules: MODULES,
          issues: [],
          research: null,
        },
        { fetch: textFetch(JSON.stringify({ modules: [] })) },
      ),
    ).rejects.toBeInstanceOf(ParserError);
  });
});
