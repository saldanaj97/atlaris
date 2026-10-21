import type { OutlineIssue } from '@/features/plans/outline/checks';
import type { NewGenerationQualityIssue } from '@/lib/db/queries/types/generation-quality-issues.types';

/** What the outline checks found before and after the repair pass. */
export type OutlineQualityPasses = {
  /** Code checks plus verifier issues on the first outline. */
  readonly pass0: readonly OutlineIssue[];
  /** Issues on the repaired outline; `null` when no repair ran or it failed. */
  readonly pass1: {
    readonly issues: readonly OutlineIssue[];
    /** Whether the verifier checked the repaired outline. */
    readonly verifierRan: boolean;
  } | null;
};

function issueKey(issue: OutlineIssue): string {
  return `${issue.code}@${issue.blockRef}`;
}

function toRecord(
  planId: string,
  issue: OutlineIssue,
  pass: number,
  resolved: boolean,
): NewGenerationQualityIssue {
  return {
    planId,
    moduleId: null,
    taskId: null,
    stage: 'outline',
    blockRef: issue.blockRef,
    issueCode: issue.code,
    message: issue.message,
    pass,
    resolved,
  };
}

/**
 * Rows for `generation_quality_issues`. A first-pass issue is resolved when
 * the repaired outline was checked again by the same source and the issue
 * (code at the same block) is gone. Issues that first appear on the repaired
 * outline are recorded as pass 1, unresolved.
 */
export function toOutlineQualityRecords(
  planId: string,
  passes: OutlineQualityPasses,
): NewGenerationQualityIssue[] {
  const { pass0, pass1 } = passes;
  const remaining = new Set(pass1?.issues.map(issueKey) ?? []);
  const firstPass = new Set(pass0.map(issueKey));

  const records = pass0.map((issue) => {
    const rechecked =
      pass1 !== null && (issue.source === 'code' || pass1.verifierRan);
    return toRecord(
      planId,
      issue,
      0,
      rechecked && !remaining.has(issueKey(issue)),
    );
  });
  for (const issue of pass1?.issues ?? []) {
    if (!firstPass.has(issueKey(issue))) {
      records.push(toRecord(planId, issue, 1, false));
    }
  }
  return records;
}
