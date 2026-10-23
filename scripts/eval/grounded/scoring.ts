import type { SubscriptionTier } from '@/shared/types/billing.types';
import type {
  LessonContent,
  LessonContentBlock,
} from '@/shared/types/lesson-content.types';

/**
 * Pure scoring for the grounded-generation eval (JCS-163). The CLIs in this
 * folder collect runs and judge lessons; everything that decides pass or
 * fail lives here so it can be unit tested.
 */

export type EvalArm = 'v15' | 'grounded';

/** p95 module latency bar: about 4 minutes. */
export const MAX_P95_MODULE_LATENCY_MS = 240_000;

/** Grounded must flag at least this much less per lesson than v15. */
export const MIN_ISSUE_REDUCTION = 0.5;

/**
 * Cost cap per fully generated plan, in USD. Interim: AI spend at 20% of
 * revenue (Starter $25/month over 4 plan-equivalents, Pro $100/month over 8);
 * Free is an acquisition cost.
 */
export const COST_CAP_PER_PLAN_USD: Record<SubscriptionTier, number> = {
  free: 0.05,
  starter: 1.25,
  pro: 2.5,
};

/**
 * Code-check codes left out of the comparison: v15 lessons have no sources,
 * so citation checks only describe the grounded arm.
 */
export const CITATION_CHECK_CODES: ReadonlySet<string> = new Set([
  'citation_without_brief',
  'unknown_source',
  'raw_url',
]);

/** Judge codes that count as a wrong output (the zero bar). */
export const WRONG_OUTPUT_CODES: ReadonlySet<string> = new Set([
  'setup_mismatch',
  'mistake_fix_no_change',
  'wrong_answer_key',
  'wrong_example_output',
]);

export type ScoredIssue = { readonly code: string; readonly message: string };

/** One lesson after code checks and the blind judge. */
export type ScoredLesson = {
  readonly arm: EvalArm;
  readonly topicId: string;
  readonly taskId: string;
  readonly title: string;
  /** Code-check issues that count for the bar (citation codes removed). */
  readonly codeIssues: readonly ScoredIssue[];
  /** Blind judge issues; `null` when the judge call failed. */
  readonly judgeIssues: readonly ScoredIssue[] | null;
};

/** One module's lesson run, timed by the runner from start to terminal. */
export type ModuleRun = {
  readonly moduleId: string;
  readonly status: 'ready' | 'failed';
  readonly durationMs: number;
  /** The module's lesson workflow instance, for classifying failures later. */
  readonly workflowRunId?: string;
  /** Set by `run.ts classify` on failed modules. */
  readonly failureCause?: FailureCause;
  /**
   * The longest provider-call step attempt, set by `run.ts classify`. v15
   * writes a whole module per call; grounded writes one lesson per call.
   */
  readonly longestCallMs?: number;
  /** A provider call ran to its own timeout; set by `run.ts classify`. */
  readonly hitCallCap?: boolean;
};

export type FailureCause = 'timeout' | 'parse' | 'other';

/**
 * The per-call lesson timeout both arms run with (`AI_LESSON_TIMEOUT_MS`
 * default, src/lib/config/env/ai.ts). A call at this length was cut off
 * (JCS-172).
 */
export const AI_CALL_TIMEOUT_MS = 300_000;

/**
 * The lesson verify and repair calls' timeout: the default AI timeout plus one
 * extension (`qualityCallTimeoutMs`, workers/jobs lesson-quality.ts).
 */
export const QUALITY_CALL_TIMEOUT_MS = 180_000;

const QUALITY_STEP = /^lesson-\d+-(verify|repair)-/;

/** One step of a Cloudflare Workflow instance, as `wrangler ... describe --json` prints it. */
export type WorkflowStep = {
  readonly name: string;
  readonly attempts?: readonly {
    readonly start: string | null;
    readonly end: string | null;
    readonly success: boolean | null;
    readonly error?: {
      readonly name?: string;
      readonly message?: string;
    } | null;
  }[];
};

