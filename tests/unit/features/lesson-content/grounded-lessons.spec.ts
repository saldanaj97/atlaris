import type { ModuleLessonBatchPromptInput } from '@/features/lesson-content/module-lesson-prompts';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { PlanResearchWithSources } from '@/lib/db/queries/types/plan-research.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type {
  LessonContent,
  LessonContentBlock,
} from '@/shared/types/lesson-content.types';

import { ParserError } from '@/features/ai/parser';
import { sumUsages } from '@/features/ai/usage';
import { buildGroundedLessonPromptParts } from '@/features/lesson-content/grounded-lesson-prompt';
import {
  parseGroundedLessonText,
  toLessonResearch,
} from '@/features/lesson-content/grounded-lesson-writer';
import {
  checkLessonCitations,
  citedSourceIds,
} from '@/features/lesson-content/lesson-citation-checks';
import { LessonContentSchema } from '@/shared/schemas/lesson-content.schemas';
import { describe, expect, it } from 'vitest';

const TASK_A = '3e8b5f4a-9c7d-4b6e-8f1a-0d9e8f7a6b52';
const TASK_B = '4f9c6a5b-0d8e-4c7f-9a2b-1e0f9a8b7c63';
const TASK_C = '5a0d7b6c-1e9f-4d8a-8b3c-2f1a0b9c8d74';

const research: ResearchBrief = {
  brief: 'TypeScript adds static types to JavaScript [S1].',
  sources: [
    {
      key: 'S1',
      title: 'TypeScript Handbook',
      url: 'https://www.typescriptlang.org/docs/handbook/',
      publisher: 'typescriptlang.org',
    },
    {
      key: 'S2',
      title: 'MDN JavaScript',
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
      publisher: 'MDN',
    },
  ],
};

const promptInput: ModuleLessonBatchPromptInput = {
  plan: {
    topic: 'TypeScript',
    skillLevel: 'beginner',
    learningStyle: 'mixed',
  },
  module: { title: 'Basics', description: 'Types and values', order: 1 },
  tasks: [TASK_A, TASK_B, TASK_C].map((taskId, index) => ({
    taskId,
    order: index + 1,
    title: `Lesson ${String(index + 1)}`,
    description: `About part ${String(index + 1)}`,
    estimatedMinutes: 10 + index,
    hasMicroExplanation: false,
  })),
};

function content(...blocks: LessonContentBlock[]): LessonContent {
  return { version: 1, blocks };
}

function lessonText(taskId: string, blocks: LessonContentBlock[]): string {
  return JSON.stringify({
    version: 1,
    tasks: [{ taskId, content: content(...blocks) }],
  });
}

describe('checkLessonCitations', () => {
  it('passes known keys, including several in one bracket', () => {
    const lesson = content(
      { type: 'paragraph', text: 'Types catch bugs [S1].' },
      { type: 'takeaways', items: ['Both agree [S1, S2].'] },
    );
    expect(checkLessonCitations(lesson, research)).toEqual([]);
  });

  it('flags a key that is not one of the plan sources at its block', () => {
    const lesson = content(
      { type: 'heading', text: 'Intro' },
      { type: 'takeaways', items: ['Fine [S1]', 'Made up [S7]'] },
    );
    expect(checkLessonCitations(lesson, research)).toEqual([
      expect.objectContaining({
        code: 'unknown_source',
        blockRef: 'blocks[1].items[1]',
        source: 'code',
      }),
    ]);
  });

  it('flags raw URLs, with or without a scheme', () => {
    const lesson = content(
      { type: 'paragraph', text: 'See https://example.com/docs.' },
      { type: 'example', title: 'Link', text: 'Visit www.example.com' },
    );
    expect(
      checkLessonCitations(lesson, research).map((issue) => [
        issue.code,
        issue.blockRef,
      ]),
    ).toEqual([
      ['raw_url', 'blocks[0]'],
      ['raw_url', 'blocks[1]'],
    ]);
  });

  it('flags any citation when the plan has no brief', () => {
    const lesson = content({ type: 'practice', text: 'Try it [S1].' });
    expect(checkLessonCitations(lesson, null)).toEqual([
      expect.objectContaining({
        code: 'citation_without_brief',
        blockRef: 'blocks[0]',
      }),
    ]);
    expect(
      checkLessonCitations(
        content({ type: 'paragraph', text: 'No sources here.' }),
        null,
      ),
    ).toEqual([]);
  });

  it('checks sourceIds keys the body does not cite', () => {
    const lesson = {
      ...content({ type: 'paragraph', text: 'Cited [S1].' }),
      sourceIds: ['S1', 'S9'],
    };
    expect(checkLessonCitations(lesson, research)).toEqual([
      expect.objectContaining({
        code: 'unknown_source',
        blockRef: 'sourceIds',
      }),
    ]);
  });
});

