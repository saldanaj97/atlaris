import type { OutlineIssue } from '@/features/plans/outline/checks';

import { toOutlineQualityRecords } from '@/features/plans/outline/quality-issues';
import { describe, expect, it } from 'vitest';

const PLAN_ID = '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f';

function issue(
  code: string,
  blockRef: string,
  source: OutlineIssue['source'] = 'code',
): OutlineIssue {
  return { code, blockRef, message: `${code} at ${blockRef}`, source };
}

function summary(records: ReturnType<typeof toOutlineQualityRecords>) {
  return records.map((record) => [
    record.issueCode,
    record.blockRef,
    record.pass,
    record.resolved,
  ]);
}

describe('toOutlineQualityRecords', () => {
  it('marks fixed issues resolved and keeps the rest open', () => {
    const records = toOutlineQualityRecords(PLAN_ID, {
      pass0: [
        issue('duplicate_title', 'modules[1]'),
        issue('module_time_mismatch', 'modules[0]'),
        issue('verifier.too_advanced', 'modules[2]', 'verifier'),
      ],
      pass1: {
        issues: [issue('module_time_mismatch', 'modules[0]')],
        verifierRan: true,
      },
    });

    expect(summary(records)).toEqual([
      ['duplicate_title', 'modules[1]', 0, true],
      ['module_time_mismatch', 'modules[0]', 0, false],
      ['verifier.too_advanced', 'modules[2]', 0, true],
    ]);
    expect(records[0]).toMatchObject({
      planId: PLAN_ID,
      stage: 'outline',
      moduleId: null,
      taskId: null,
      message: 'duplicate_title at modules[1]',
    });
  });

  it('records issues the repair introduced as pass 1, unresolved', () => {
    const records = toOutlineQualityRecords(PLAN_ID, {
      pass0: [issue('lesson_count', 'modules[0]')],
      pass1: {
        issues: [issue('near_duplicate_title', 'modules[1].tasks[0]')],
        verifierRan: false,
      },
    });

    expect(summary(records)).toEqual([
      ['lesson_count', 'modules[0]', 0, true],
      ['near_duplicate_title', 'modules[1].tasks[0]', 1, false],
    ]);
  });

  it('keeps verifier issues open when the verifier did not recheck', () => {
    const records = toOutlineQualityRecords(PLAN_ID, {
      pass0: [issue('verifier.overlap', 'modules[1]', 'verifier')],
      pass1: { issues: [], verifierRan: false },
    });

    expect(summary(records)).toEqual([
      ['verifier.overlap', 'modules[1]', 0, false],
    ]);
  });

  it('keeps every issue open when no repair ran', () => {
    const records = toOutlineQualityRecords(PLAN_ID, {
      pass0: [issue('module_count', 'plan')],
      pass1: null,
    });

    expect(summary(records)).toEqual([['module_count', 'plan', 0, false]]);
  });
});
