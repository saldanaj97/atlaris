import type { LessonIssue } from '@/features/lesson-content/lesson-citation-checks';
import type { NewGenerationQualityIssue } from '@/lib/db/queries/types/generation-quality-issues.types';

/** What the checks found on one version of a lesson. */
export type LessonQualityPass = {
  /** 0 for the written lesson, then the repair pass that produced it. */
  readonly pass: number;
  readonly issues: readonly LessonIssue[];
  /** Whether the verifier checked this version. */
  readonly verifierRan: boolean;
};

function issueKey(issue: LessonIssue): string {
  return `${issue.code}@${issue.blockRef}`;
}

/**
 * Rows for `generation_quality_issues` for one lesson, given the checked
 * versions in order (the written lesson, then each repair that was kept).
 * Each issue is recorded once, at the pass it first appeared. It is resolved
 * when the shipped (last) version was checked by the same source and the
 * issue (code at the same block) is gone; verifier issues stay unresolved
 * when the verifier did not run on the shipped version.
 */
export function toLessonQualityRecords(
  ids: {
    readonly planId: string;
    readonly moduleId: string;
    readonly taskId: string;
  },
  passes: readonly LessonQualityPass[],
): NewGenerationQualityIssue[] {
  const shipped = passes.at(-1);
  if (!shipped) {
    return [];
  }
  const remaining = new Set(shipped.issues.map(issueKey));
  const seen = new Set<string>();
  const records: NewGenerationQualityIssue[] = [];

  for (const { pass, issues } of passes) {
    for (const issue of issues) {
      const key = issueKey(issue);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const rechecked =
        pass < shipped.pass && (issue.source === 'code' || shipped.verifierRan);
      records.push({
        planId: ids.planId,
        moduleId: ids.moduleId,
        taskId: ids.taskId,
        stage: 'lesson',
        blockRef: issue.blockRef,
        issueCode: issue.code,
        message: issue.message,
        pass,
        resolved: rechecked && !remaining.has(key),
      });
    }
  }
  return records;
}