const BOOKKEEPING_STEP = /^(claim|fail|parse-commit)/;

/**
 * Reads a lesson workflow's steps: the longest provider-call attempt, whether
 * any call ran to its own cap, and for a failed module the cause of its last
 * failed attempt. An aborted or timed-out call is `timeout`; a failed parse
 * step is `parse`.
 */
export function classifyWorkflowSteps(
  steps: readonly WorkflowStep[],
  failed: boolean,
): {
  failureCause?: FailureCause;
  longestCallMs?: number;
  hitCallCap: boolean;
} {
  let longestCallMs: number | undefined;
  let hitCallCap = false;
  let lastFailure: { step: string; name: string; message: string } | undefined;
  for (const step of steps) {
    for (const attempt of step.attempts ?? []) {
      if (!BOOKKEEPING_STEP.test(step.name) && attempt.start && attempt.end) {
        const ms = Date.parse(attempt.end) - Date.parse(attempt.start);
        longestCallMs = Math.max(longestCallMs ?? 0, ms);
        const cap = QUALITY_STEP.test(step.name)
          ? QUALITY_CALL_TIMEOUT_MS
          : AI_CALL_TIMEOUT_MS;
        hitCallCap ||= ms >= cap;
      }
      if (attempt.success === false && !step.name.startsWith('fail')) {
        lastFailure = {
          step: step.name,
          name: attempt.error?.name ?? '',
          message: attempt.error?.message ?? '',
        };
      }
    }
  }
  if (!failed) {
    return { longestCallMs, hitCallCap };
  }
  const failureCause: FailureCause = !lastFailure
    ? 'other'
    : /^(AbortError|TimeoutError)$/.test(lastFailure.name) ||
        /aborted|timed? ?out/i.test(lastFailure.message)
      ? 'timeout'
      : lastFailure.step.startsWith('parse-commit')
        ? 'parse'
        : 'other';
  return { failureCause, longestCallMs, hitCallCap };
}

/** Failed modules by cause, for the reliability line of the report. */
export function summarizeReliability(modules: readonly ModuleRun[]): string {
  const failed = modules.filter((m) => m.status === 'failed');
  const count = (cause: FailureCause | undefined) =>
    failed.filter((m) => m.failureCause === cause).length;
  // Manifests classified before `hitCallCap` only know the longest call.
  const atCap = modules.filter(
    (m) => m.hitCallCap ?? (m.longestCallMs ?? 0) >= AI_CALL_TIMEOUT_MS,
  ).length;
  return `${failed.length} of ${modules.length} failed (timeout ${count('timeout')}, parse ${count('parse')}, other ${count('other')}, unclassified ${count(undefined)}); ${atCap} module(s) with a call at its timeout cap`;
}

/** `[S1]`, or several keys in one bracket: `[S1, S3]`. */
const CITATION_MARKER_PATTERN = /\s*\[S\d+(?:\s*[,;]\s*S\d+)*\]/g;

function stripMarkers(text: string): string {
  return text.replace(CITATION_MARKER_PATTERN, '');
}

/**
 * The lesson as the blind judge sees it: no `[Sn]` markers and no
 * `sourceIds`, so the judge cannot tell which pipeline wrote it.
 */
export function stripCitations(content: LessonContent): LessonContent {
  const blocks = content.blocks.map((block): LessonContentBlock => {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'practice':
        return { ...block, text: stripMarkers(block.text) };
      case 'example':
        return {
          ...block,
          title: stripMarkers(block.title),
          text: stripMarkers(block.text),
        };
      case 'takeaways':
      case 'completion_criteria':
        return { ...block, items: block.items.map(stripMarkers) };
      default: {
        const _never: never = block;
        throw new Error(`Unhandled lesson block: ${String(_never)}`);
      }
    }
  });
  return { version: content.version, blocks };
}

