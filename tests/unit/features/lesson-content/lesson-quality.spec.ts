import type { LessonIssue } from '@/features/lesson-content/lesson-citation-checks';
import type { ModuleLessonBatchPromptInput } from '@/features/lesson-content/module-lesson-prompts';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type {
  LessonContent,
  LessonContentBlock,
} from '@/shared/types/lesson-content.types';

import {
  toByteStream,
  toSseBody,
} from '../../ai/providers/fixtures/openrouter-grounded-streams';
import { billedUsageOf } from '@/features/ai/usage';
import { runLessonCodeChecks } from '@/features/lesson-content/lesson-checks';
import { toLessonQualityRecords } from '@/features/lesson-content/lesson-quality-issues';
import {
  applyLessonRepairOutput,
  buildLessonRepairUserParts,
  lessonAdvisorTool,
  lessonRepairScope,
} from '@/features/lesson-content/lesson-repair';
import {
  buildLessonVerifierUserParts,
  isLessonVerifierAvailable,
  parseLessonVerifierOutput,
  runLessonVerifier,
} from '@/features/lesson-content/lesson-verifier';
import { afterEach, describe, expect, it, vi } from 'vitest';

const research: ResearchBrief = {
  brief: 'Static types catch mistakes early [S1].',
  sources: [
    {
      key: 'S1',
      title: 'TypeScript Handbook',
      url: 'https://www.typescriptlang.org/docs/handbook/',
      publisher: 'typescriptlang.org',
    },
  ],
};

const TAKEAWAYS: LessonContentBlock = {
  type: 'takeaways',
  items: ['Types: they catch mistakes early.', 'Inference saves typing.'],
};
const CRITERIA: LessonContentBlock = {
  type: 'completion_criteria',
  items: ['Explain what a type is.'],
};

function lesson(...blocks: LessonContentBlock[]): LessonContent {
  return { version: 1, blocks };
}

function clean(...extra: LessonContentBlock[]): LessonContent {
  return lesson(
    { type: 'paragraph', text: 'Types describe values [S1].' },
    ...extra,
    TAKEAWAYS,
    CRITERIA,
  );
}

function check(content: LessonContent, estimatedMinutes = 10) {
  return runLessonCodeChecks(content, { estimatedMinutes, research });
}

function codes(issues: readonly LessonIssue[]) {
  return issues.map((issue) => `${issue.code}@${issue.blockRef}`);
}

describe('runLessonCodeChecks', () => {
  it('passes a well-formed lesson', () => {
    expect(check(clean())).toEqual([]);
  });

  it('reports schema violations by block and nothing else', () => {
    const content = lesson(
      { type: 'paragraph', text: 'x'.repeat(12_001) },
      { type: 'takeaways', items: [] },
    );
    expect(codes(check(content))).toEqual([
      'schema_invalid@blocks[0]',
      'schema_invalid@blocks[1]',
    ]);
  });

  it('requires completion criteria and takeaways', () => {
    const content = lesson({ type: 'paragraph', text: 'Types [S1].' });
    expect(codes(check(content))).toEqual([
      'missing_completion_criteria@lesson',
      'missing_takeaways@lesson',
    ]);
  });

  it.each([
    ['   ', 'takeaway_blank'],
    ['- Types catch mistakes.', 'takeaway_list_marker'],
    ['2) Types catch mistakes.', 'takeaway_list_marker'],
    ['**Types**:', 'takeaway_label_malformed'],
    ['**Types: they catch mistakes.', 'takeaway_label_malformed'],
  ])('flags the takeaway %j as %s', (item, code) => {
    const content = lesson(
      { type: 'paragraph', text: 'Types [S1].' },
      { type: 'takeaways', items: ['Fine: a full takeaway.', item] },
      CRITERIA,
    );
    expect(codes(check(content))).toEqual([`${code}@blocks[1].items[1]`]);
  });

  it('flags a repeated takeaway', () => {
    const content = lesson(
      { type: 'paragraph', text: 'Types [S1].' },
      { type: 'takeaways', items: ['Types help.', ' types help. '] },
      CRITERIA,
    );
    expect(codes(check(content))).toEqual([
      'takeaway_duplicate@blocks[1].items[1]',
    ]);
  });

  it('accepts an aligned table', () => {
    const table = '| Type | Example |\n| --- | :---: |\n| string | "a" |';
    expect(
      check(clean({ type: 'example', title: 'Table', text: table })),
    ).toEqual([]);
  });

  it.each([
    [
      '| Type | Example |\n| --- | --- |\n| string | "a" | extra |',
      'table_column_mismatch',
    ],
    ['| Type | Example |\n| string | "a" |', 'table_missing_separator'],
    [
      '| Type | Example |\n| --- | --- |\n| string | "a"',
      'table_border_misaligned',
    ],
  ])('flags the table %j as %s', (table, code) => {
    expect(codes(check(clean({ type: 'paragraph', text: table })))).toEqual([
      `${code}@blocks[1]`,
    ]);
  });

  it('flags a lesson far over its length budget', () => {
    const long = clean({ type: 'paragraph', text: 'x'.repeat(4_000) });
    expect(codes(check(long, 10))).toEqual(['over_length_budget@lesson']);
    expect(check(long, 30)).toEqual([]);
  });

  it('includes the citation checks', () => {
    const content = clean({ type: 'paragraph', text: 'Made up [S9].' });
    expect(codes(check(content))).toEqual(['unknown_source@blocks[1]']);
  });
});