describe('citedSourceIds', () => {
  it('lists unique keys in order of first appearance', () => {
    expect(
      citedSourceIds([
        { type: 'paragraph', text: 'A [S2] then [S1; S2].' },
        { type: 'completion_criteria', items: ['B [S3]', 'C [S1]'] },
      ]),
    ).toEqual(['S2', 'S1', 'S3']);
  });
});

describe('LessonContentSchema sourceIds', () => {
  it('stays optional and rejects malformed or duplicate keys', () => {
    const base = content({ type: 'heading', text: 'Hi' });
    expect(LessonContentSchema.safeParse(base).success).toBe(true);
    expect(
      LessonContentSchema.safeParse({ ...base, sourceIds: [] }).success,
    ).toBe(true);
    expect(
      LessonContentSchema.safeParse({ ...base, sourceIds: ['S0'] }).success,
    ).toBe(false);
    expect(
      LessonContentSchema.safeParse({ ...base, sourceIds: ['S1', 'S1'] })
        .success,
    ).toBe(false);
  });
});

describe('buildGroundedLessonPromptParts', () => {
  it('orders brief, module outline, then lesson task, caching the prefix', () => {
    const parts = buildGroundedLessonPromptParts({
      promptInput,
      taskIndex: 1,
      research,
    });
    expect(parts.map((part) => part.cache === true)).toEqual([
      true,
      true,
      false,
    ]);
    expect(parts[0]?.text).toContain('RESEARCH BRIEF');
    expect(parts[0]?.text).toContain('[S2] MDN JavaScript (MDN)');
    expect(parts[0]?.text).not.toContain('https://');
    expect(parts[1]?.text).toContain('MODULE OUTLINE');
    expect(parts[1]?.text).toContain('3. Lesson 3 (12 min)');
    expect(parts[2]?.text).toContain(`taskId: ${TASK_B}`);
    expect(parts[2]?.text).toContain('write lesson 2 of 3');
  });

  it('keeps an identical cached prefix for every lesson in the module', () => {
    const prefixes = promptInput.tasks.map((_task, taskIndex) =>
      buildGroundedLessonPromptParts({ promptInput, taskIndex, research })
        .filter((part) => part.cache)
        .map((part) => part.text),
    );
    expect(prefixes[1]).toEqual(prefixes[0]);
    expect(prefixes[2]).toEqual(prefixes[0]);
    const tasks = promptInput.tasks.map(
      (_task, taskIndex) =>
        buildGroundedLessonPromptParts({ promptInput, taskIndex, research }).at(
          -1,
        )?.text,
    );
    expect(new Set(tasks).size).toBe(3);
  });

  it('drops the brief and forbids citations when the plan has no brief', () => {
    const parts = buildGroundedLessonPromptParts({
      promptInput,
      taskIndex: 0,
      research: null,
    });
    expect(parts).toHaveLength(2);
    expect(parts[0]?.cache).toBe(true);
    expect(parts[0]?.text).toContain('has no research sources');
    expect(parts.some((part) => part.text.includes('RESEARCH BRIEF'))).toBe(
      false,
    );
  });

  it('puts an uncached reason after the outline and before the task', () => {
    const parts = buildGroundedLessonPromptParts({
      promptInput,
      taskIndex: 0,
      research,
      reason: 'REGENERATION REASON: too shallow',
    });
    expect(parts.map((part) => part.cache === true)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(parts[2]?.text).toBe('REGENERATION REASON: too shallow');
  });
});

describe('parseGroundedLessonText', () => {
  it('derives sourceIds from the body, ignoring the model value', () => {
    const raw = JSON.stringify({
      version: 1,
      tasks: [
        {
          taskId: TASK_A,
          content: {
            version: 1,
            blocks: [{ type: 'paragraph', text: 'Types [S2] help [S1].' }],
            sourceIds: ['S1'],
          },
        },
      ],
    });
    expect(
      parseGroundedLessonText(`Here you go:\n${raw}`, TASK_A, research).content
        .sourceIds,
    ).toEqual(['S2', 'S1']);
  });

  it('returns an empty sourceIds list for a lesson that cites nothing', () => {
    const raw = lessonText(TASK_A, [{ type: 'heading', text: 'Hi' }]);
    expect(
      parseGroundedLessonText(raw, TASK_A, null).content.sourceIds,
    ).toEqual([]);
  });

  it('throws a validation ParserError for citation issues', () => {
    const raw = lessonText(TASK_A, [{ type: 'paragraph', text: 'X [S1].' }]);
    expect(() => parseGroundedLessonText(raw, TASK_A, null)).toThrow(
      expect.objectContaining({
        kind: 'validation',
        message: expect.stringContaining('citation_without_brief at blocks[0]'),
      }),
    );
  });

  it('throws invalid_json when the text has no JSON object', () => {
    expect(() =>
      parseGroundedLessonText('no json here', TASK_A, research),
    ).toThrow(ParserError);
    try {
      parseGroundedLessonText('no json here', TASK_A, research);
    } catch (error) {
      expect((error as ParserError).kind).toBe('invalid_json');
    }
  });

  it('assigns the claimed taskId, as the batch parser does by position', () => {
    const raw = lessonText(TASK_B, [{ type: 'heading', text: 'Hi' }]);
    expect(parseGroundedLessonText(raw, TASK_A, research).taskId).toBe(TASK_A);
  });

  it('rejects a response with more than one lesson', () => {
    const block = { type: 'heading', text: 'Hi' };
    const raw = JSON.stringify({
      version: 1,
      tasks: [TASK_A, TASK_B].map((taskId) => ({
        taskId,
        content: { version: 1, blocks: [block] },
      })),
    });
    expect(() => parseGroundedLessonText(raw, TASK_A, research)).toThrow(
      ParserError,
    );
  });
});

describe('sumUsages', () => {
  const usage = (over: Partial<CanonicalAIUsage> = {}): CanonicalAIUsage => ({
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    model: 'model-a',
    provider: 'openrouter',
    estimatedCostCents: 2,
    providerCostMicrousd: 1_000,
    isPartial: false,
    missingFields: [],
    ...over,
  });

  it('sums tokens and costs', () => {
    expect(sumUsages([usage(), usage()])).toMatchObject({
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      estimatedCostCents: 4,
      providerCostMicrousd: 2_000,
      isPartial: false,
      model: 'model-a',
    });
  });

  it('counts the estimate of a lesson without a provider cost and merges gaps', () => {
    expect(
      sumUsages([
        usage(),
        usage({
          providerCostMicrousd: null,
          isPartial: true,
          missingFields: ['model'],
        }),
      ]),
    ).toMatchObject({
      // 1_000 reported, plus the other call's 2-cent estimate (DEV-185).
      providerCostMicrousd: 21_000,
      isPartial: true,
      missingFields: ['model'],
    });
  });
});

describe('toLessonResearch', () => {
  const row = (
    over: Partial<PlanResearchWithSources['research']> = {},
  ): PlanResearchWithSources => ({
    research: {
      id: 'r1',
      planId: 'p1',
      brief: 'Brief [S1].',
      mode: 'fast',
      status: 'ok',
      searchCount: 1,
      costMicrousd: null,
      createdAt: new Date('2026-10-20T00:00:00Z'),
      ...over,
    },
    sources: [
      {
        id: 's1',
        researchId: 'r1',
        citationKey: 'S1',
        url: 'https://www.example.com/a',
        title: 'Example',
        publisher: null,
        retrievedAt: new Date('2026-10-20T00:00:00Z'),
      },
    ],
  });

  it('maps an ok run, falling back to the URL host for the publisher', () => {
    expect(toLessonResearch(row())).toEqual({
      brief: 'Brief [S1].',
      sources: [
        {
          key: 'S1',
          title: 'Example',
          url: 'https://www.example.com/a',
          publisher: 'example.com',
        },
      ],
    });
  });

  it('treats no run, a skipped run, or no sources as no brief', () => {
    expect(toLessonResearch(null)).toBeNull();
    expect(toLessonResearch(row({ status: 'failed_skipped' }))).toBeNull();
    expect(toLessonResearch({ ...row(), sources: [] })).toBeNull();
  });
});
