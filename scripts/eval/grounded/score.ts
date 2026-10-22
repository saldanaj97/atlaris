import type { Manifest, ManifestPlan, ManifestTask } from './run';
import type {
  EvalArm,
  ScoredIssue,
  ScoredLesson,
  SpotCheckResult,
} from './scoring';
/**
 * Scores one tier's two eval arms (JCS-163) and writes the report and the
 * blind spot-check sheet. Run after `run.ts collect` has both manifests.
 *
 *   pnpm exec tsx scripts/eval/grounded/score.ts --tier pro
 *
 * Judge verdicts are cached next to the manifests, so a rerun only judges
 * lessons it has not seen. See docs/testing/grounded-eval.md.
 */
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { LessonContent } from '@/shared/types/lesson-content.types';

import {
  BLIND_JUDGE_CODES,
  BRIEF_JUDGE_CODES,
  DEFAULT_JUDGE_MODEL,
  blindJudgeMessages,
  briefJudgeMessages,
  runJudge,
  type JudgeClient,
  type JudgeContext,
} from './judge';
import {
  CITATION_CHECK_CODES,
  evaluateTier,
  selectSpotCheck,
  stripCitations,
  summarizeArm,
  summarizeReliability,
} from './scoring';
import { EVAL_TOPICS } from './topics';
import { runLessonCodeChecks } from '@/features/lesson-content/lesson-checks';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const JUDGE_CONCURRENCY = 4;

type JudgeCache = Record<string, ScoredIssue[]>;

type LessonRow = {
  readonly arm: EvalArm;
  readonly plan: ManifestPlan;
  readonly task: ManifestTask & { readonly lessonContent: LessonContent };
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function lessonRows(manifest: Manifest): LessonRow[] {
  return manifest.plans.flatMap((plan) =>
    plan.tasks.flatMap((task) =>
      task.lessonContent
        ? [
            {
              arm: manifest.arm,
              plan,
              task: { ...task, lessonContent: task.lessonContent },
            },
          ]
        : [],
    ),
  );
}

function judgeContext(row: LessonRow): JudgeContext {
  const topic = EVAL_TOPICS.find((t) => t.id === row.plan.topicId);
  return {
    planTopic: topic?.topic ?? row.plan.topicId,
    skillLevel: topic?.skillLevel ?? 'unknown',
    moduleTitle: row.task.moduleTitle,
    taskTitle: row.task.title,
    estimatedMinutes: row.task.estimatedMinutes,
  };
}

/** Runs `work` over `items`, `limit` at a time. */
async function mapLimited<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++]!;
        await work(item);
      }
    }),
  );
}