/** Nearest-rank percentile; `null` for an empty list. */
export function percentile(
  values: readonly number[],
  p: number,
): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] ?? null;
}

export type ArmSummary = {
  readonly lessons: number;
  /** Lessons the judge could not score; any makes the comparison unproven. */
  readonly unjudgedLessons: number;
  readonly codeIssues: number;
  readonly judgeIssues: number;
  readonly issuesPerLesson: number | null;
  readonly wrongOutputLessons: number;
};

export function summarizeArm(lessons: readonly ScoredLesson[]): ArmSummary {
  const codeIssues = lessons.reduce((n, l) => n + l.codeIssues.length, 0);
  const judgeIssues = lessons.reduce(
    (n, l) => n + (l.judgeIssues?.length ?? 0),
    0,
  );
  return {
    lessons: lessons.length,
    unjudgedLessons: lessons.filter((l) => l.judgeIssues === null).length,
    codeIssues,
    judgeIssues,
    issuesPerLesson:
      lessons.length === 0 ? null : (codeIssues + judgeIssues) / lessons.length,
    wrongOutputLessons: lessons.filter((l) =>
      (l.judgeIssues ?? []).some((i) => WRONG_OUTPUT_CODES.has(i.code)),
    ).length,
  };
}

/** Human spot-check verdicts; `null` until the reviewer fills the sheet in. */
export type SpotCheckResult = {
  /** Grounded lessons on the sheet; every one needs a verdict. */
  readonly expected: number;
  readonly reviewed: number;
  readonly wrong: number;
} | null;

export type TierVerdictInput = {
  readonly tier: SubscriptionTier;
  readonly v15: ArmSummary;
  readonly grounded: ArmSummary;
  readonly groundedModules: readonly ModuleRun[];
  /**
   * Grounded plans that never reached their modules: a failed or timed-out
   * outline, or a topic with no plan in the manifest.
   */
  readonly groundedPlansNotReady: number;
  /** Grounded cost per plan, USD; `null` where the measurement is missing. */
  readonly groundedPlanCostsUsd: readonly (number | null)[];
  readonly spotCheck: SpotCheckResult;
};

export type BarResult = {
  readonly name: string;
  readonly value: string;
  readonly target: string;
  /** `null` while the evidence is pending (the spot-check). */
  readonly pass: boolean | null;
};

export type TierVerdict = {
  readonly tier: SubscriptionTier;
  readonly bars: readonly BarResult[];
  /** True only when every bar passed; `null` while any bar is pending. */
  readonly pass: boolean | null;
};

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? 'n/a' : value.toFixed(digits);
}

/**
 * The strict pass bar for one tier. Missing evidence never passes: an empty
 * arm, an unjudged lesson, a v15 baseline with no issues, a failed module or
 * a missing cost reading each fail their bar.
 */
