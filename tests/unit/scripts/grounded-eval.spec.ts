import type { LessonContent } from '@/shared/types/lesson-content.types';

import {
  BLIND_JUDGE_CODES,
  parseJudgeOutput,
} from '../../../scripts/eval/grounded/judge';
import {
  type ArmSummary,
  type ScoredLesson,
  type TierVerdictInput,
  classifyWorkflowSteps,
  evaluateTier,
  percentile,
  selectSpotCheck,
  stripCitations,
  summarizeArm,
} from '../../../scripts/eval/grounded/scoring';
import { planRequestBody } from '../../../scripts/eval/grounded/topics';
import { describe, expect, it } from 'vitest';

function lesson(
  arm: ScoredLesson['arm'],
  overrides: Partial<ScoredLesson> = {},
): ScoredLesson {
  return {
    arm,
    topicId: 't',
    taskId: `${arm}-${Math.random()}`,
    title: 'Lesson',
    codeIssues: [],
    judgeIssues: [],
    ...overrides,
  };
}

const issue = (code: string) => ({ code, message: code });

function arm(overrides: Partial<ArmSummary> = {}): ArmSummary {
  return {
    lessons: 10,
    unjudgedLessons: 0,
    codeIssues: 0,
    judgeIssues: 0,
    issuesPerLesson: 1,
    wrongOutputLessons: 0,
    ...overrides,
  };
}

function passingInput(
  overrides: Partial<TierVerdictInput> = {},
): TierVerdictInput {
  return {
    tier: 'pro',
    v15: arm({ issuesPerLesson: 2 }),
    grounded: arm({ issuesPerLesson: 1 }),
    groundedModules: [
      { moduleId: 'm1', status: 'ready', durationMs: 60_000 },
      { moduleId: 'm2', status: 'ready', durationMs: 200_000 },
    ],
    groundedPlansNotReady: 0,
    groundedPlanCostsUsd: [2, 2.5],
    spotCheck: { expected: 10, reviewed: 10, wrong: 0 },
    ...overrides,
  };
}

describe('stripCitations', () => {
  it('removes every marker form and sourceIds from all text fields', () => {
    const content: LessonContent = {
      version: 1,
      sourceIds: ['S1', 'S2'],
      blocks: [
        { type: 'heading', text: 'Ownership [S1]' },
        { type: 'paragraph', text: 'Moves transfer ownership [S1, S2]. Done.' },
        { type: 'example', title: 'Move [S2]', text: 'let b = a; [S1;S2]' },
        { type: 'practice', text: 'Try it [S3]' },
        { type: 'takeaways', items: ['One owner [S1]'] },
        { type: 'completion_criteria', items: ['Explain moves [S2]'] },
      ],
    };

    const stripped = stripCitations(content);

    expect(stripped).toEqual({
      version: 1,
      blocks: [
        { type: 'heading', text: 'Ownership' },
        { type: 'paragraph', text: 'Moves transfer ownership. Done.' },
        { type: 'example', title: 'Move', text: 'let b = a;' },
        { type: 'practice', text: 'Try it' },
        { type: 'takeaways', items: ['One owner'] },
        { type: 'completion_criteria', items: ['Explain moves'] },
      ],
    });
  });

  it('leaves ordinary brackets alone', () => {
    const content: LessonContent = {
      version: 1,
      blocks: [{ type: 'paragraph', text: 'xs[0] and [Sx] stay' }],
    };
    expect(stripCitations(content)).toEqual(content);
  });
});

describe('percentile', () => {
  it('uses nearest rank and handles empty input', () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(values, 95)).toBe(19);
    expect(percentile([3, 1, 2], 50)).toBe(2);
  });
});