const promptInput: ModuleLessonBatchPromptInput = {
  plan: { topic: 'TypeScript', skillLevel: 'beginner', learningStyle: 'mixed' },
  module: { title: 'Basics', description: null, order: 1 },
  tasks: [
    {
      taskId: '3e8b5f4a-9c7d-4b6e-8f1a-0d9e8f7a6b52',
      order: 1,
      title: 'Types',
      estimatedMinutes: 10,
    },
    {
      taskId: '4f9c6a5b-0d8e-4c7f-9a2b-1e0f9a8b7c63',
      order: 2,
      title: 'Inference',
      estimatedMinutes: 10,
    },
  ],
};

describe('lesson verifier', () => {
  it('runs on starter and pro only', () => {
    expect(isLessonVerifierAvailable('free')).toBe(false);
    expect(isLessonVerifierAvailable('starter')).toBe(true);
    expect(isLessonVerifierAvailable('pro')).toBe(true);
  });

  it('namespaces codes and keeps refs inside the lesson', () => {
    const issues = parseLessonVerifierOutput(
      {
        issues: [
          { code: 'Title Mismatch', blockRef: 'blocks[0]', message: 'a' },
          { code: 'answer_key', blockRef: 'blocks[1].items[0]', message: 'b' },
          { code: 'x', blockRef: 'blocks[1].items[9]', message: 'c' },
          { code: 'x', blockRef: 'blocks[7]', message: 'd' },
          { code: 'x', blockRef: null, message: 'e' },
        ],
      },
      clean(),
    );
    expect(codes(issues)).toEqual([
      'verifier.title_mismatch@blocks[0]',
      'verifier.answer_key@blocks[1].items[0]',
      'verifier.x@blocks[1]',
      'verifier.x@lesson',
      'verifier.x@lesson',
    ]);
    expect(issues.every((issue) => issue.source === 'verifier')).toBe(true);
  });

  it('rejects output without an issues list', () => {
    expect(() => parseLessonVerifierOutput({ ok: true }, clean())).toThrow(
      /did not match/,
    );
  });

  describe('a rejected call', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('keeps its billed cost on the error (DEV-185)', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', 'shared-key');
      const chunks = [
        {
          model: 'served/model',
          choices: [
            {
              index: 0,
              delta: { content: JSON.stringify({ ok: true }) },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 400,
            completion_tokens: 80,
            total_tokens: 480,
            cost: 0.0042,
          },
        },
      ];
      const fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(toByteStream(toSseBody(chunks)), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        ),
      );

      const error = await runLessonVerifier(
        {
          tier: 'starter',
          planId: 'plan-1',
          pickedModelId: null,
          promptInput,
          taskIndex: 0,
          content: clean(),
          research,
        },
        { fetch: fetchMock },
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect(billedUsageOf(error)).toMatchObject({
        inputTokens: 400,
        outputTokens: 80,
        providerCostMicrousd: 4_200,
      });
    });
  });

  it('sends the cached brief and outline, then the lesson', () => {
    const parts = buildLessonVerifierUserParts({
      promptInput,
      taskIndex: 1,
      content: clean(),
      research,
    });
    expect(parts.map((part) => part.cache ?? false)).toEqual([
      true,
      true,
      false,
    ]);
    expect(parts[2]?.text).toContain('lesson 2 of 2');
    expect(parts[2]?.text).toContain('Types describe values [S1].');
  });
});

