import type { ScoredIssue } from './scoring';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { LessonContent } from '@/shared/types/lesson-content.types';

import { extractFirstJsonObject } from '@/features/ai/providers/openrouter-json';
import { z } from 'zod';

/**
 * LLM judge for the JCS-163 eval. It calls OpenRouter directly with its own
 * key, so judge spend never shows up in the tier keys' cost deltas, and its
 * rubric is separate from the grounded verifier preset so neither arm is
 * graded by its own pipeline's prompt.
 */

/**
 * Outside every writer, verifier and advisor route: v15 writes with Gemini,
 * grounded with OpenAI, DeepSeek and Nvidia, and verifies with OpenAI and
 * Anthropic.
 */
export const DEFAULT_JUDGE_MODEL = 'x-ai/grok-4.7';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Long lessons take the judge over 2 minutes; a timeout leaves a lesson unjudged. */
const JUDGE_TIMEOUT_MS = 300_000;

/** Blind rubric codes. The first four are wrong outputs (`WRONG_OUTPUT_CODES`). */
export const BLIND_JUDGE_CODES = [
  'setup_mismatch',
  'mistake_fix_no_change',
  'wrong_answer_key',
  'wrong_example_output',
  'factual_error',
  'unclear_explanation',
  'off_topic',
  'level_mismatch',
  'unpracticable_task',
] as const;

export const BRIEF_JUDGE_CODES = [
  'contradicts_brief',
  'unsupported_citation',
] as const;

const JudgeOutputSchema = <const T extends readonly [string, ...string[]]>(
  codes: T,
) =>
  z.object({
    issues: z
      .array(
        z.object({
          code: z.enum(codes),
          message: z.string().min(1).max(1000),
        }),
      )
      .max(30),
  });

export type JudgeContext = {
  readonly planTopic: string;
  readonly skillLevel: string;
  readonly moduleTitle: string;
  readonly taskTitle: string;
  readonly estimatedMinutes: number;
};

const BLIND_RUBRIC = `You review one lesson from a learning plan for correctness and teaching quality.
Report only real problems a careful subject expert would flag. A clean lesson gets an empty list.

Codes:
- setup_mismatch: a worked example, practice task or answer depends on setup (data, code, values) that differs from what the lesson shows.
- mistake_fix_no_change: a "common mistake" and its "fix" are the same, or the fix does not change the outcome described.
- wrong_answer_key: a stated answer, solution or expected result is wrong.
- wrong_example_output: an example's shown output or result does not follow from its input.
- factual_error: any other statement that is false.
- unclear_explanation: a key idea is explained so vaguely or confusingly that the learner cannot apply it.
- off_topic: content that does not serve the task title.
- level_mismatch: content clearly too basic or too advanced for the stated skill level.
- unpracticable_task: a practice task the learner cannot do with what the lesson gives them.

Return only JSON: {"issues":[{"code":"<code>","message":"<one sentence naming the exact block and problem>"}]}`;

const BRIEF_RUBRIC = `You check one lesson against the research brief it was written from.
Report only these problems; a lesson that agrees with the brief gets an empty list.

Codes:
- contradicts_brief: the lesson states something the brief contradicts.
- unsupported_citation: a [Sn] marker cites a source whose title and the brief's use of it do not support the cited claim.

Return only JSON: {"issues":[{"code":"<code>","message":"<one sentence naming the exact block and problem>"}]}`;

function contextLines(context: JudgeContext): string {
  return [
    `Plan topic: ${context.planTopic}`,
    `Skill level: ${context.skillLevel}`,
    `Module: ${context.moduleTitle}`,
    `Task: ${context.taskTitle} (${context.estimatedMinutes} min)`,
  ].join('\n');
}

export function blindJudgeMessages(
  context: JudgeContext,
  strippedLesson: LessonContent,
) {
  return [
    { role: 'system', content: BLIND_RUBRIC },
    {
      role: 'user',
      content: `${contextLines(context)}\n\nLesson JSON:\n${JSON.stringify(
        strippedLesson.blocks,
      )}`,
    },
  ] as const;
}

export function briefJudgeMessages(
  context: JudgeContext,
  lesson: LessonContent,
  research: ResearchBrief,
) {
  const sources = research.sources
    .map((s) => `${s.key}: ${s.title} (${s.publisher})`)
    .join('\n');
  return [
    { role: 'system', content: BRIEF_RUBRIC },
    {
      role: 'user',
      content: `${contextLines(context)}\n\nResearch brief:\n${
        research.brief
      }\n\nSources:\n${sources}\n\nLesson JSON:\n${JSON.stringify(
        lesson.blocks,
      )}`,
    },
  ] as const;
}

export function parseJudgeOutput(
  text: string,
  codes: readonly [string, ...string[]],
): ScoredIssue[] {
  return JudgeOutputSchema(codes).parse(extractFirstJsonObject(text)).issues;
}

export type JudgeClient = {
  readonly apiKey: string;
  readonly model: string;
};

/** One judge call; throws on HTTP, timeout or unparseable output. */
export async function runJudge(
  client: JudgeClient,
  messages: readonly { role: string; content: string }[],
  codes: readonly [string, ...string[]],
): Promise<ScoredIssue[]> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${client.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: client.model,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Judge request failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Judge returned no message content');
  }
  return parseJudgeOutput(text, codes);
}