describe('summarizeArm', () => {
  it('counts issues, unjudged lessons and wrong outputs', () => {
    const summary = summarizeArm([
      lesson('grounded', {
        codeIssues: [issue('length_budget')],
        judgeIssues: [issue('wrong_answer_key'), issue('unclear_explanation')],
      }),
      lesson('grounded', { judgeIssues: null }),
      lesson('grounded'),
    ]);

    expect(summary).toEqual({
      lessons: 3,
      unjudgedLessons: 1,
      codeIssues: 1,
      judgeIssues: 2,
      issuesPerLesson: 1,
      wrongOutputLessons: 1,
    });
  });
});

describe('evaluateTier', () => {
  it('passes when every bar has evidence and meets its target', () => {
    const verdict = evaluateTier(passingInput());
    expect(verdict.bars.map((b) => b.pass)).toEqual([true, true, true, true]);
    expect(verdict.pass).toBe(true);
  });

  it('stays pending until every spot-check lesson has a verdict', () => {
    expect(evaluateTier(passingInput({ spotCheck: null })).pass).toBeNull();
    expect(
      evaluateTier(
        passingInput({ spotCheck: { expected: 10, reviewed: 0, wrong: 0 } }),
      ).pass,
    ).toBeNull();
    expect(
      evaluateTier(
        passingInput({ spotCheck: { expected: 10, reviewed: 9, wrong: 0 } }),
      ).pass,
    ).toBeNull();
  });

  it('fails on any wrong output, from the judge or the spot-check', () => {
    expect(
      evaluateTier(
        passingInput({
          grounded: arm({ issuesPerLesson: 1, wrongOutputLessons: 1 }),
        }),
      ).pass,
    ).toBe(false);
    expect(
      evaluateTier(
        passingInput({ spotCheck: { expected: 10, reviewed: 3, wrong: 1 } }),
      ).pass,
    ).toBe(false);
  });

  it('fails the issue bar under a 50% reduction or with unjudged lessons', () => {
    const under = evaluateTier(
      passingInput({ grounded: arm({ issuesPerLesson: 1.1 }) }),
    );
    expect(under.bars[1]?.pass).toBe(false);

    const unjudged = evaluateTier(
      passingInput({ v15: arm({ issuesPerLesson: 2, unjudgedLessons: 1 }) }),
    );
    expect(unjudged.bars[1]?.pass).toBe(false);
  });

  it('cannot prove a reduction from a v15 baseline with no issues', () => {
    const verdict = evaluateTier(
      passingInput({
        v15: arm({ issuesPerLesson: 0 }),
        grounded: arm({ issuesPerLesson: 0 }),
      }),
    );
    expect(verdict.bars[1]?.pass).toBe(false);
  });

  it('fails latency on a slow p95 or any failed module', () => {
    const slow = evaluateTier(
      passingInput({
        groundedModules: [
          { moduleId: 'm', status: 'ready', durationMs: 241_000 },
        ],
      }),
    );
    expect(slow.bars[2]?.pass).toBe(false);

    const failed = evaluateTier(
      passingInput({
        groundedModules: [
          { moduleId: 'm1', status: 'ready', durationMs: 60_000 },
          { moduleId: 'm2', status: 'failed', durationMs: 60_000 },
        ],
      }),
    );
    expect(failed.bars[2]?.pass).toBe(false);
  });

  it('fails latency when a plan never reached its modules', () => {
    const verdict = evaluateTier(passingInput({ groundedPlansNotReady: 1 }));
    expect(verdict.bars[2]?.pass).toBe(false);
    expect(verdict.pass).toBe(false);
  });

  it('fails cost over the tier cap or with an unmeasured plan', () => {
    expect(
      evaluateTier(passingInput({ groundedPlanCostsUsd: [2.51] })).bars[3]
        ?.pass,
    ).toBe(false);
    expect(
      evaluateTier(passingInput({ groundedPlanCostsUsd: [1, null] })).bars[3]
        ?.pass,
    ).toBe(false);
    expect(
      evaluateTier(passingInput({ tier: 'free', groundedPlanCostsUsd: [0.06] }))
        .bars[3]?.pass,
    ).toBe(false);
  });
});