/** Judges uncached lessons; a failed call stays uncached and counts as unjudged. */
async function judgeAll(
  rows: readonly LessonRow[],
  cachePath: string,
  key: (row: LessonRow) => string,
  call: (row: LessonRow) => Promise<ScoredIssue[]>,
): Promise<JudgeCache> {
  const cache: JudgeCache = existsSync(cachePath) ? readJson(cachePath) : {};
  const pending = rows.filter((row) => !(key(row) in cache));
  await mapLimited(pending, JUDGE_CONCURRENCY, async (row) => {
    try {
      cache[key(row)] = await call(row);
      writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
    } catch (error) {
      console.error(
        `judge failed for ${row.arm} ${row.task.taskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
  return cache;
}

function countCodes(issues: readonly ScoredIssue[]): string {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
  }
  return counts.size === 0
    ? 'none'
    : [...counts].map(([code, n]) => `${code} ×${n}`).join(', ');
}

function readSpotCheck(
  path: string | undefined,
  keyPath: string,
): SpotCheckResult {
  if (!path) {
    return null;
  }
  const verdicts = readJson<Record<string, unknown>>(path);
  const key = readJson<Record<string, { arm: EvalArm }>>(keyPath);
  const groundedIds = Object.keys(key).filter(
    (id) => key[id]!.arm === 'grounded',
  );
  // Only `ok` and `wrong` count as reviewed; a typo leaves the lesson pending.
  const reviewed = groundedIds.filter(
    (id) => verdicts[id] === 'ok' || verdicts[id] === 'wrong',
  );
  return {
    expected: groundedIds.length,
    reviewed: reviewed.length,
    wrong: reviewed.filter((id) => verdicts[id] === 'wrong').length,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tier: { type: 'string' },
      dir: { type: 'string', default: 'tests/results/grounded-eval' },
      briefs: { type: 'string' },
      'spot-check': { type: 'string' },
    },
  });
  const tier = values.tier as SubscriptionTier;
  if (!['free', 'starter', 'pro'].includes(tier)) {
    throw new Error('score.ts needs --tier free|starter|pro');
  }
  const dir = values.dir!;
  const v15 = readJson<Manifest>(join(dir, `v15-${tier}.json`));
  const grounded = readJson<Manifest>(join(dir, `grounded-${tier}.json`));
  /** planId → brief, exported from staging (see the doc's SQL). */
  const briefs: Record<string, ResearchBrief> = values.briefs
    ? readJson(values.briefs)
    : {};

  const apiKey = process.env.EVAL_JUDGE_OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing EVAL_JUDGE_OPENROUTER_API_KEY; the judge has its own key',
    );
  }
  const client: JudgeClient = {
    apiKey,
    model: process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL,
  };

  const rows = [...lessonRows(v15), ...lessonRows(grounded)];
  const rowKey = (row: LessonRow) => `${row.arm}:${row.task.taskId}`;

  const blind = await judgeAll(
    rows,
    join(dir, `judge-blind-${tier}-${client.model.replace('/', '_')}.json`),
    rowKey,
    (row) =>
      runJudge(
        client,
        blindJudgeMessages(
          judgeContext(row),
          stripCitations(row.task.lessonContent),
        ),
        BLIND_JUDGE_CODES,
      ),
  );
  const briefRows = rows.filter(
    (row) => row.arm === 'grounded' && briefs[row.plan.planId],
  );
  const briefVerdicts = await judgeAll(
    briefRows,
    join(dir, `judge-brief-${tier}-${client.model.replace('/', '_')}.json`),
    rowKey,
    (row) =>
      runJudge(
        client,
        briefJudgeMessages(
          judgeContext(row),
          row.task.lessonContent,
          briefs[row.plan.planId]!,
        ),
        BRIEF_JUDGE_CODES,
      ),
  );

  const scored: ScoredLesson[] = [];
  const citationIssues: ScoredIssue[] = [];
  for (const row of rows) {
    const research = briefs[row.plan.planId] ?? null;
    const issues = runLessonCodeChecks(row.task.lessonContent, {
      estimatedMinutes: row.task.estimatedMinutes,
      research,
    });
    if (row.arm === 'grounded' && research) {
      citationIssues.push(
        ...issues.filter((i) => CITATION_CHECK_CODES.has(i.code)),
      );
    }
    scored.push({
      arm: row.arm,
      topicId: row.plan.topicId,
      taskId: row.task.taskId,
      title: row.task.title,
      codeIssues: issues.filter((i) => !CITATION_CHECK_CODES.has(i.code)),
      judgeIssues: blind[rowKey(row)] ?? null,
    });
  }

  const sheet = selectSpotCheck(scored, `${tier}-${client.model}`);
  const keyPath = join(dir, `spot-check-key-${tier}.json`);
  writeFileSync(
    keyPath,
    `${JSON.stringify(
      Object.fromEntries(
        sheet.map((s) => [
          s.id,
          { arm: s.lesson.arm, taskId: s.lesson.taskId },
        ]),
      ),
      null,
      2,
    )}\n`,
  );
  const contentByKey = new Map(rows.map((r) => [rowKey(r), r]));
  writeFileSync(
    join(dir, `spot-check-${tier}.md`),
    [
      `# Spot-check: ${tier}`,
      '',
      'Mark each lesson `ok` or `wrong` in a JSON file (`{"L01": "ok"}`); wrong means a',
      'setup mismatch, a fix that changes nothing, a wrong answer key, or a false claim.',
      '',
      ...sheet.flatMap(({ id, lesson }) => {
        const row = contentByKey.get(`${lesson.arm}:${lesson.taskId}`)!;
        const context = judgeContext(row);
        return [
          `## ${id}: ${context.taskTitle}`,
          '',
          `${context.planTopic} (${context.skillLevel}), module "${context.moduleTitle}", ${context.estimatedMinutes} min`,
          '',
          '```json',
          JSON.stringify(
            stripCitations(row.task.lessonContent).blocks,
            null,
            2,
          ),
          '```',
          '',
        ];
      }),
    ].join('\n'),
  );

  const v15Summary = summarizeArm(scored.filter((l) => l.arm === 'v15'));
  const groundedSummary = summarizeArm(
    scored.filter((l) => l.arm === 'grounded'),
  );
  const verdict = evaluateTier({
    tier,
    v15: v15Summary,
    grounded: groundedSummary,
    groundedModules: grounded.plans.flatMap((p) => p.modules),
    groundedPlansNotReady:
      grounded.plans.filter((p) => p.status !== 'ready').length +
      EVAL_TOPICS.filter((t) => !grounded.plans.some((p) => p.topicId === t.id))
        .length,
    groundedPlanCostsUsd: grounded.plans.map((p) => p.costUsd),
    spotCheck: readSpotCheck(values['spot-check'], keyPath),
  });

  const missingLessons = (m: Manifest) =>
    m.plans.reduce(
      (n, p) => n + p.tasks.filter((t) => !t.lessonContent).length,
      0,
    );
  const report = [
    `## ${tier}: ${verdict.pass === null ? 'pending' : verdict.pass ? 'pass' : 'fail'}`,
    '',
    `Judge: \`${client.model}\`. Plans: v15 ${v15.plans.length}, grounded ${grounded.plans.length}. Lessons: v15 ${v15Summary.lessons} (${missingLessons(v15)} missing), grounded ${groundedSummary.lessons} (${missingLessons(grounded)} missing). Unjudged: v15 ${v15Summary.unjudgedLessons}, grounded ${groundedSummary.unjudgedLessons}.`,
    '',
    '| Bar | Result | Target | Pass |',
    '| --- | --- | --- | --- |',
    ...verdict.bars.map(
      (b) =>
        `| ${b.name} | ${b.value} | ${b.target} | ${b.pass === null ? 'pending' : b.pass ? 'yes' : 'no'} |`,
    ),
    '',
    '### Reliability (separate from quality)',
    '',
    `- v15: ${summarizeReliability(v15.plans.flatMap((p) => p.modules))}`,
    `- grounded: ${summarizeReliability(grounded.plans.flatMap((p) => p.modules))}`,
    '',
    'A failed module has no lessons, so it is left out of the quality comparison. Timeouts are the AI call limit both arms share (JCS-172); v15 writes a whole module per call and grounded one lesson per call, so v15 hits it first. Run `run.ts classify` on both manifests first, or causes read as unclassified.',
    '',
    '### Issues by code',
    '',
    '| | v15 | grounded |',
    '| --- | --- | --- |',
    `| Code checks | ${countCodes(scored.filter((l) => l.arm === 'v15').flatMap((l) => l.codeIssues))} | ${countCodes(scored.filter((l) => l.arm === 'grounded').flatMap((l) => l.codeIssues))} |`,
    `| Blind judge | ${countCodes(scored.filter((l) => l.arm === 'v15').flatMap((l) => l.judgeIssues ?? []))} | ${countCodes(scored.filter((l) => l.arm === 'grounded').flatMap((l) => l.judgeIssues ?? []))} |`,
    '',
    '### Reference only (not in the bars)',
    '',
    `- Citation checks (grounded, ${Object.keys(briefs).length} briefs loaded): ${countCodes(citationIssues)}`,
    `- Brief-aware judge (grounded, ${Object.keys(briefVerdicts).length} lessons): ${countCodes(Object.values(briefVerdicts).flat())}`,
    '',
  ].join('\n');
  writeFileSync(join(dir, `report-${tier}.md`), report);
  console.log(report);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
