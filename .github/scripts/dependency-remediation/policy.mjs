import { parseAudit } from './audit.mjs';
import { isObject } from './shared.mjs';
import {
  compareResolvedVersions,
  parseStableVersion,
  versionsFor,
} from './versions.mjs';
import { inspectWorkspaceDiff } from './workspace.mjs';

const changedFileList = (input) => {
  const values = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  return [
    ...new Set(
      values.map((value) => (typeof value === 'string' ? value.trim() : '')),
    ),
  ]
    .filter(Boolean)
    .sort();
};

const basePlan = (baseSha, changedFiles) => ({
  schemaVersion: 1,
  baseSha: typeof baseSha === 'string' ? baseSha : null,
  status: 'rejected',
  classification: 'none',
  mergeEligible: false,
  changedFiles,
  advisoryIds: [],
  findings: [],
  affectedPackages: [],
  versions: {},
  resolvedVersionChanges: [],
  releaseAgeExceptions: [],
  reasons: [],
  registryError: false,
});

/** Classify a remediation using only audited evidence and resolved pnpm JSON output. */
export function classifyRemediation(input = {}) {
  const diff = isObject(input.diff) ? input.diff : {};
  const workspaceBefore = input.workspaceBefore ?? diff.workspaceBefore;
  const workspaceAfter = input.workspaceAfter ?? diff.workspaceAfter;
  const versionsBeforeInput =
    input.versionsBefore ??
    input.resolvedBefore ??
    diff.versionsBefore ??
    input.versions?.before;
  const versionsAfterInput =
    input.versionsAfter ??
    input.resolvedAfter ??
    diff.versionsAfter ??
    input.versions?.after;
  const changedFiles = changedFileList(
    input.changedFiles ?? input.files ?? diff.changedFiles ?? diff.files,
  );
  const plan = basePlan(input.baseSha, changedFiles);
  const before = parseAudit(
    input.beforeAudit ?? input.auditBefore ?? input.before ?? diff.beforeAudit,
  );
  const after = parseAudit(
    input.afterAudit ??
      input.auditAfter ??
      input.after ??
      diff.afterAudit ??
      input.beforeAudit ??
      input.auditBefore,
  );

  if (!before.valid || !after.valid) {
    plan.registryError = before.registryError || after.registryError;
    plan.reasons.push(
      before.error ?? 'before audit was invalid',
      after.error ?? 'after audit was invalid',
    );
    return plan;
  }
  if (before.registryError || after.registryError) {
    plan.registryError = true;
    plan.reasons.push('audit registry or infrastructure failure');
    return plan;
  }
  if (after.highCritical.length > 0) {
    plan.findings = after.highCritical;
    plan.advisoryIds = after.advisoryIds;
    plan.reasons.push(
      'residual high/critical production finding remains after remediation',
    );
    return plan;
  }
  if (before.ambiguous || after.ambiguous) {
    plan.reasons.push(
      'audit evidence is ambiguous; refusing to publish an unproven plan',
    );
    return plan;
  }

  plan.findings = before.highCritical;
  plan.advisoryIds = before.advisoryIds;
  if (before.highCritical.length === 0) {
    if (changedFiles.length > 0)
      plan.reasons.push('clean audit must not produce a remediation diff');
    if (plan.reasons.length > 0) return plan;
    plan.status = 'noop';
    return plan;
  }

  const allowed = new Set(['pnpm-lock.yaml', 'pnpm-workspace.yaml']);
  const unexpected = changedFiles.filter((file) => !allowed.has(file));
  if (unexpected.length > 0) {
    plan.reasons.push(`unexpected files changed: ${unexpected.join(', ')}`);
    return plan;
  }
  if (changedFiles.length === 0 || !changedFiles.includes('pnpm-lock.yaml')) {
    plan.reasons.push('a high/critical fix must change pnpm-lock.yaml');
    return plan;
  }

  const workspaceChanged = changedFiles.includes('pnpm-workspace.yaml');
  const workspaceProvided =
    workspaceBefore !== undefined || workspaceAfter !== undefined;
  if (workspaceChanged && !workspaceProvided) {
    plan.reasons.push(
      'workspace contents are required to validate a policy change',
    );
    return plan;
  }
  if (
    !workspaceChanged &&
    workspaceProvided &&
    workspaceBefore !== workspaceAfter
  ) {
    plan.reasons.push('workspace changed without being listed in the diff');
    return plan;
  }
  let workspace = { valid: true, changed: false, additions: [], entries: [] };
  if (workspaceProvided) {
    workspace = inspectWorkspaceDiff(workspaceBefore, workspaceAfter);
    if (!workspace.valid || (workspaceChanged && !workspace.changed)) {
      plan.reasons.push(
        workspace.error ??
          'workspace policy diff is not an exact exclusion addition',
      );
      return plan;
    }
  }
  plan.releaseAgeExceptions = workspace.additions;

  const packages = [
    ...new Set(
      before.highCritical.map((finding) => finding.package).filter(Boolean),
    ),
  ].sort();
  if (
    packages.length !==
    new Set(
      before.highCritical.map((finding) => finding.package).filter(Boolean),
    ).size
  ) {
    plan.reasons.push(
      'audit maps a finding to more than one package ambiguously',
    );
    return plan;
  }
  if (
    packages.length === 0 ||
    before.highCritical.some((finding) => !finding.package || !finding.id)
  ) {
    plan.reasons.push(
      'audit finding is missing an unambiguous package or advisory id',
    );
    return plan;
  }
  plan.affectedPackages = packages;

  const beforeVersions = {};
  const afterVersions = {};
  const versionIssues = [];
  const resolvedMaps = compareResolvedVersions(
    versionsBeforeInput,
    versionsAfterInput,
  );
  plan.resolvedVersionChanges = resolvedMaps.changes;
  if (!resolvedMaps.valid) {
    versionIssues.push(resolvedMaps.error);
  } else {
    const affectedSet = new Set(packages);
    for (const change of resolvedMaps.changes) {
      if (!affectedSet.has(change.package)) {
        versionIssues.push(
          `resolved version changed outside audited packages: ${change.package}`,
        );
      }
    }
  }
  for (const packageValue of packages) {
    const beforeValue = versionsFor(versionsBeforeInput, packageValue);
    const afterValue = versionsFor(versionsAfterInput, packageValue);
    if (beforeValue.ambiguous || afterValue.ambiguous) {
      versionIssues.push(
        `${packageValue}: resolved version mapping is ambiguous or missing`,
      );
      continue;
    }
    beforeVersions[packageValue] = beforeValue.values[0];
    afterVersions[packageValue] = afterValue.values[0];
  }
  plan.versions = Object.fromEntries(
    packages.map((packageValue) => [
      packageValue,
      {
        before: beforeVersions[packageValue] ?? null,
        after: afterVersions[packageValue] ?? null,
      },
    ]),
  );

  for (const exception of workspace.entries) {
    if (!packages.includes(exception.package)) {
      plan.reasons.push(
        `release-age exception ${exception.value} is not tied to an audited package`,
      );
      continue;
    }
    const resolvedAfter = afterVersions[exception.package];
    if (resolvedAfter && resolvedAfter !== exception.version) {
      plan.reasons.push(
        `release-age exception ${exception.value} does not match the resolved package version`,
      );
    }
  }
  if (plan.reasons.length > 0) return plan;

  const patchEligible =
    changedFiles.length === 1 &&
    changedFiles[0] === 'pnpm-lock.yaml' &&
    workspace.additions.length === 0 &&
    resolvedMaps.valid &&
    versionIssues.length === 0 &&
    resolvedMaps.changes.length > 0 &&
    resolvedMaps.changes.every((change) => packages.includes(change.package)) &&
    packages.every((packageValue) => {
      const change = resolvedMaps.changes.find(
        (item) => item.package === packageValue,
      );
      const beforeValue = parseStableVersion(beforeVersions[packageValue]);
      const afterValue = parseStableVersion(afterVersions[packageValue]);
      return (
        change &&
        change.before.length === 1 &&
        change.after.length === 1 &&
        beforeValue &&
        afterValue &&
        beforeValue.major === afterValue.major &&
        beforeValue.minor === afterValue.minor &&
        afterValue.patch > beforeValue.patch
      );
    });

  if (versionIssues.length > 0) plan.reasons.push(...versionIssues);
  plan.status = 'ready';
  plan.classification = patchEligible ? 'patch-auto-merge' : 'review-required';
  plan.mergeEligible = patchEligible;
  if (!patchEligible && plan.reasons.length === 0) {
    plan.reasons.push(
      'fix is valid but not a strict lockfile-only stable patch',
    );
  }
  return plan;
}