describe('selectSpotCheck', () => {
  const lessons = [
    ...Array.from({ length: 15 }, (_, i) => lesson('v15', { taskId: `v${i}` })),
    ...Array.from({ length: 15 }, (_, i) =>
      lesson('grounded', { taskId: `g${i}` }),
    ),
  ];

  it('takes ten per arm under neutral ids, reproducibly', () => {
    const sheet = selectSpotCheck(lessons, 'pro');
    expect(sheet).toHaveLength(20);
    expect(sheet.filter((s) => s.lesson.arm === 'grounded')).toHaveLength(10);
    expect(sheet[0]?.id).toBe('L01');
    expect(selectSpotCheck(lessons, 'pro').map((s) => s.lesson.taskId)).toEqual(
      sheet.map((s) => s.lesson.taskId),
    );
  });
});

describe('parseJudgeOutput', () => {
  it('reads fenced JSON and rejects unknown codes', () => {
    const text =
      '```json\n{"issues":[{"code":"wrong_answer_key","message":"Q2 key is 4, should be 5"}]}\n```';
    expect(parseJudgeOutput(text, BLIND_JUDGE_CODES)).toEqual([
      { code: 'wrong_answer_key', message: 'Q2 key is 4, should be 5' },
    ]);
    expect(() =>
      parseJudgeOutput(
        '{"issues":[{"code":"made_up","message":"x"}]}',
        BLIND_JUDGE_CODES,
      ),
    ).toThrow(/invalid_value|Invalid/);
  });
});

describe('planRequestBody', () => {
  it('sends the same span and hours for every topic', () => {
    const body = planRequestBody(
      {
        id: 'x',
        domain: 'code',
        topic: 'Rust ownership',
        skillLevel: 'intermediate',
      },
      new Date('2026-10-21T15:00:00Z'),
    );
    expect(body).toEqual({
      topic: 'Rust ownership',
      skillLevel: 'intermediate',
      weeklyHours: 4,
      learningStyle: 'mixed',
      startDate: '2026-10-21',
      deadlineDate: '2026-11-04',
    });
  });
});

describe('classifyWorkflowSteps', () => {
  const attempt = (
    start: string,
    end: string,
    success: boolean,
    error?: { name: string; message: string },
  ) => ({
    start: `2026-10-21T22:${start}Z`,
    end: `2026-10-21T22:${end}Z`,
    success,
    error,
  });

  it('reads an aborted generate call as a timeout', () => {
    expect(
      classifyWorkflowSteps(
        [
          { name: 'claim-1', attempts: [attempt('44:01', '44:02', true)] },
          {
            name: 'generate-1',
            attempts: [
              attempt('44:02', '46:02', false, {
                name: 'AbortError',
                message: 'The operation was aborted',
              }),
            ],
          },
          { name: 'fail-1', attempts: [attempt('46:02', '46:03', true)] },
        ],
        true,
      ),
    ).toEqual({ failureCause: 'timeout', longestCallMs: 120_000 });
  });

  it('reads a failed parse step as a parse failure', () => {
    expect(
      classifyWorkflowSteps(
        [
          { name: 'generate-1', attempts: [attempt('44:00', '45:00', true)] },
          {
            name: 'parse-commit-1',
            attempts: [
              attempt('45:00', '45:01', false, {
                name: 'Error',
                message: 'schema mismatch',
              }),
            ],
          },
        ],
        true,
      ),
    ).toEqual({ failureCause: 'parse', longestCallMs: 60_000 });
  });

  it('records only the longest call for a ready module', () => {
    expect(
      classifyWorkflowSteps(
        [{ name: 'generate-1', attempts: [attempt('46:14', '47:44', true)] }],
        false,
      ),
    ).toEqual({ longestCallMs: 90_000 });
  });
});
