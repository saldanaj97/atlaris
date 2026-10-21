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
};

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
  readonly reviewed: number;
  readonly wrong: number;
} | null;

export type TierVerdictInput = {
  readonly tier: SubscriptionTier;
  readonly v15: ArmSummary;
  readonly grounded: ArmSummary;
  readonly groundedModules: readonly ModuleRun[];
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

  const wrongTotal =
    grounded.wrongOutputLessons + (input.spotCheck?.wrong ?? 0);
  const wrongBar: BarResult = {
    name: 'Wrong outputs (judge + spot-check)',
    value: `${grounded.wrongOutputLessons} judge, ${
      input.spotCheck
        ? `${input.spotCheck.wrong} of ${input.spotCheck.reviewed} spot-checked`
        : 'spot-check pending'
    }`,
    target: '0',
    pass:
      wrongTotal > 0 || grounded.unjudgedLessons > 0 || grounded.lessons === 0
        ? false
        : input.spotCheck === null
          ? null
          : true,
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
  const latencyBar: BarResult = {
    name: 'p95 module latency',
    value: `${p95 === null ? 'n/a' : `${(p95 / 60_000).toFixed(1)} min`}${
      failedModules > 0 ? `, ${failedModules} module(s) failed` : ''
    }`,
    target: `≤ ${MAX_P95_MODULE_LATENCY_MS / 60_000} min, no failed modules`,
    pass:
      p95 !== null && p95 <= MAX_P95_MODULE_LATENCY_MS && failedModules === 0,
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