export function evaluateTier(input: TierVerdictInput): TierVerdict {
  const { v15, grounded } = input;

  const { spotCheck } = input;
  const wrongTotal = grounded.wrongOutputLessons + (spotCheck?.wrong ?? 0);
  // A partly filled sheet is still pending: the unreviewed lessons may be wrong.
  const spotCheckDone =
    spotCheck !== null &&
    spotCheck.expected > 0 &&
    spotCheck.reviewed >= spotCheck.expected;
  const wrongBar: BarResult = {
    name: 'Wrong outputs (judge + spot-check)',
    value: `${grounded.wrongOutputLessons} judge, ${
      spotCheck
        ? `${spotCheck.wrong} wrong, ${spotCheck.reviewed} of ${spotCheck.expected} spot-checked`
        : 'spot-check pending'
    }`,
    target: '0',
    pass:
      wrongTotal > 0 || grounded.unjudgedLessons > 0 || grounded.lessons === 0
        ? false
        : spotCheckDone
          ? true
          : null,
  };

  const reduction =
    v15.issuesPerLesson && grounded.issuesPerLesson !== null
      ? 1 - grounded.issuesPerLesson / v15.issuesPerLesson
      : null;
  const comparable =
    reduction !== null &&
    v15.unjudgedLessons === 0 &&
    grounded.unjudgedLessons === 0;
  const issuesBar: BarResult = {
    name: 'Flagged issues per lesson vs v15',
    value: `${formatNumber(grounded.issuesPerLesson)} vs ${formatNumber(
      v15.issuesPerLesson,
    )} (${reduction === null ? 'n/a' : `${Math.round(reduction * 100)}% fewer`})`,
    target: `≥ ${MIN_ISSUE_REDUCTION * 100}% fewer`,
    pass: comparable && reduction >= MIN_ISSUE_REDUCTION,
  };

  const completed = input.groundedModules.filter((m) => m.status === 'ready');
  const failedModules = input.groundedModules.length - completed.length;
  const p95 = percentile(
    completed.map((m) => m.durationMs),
    95,
  );
  const timedOut = input.groundedModules.filter(
    (m) => m.failureCause === 'timeout',
  ).length;
  const latencyBar: BarResult = {
    name: 'p95 module latency',
    value: `${p95 === null ? 'n/a' : `${(p95 / 60_000).toFixed(1)} min`}${
      failedModules > 0 ? `, ${failedModules} module(s) failed` : ''
    }${timedOut > 0 ? ` (${timedOut} hit the AI call timeout: infra, JCS-172)` : ''}${
      input.groundedPlansNotReady > 0
        ? `, ${input.groundedPlansNotReady} plan(s) failed before modules`
        : ''
    }`,
    target: `≤ ${MAX_P95_MODULE_LATENCY_MS / 60_000} min, no failed plans or modules`,
    pass:
      p95 !== null &&
      p95 <= MAX_P95_MODULE_LATENCY_MS &&
      failedModules === 0 &&
      input.groundedPlansNotReady === 0,
  };

  const cap = COST_CAP_PER_PLAN_USD[input.tier];
  const costs = input.groundedPlanCostsUsd;
  const measured = costs.filter((c): c is number => c !== null);
  const maxCost = measured.length > 0 ? Math.max(...measured) : null;
  const meanCost =
    measured.length > 0
      ? measured.reduce((sum, c) => sum + c, 0) / measured.length
      : null;
  const costBar: BarResult = {
    name: 'Cost per plan (mean / max)',
    value: `$${formatNumber(meanCost, 3)} / $${formatNumber(maxCost, 3)}${
      measured.length < costs.length
        ? `, ${costs.length - measured.length} unmeasured`
        : ''
    }`,
    target: `≤ $${cap.toFixed(2)}`,
    pass:
      maxCost !== null && measured.length === costs.length && maxCost <= cap,
  };

  const bars = [wrongBar, issuesBar, latencyBar, costBar];
  const pass = bars.some((b) => b.pass === false)
    ? false
    : bars.some((b) => b.pass === null)
      ? null
      : true;
  return { tier: input.tier, bars, pass };
}

/** Lessons per arm on the human spot-check sheet (about 20 per tier). */
export const SPOT_CHECK_PER_ARM = 10;

/** FNV-1a string hash feeding a mulberry32 generator: same seed, same sheet. */
function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The blind spot-check sheet: up to `SPOT_CHECK_PER_ARM` lessons from each
 * arm, mixed in a seeded order under neutral ids so the reviewer cannot tell
 * the arms apart.
 */
export function selectSpotCheck(
  lessons: readonly ScoredLesson[],
  seed: string,
): { readonly id: string; readonly lesson: ScoredLesson }[] {
  const random = seededRandom(seed);
  const picked = (['v15', 'grounded'] as const).flatMap((arm) =>
    shuffle(
      lessons.filter((l) => l.arm === arm),
      random,
    ).slice(0, SPOT_CHECK_PER_ARM),
  );
  return shuffle(picked, random).map((lesson, i) => ({
    id: `L${String(i + 1).padStart(2, '0')}`,
    lesson,
  }));
}
