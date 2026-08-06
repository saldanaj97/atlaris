import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CI_PR_WORKFLOW = readFileSync(
  join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'ci-pr.yml',
  ),
  'utf8',
);
const CANDIDATE_COUNT =
  "COUNT=$(printf '%s\\n' \"${FILES}\" | awk 'NF { count += 1 } END { print count + 0 }')";

describe('PR CI candidate file counting', () => {
  it('treats an empty filtered file list as zero candidates in every consumer', () => {
    expect(CI_PR_WORKFLOW.split(CANDIDATE_COUNT)).toHaveLength(3);
    expect(CI_PR_WORKFLOW).not.toContain('echo "${FILES}" | wc -l');
  });
});