describe('lesson repair', () => {
  const blockIssue: LessonIssue = {
    code: 'verifier.title_mismatch',
    blockRef: 'blocks[0]',
    message: 'm',
    source: 'verifier',
  };
  const lessonIssue: LessonIssue = {
    code: 'missing_completion_criteria',
    blockRef: 'lesson',
    message: 'm',
    source: 'code',
  };

  it('repairs only flagged blocks unless an issue covers the lesson', () => {
    expect(
      lessonRepairScope([
        blockIssue,
        { ...blockIssue, blockRef: 'blocks[2].items[0]' },
      ]),
    ).toEqual({ kind: 'blocks', indices: [0, 2] });
    expect(lessonRepairScope([blockIssue, lessonIssue])).toEqual({
      kind: 'lesson',
    });
  });

  it('applies patches to flagged blocks only and recomputes sourceIds', () => {
    const repaired = applyLessonRepairOutput(
      {
        blocks: [
          { index: 0, block: { type: 'paragraph', text: 'Fixed [S1].' } },
          { index: 1, block: { type: 'paragraph', text: 'Not flagged.' } },
        ],
      },
      clean(),
      { kind: 'blocks', indices: [0] },
    );
    expect(repaired.blocks[0]).toEqual({
      type: 'paragraph',
      text: 'Fixed [S1].',
    });
    expect(repaired.blocks[1]).toEqual(TAKEAWAYS);
    expect(repaired.sourceIds).toEqual(['S1']);
  });

  it('replaces the whole lesson for a lesson-level repair', () => {
    const repaired = applyLessonRepairOutput(
      { blocks: [{ type: 'paragraph', text: 'New.' }, CRITERIA] },
      clean(),
      { kind: 'lesson' },
    );
    expect(repaired.blocks).toEqual([
      { type: 'paragraph', text: 'New.' },
      CRITERIA,
    ]);
    expect(repaired.sourceIds).toEqual([]);
  });

  it('rejects output in the wrong shape', () => {
    expect(() =>
      applyLessonRepairOutput({ blocks: [{ type: 'paragraph' }] }, clean(), {
        kind: 'blocks',
        indices: [0],
      }),
    ).toThrow(/did not match/);
  });

  it('adds the advisor on paid tiers only', () => {
    expect(lessonAdvisorTool('free', null)).toBeNull();
    expect(lessonAdvisorTool('starter', null)).toMatchObject({
      type: 'advisor',
      model: 'openai/gpt-6.1-sol',
    });
    expect(lessonAdvisorTool('pro', null)).toMatchObject({
      type: 'advisor',
      model: 'anthropic/claude-opus-5.5',
    });
  });

  it('leads the advisor with a Pro pick in its catalog only', () => {
    expect(
      lessonAdvisorTool('pro', 'anthropic/claude-haiku-5.5'),
    ).toMatchObject({ model: 'anthropic/claude-haiku-5.5' });
    expect(lessonAdvisorTool('pro', 'not/a-model')).toMatchObject({
      model: 'anthropic/claude-opus-5.5',
    });
    expect(
      lessonAdvisorTool('starter', 'anthropic/claude-haiku-5.5'),
    ).toMatchObject({ model: 'openai/gpt-6.1-sol' });
  });

  it('asks for flagged blocks only in a block repair', () => {
    const parts = buildLessonRepairUserParts({
      promptInput,
      taskIndex: 0,
      content: clean(),
      issues: [blockIssue],
      research: null,
    });
    expect(parts).toHaveLength(2);
    expect(parts[1]?.text).toContain('[blocks[0]] verifier.title_mismatch');
    expect(parts[1]?.text).toContain(
      'Rewrite only the flagged blocks (blocks[0])',
    );
  });
});

describe('toLessonQualityRecords', () => {
  const ids = { planId: 'p', moduleId: 'm', taskId: 't' };
  const code = (blockRef: string): LessonIssue => ({
    code: 'missing_takeaways',
    blockRef,
    message: 'm',
    source: 'code',
  });
  const verifier: LessonIssue = {
    code: 'verifier.answer_key',
    blockRef: 'blocks[2]',
    message: 'm',
    source: 'verifier',
  };

  it('records each issue once at its first pass, resolved when gone from the shipped lesson', () => {
    const records = toLessonQualityRecords(ids, [
      { pass: 0, issues: [code('lesson'), verifier], verifierRan: true },
      { pass: 1, issues: [verifier, code('blocks[1]')], verifierRan: true },
      { pass: 2, issues: [code('blocks[1]')], verifierRan: true },
    ]);
    expect(
      records.map((row) => [
        row.issueCode,
        row.blockRef,
        row.pass,
        row.resolved,
      ]),
    ).toEqual([
      ['missing_takeaways', 'lesson', 0, true],
      ['verifier.answer_key', 'blocks[2]', 0, true],
      ['missing_takeaways', 'blocks[1]', 1, false],
    ]);
    expect(records[0]).toMatchObject({ ...ids, stage: 'lesson' });
  });

  it('leaves verifier issues unresolved when the verifier skipped the shipped lesson', () => {
    const records = toLessonQualityRecords(ids, [
      { pass: 0, issues: [code('lesson'), verifier], verifierRan: true },
      { pass: 1, issues: [], verifierRan: false },
    ]);
    expect(records.map((row) => row.resolved)).toEqual([true, false]);
  });

  it('leaves everything unresolved when no repair was kept', () => {
    const records = toLessonQualityRecords(ids, [
      { pass: 0, issues: [code('lesson')], verifierRan: false },
    ]);
    expect(records.map((row) => row.resolved)).toEqual([false]);
  });
});
