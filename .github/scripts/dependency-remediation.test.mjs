import {
  classifyRemediation,
  parseAudit,
  renderPlan,
} from './dependency-remediation.mjs';
import * as remediation from './dependency-remediation.mjs';
import { runCli } from './dependency-remediation/cli.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cleanAudit = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
  },
};

const vulnerableAudit = {
  auditReportVersion: 2,
  vulnerabilities: {
    'example-package': {
      name: 'example-package',
      severity: 'high',
      range: '<1.2.3',
      via: [
        {
          source: 'GHSA-example',
          severity: 'high',
          range: '<1.2.3',
          title: 'Example advisory',
        },
      ],
      nodes: ['node_modules/example-package'],
      isDirect: true,
    },
  },
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 },
  },
};

const baseInput = (overrides = {}) => ({
  baseSha: '0123456789abcdef0123456789abcdef01234567',
  beforeAudit: vulnerableAudit,
  afterAudit: cleanAudit,
  changedFiles: ['pnpm-lock.yaml'],
  versionsBefore: { 'example-package': '1.2.2' },
  versionsAfter: { 'example-package': '1.2.3' },
  ...overrides,
});

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const helperPath = join(
  scriptDirectory,
  'dependency-remediation',
  'run-audit.sh',
);
const facadePath = join(scriptDirectory, 'dependency-remediation.mjs');

const writeExecutable = (file, source) => {
  writeFileSync(file, source);
  chmodSync(file, 0o755);
};

const runAuditHelper = ({ auditBody, auditStatus }) => {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-remediation-'));
  try {
    const bin = join(directory, 'bin');
    const attempts = join(directory, 'attempts');
    const output = join(directory, 'audit.json');
    mkdirSync(bin);
    writeExecutable(
      join(bin, 'pnpm'),
      '#!/usr/bin/env bash\nprintf \'x\\n\' >> "$AUDIT_ATTEMPTS"\nprintf \'%s\\n\' "$AUDIT_BODY"\nexit "$AUDIT_STATUS"\n',
    );
    writeExecutable(
      join(bin, 'timeout'),
      '#!/usr/bin/env bash\nshift\nexec "$@"\n',
    );
    writeExecutable(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
    const result = spawnSync('bash', [helperPath, facadePath, output], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AUDIT_ATTEMPTS: attempts,
        AUDIT_BODY: auditBody,
        AUDIT_STATUS: String(auditStatus),
        PATH: `${bin}:${process.env.PATH ?? ''}`,
      },
    });
    return {
      ...result,
      attempts: readFileSync(attempts, 'utf8').trim().split('\n').length,
      outcome: readFileSync(`${output}.result`, 'utf8').trim(),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test('the facade preserves the remediation public API', () => {
  assert.deepEqual(Object.keys(remediation).sort(), [
    'buildPlan',
    'classifyPlan',
    'classifyRemediation',
    'compareResolvedVersions',
    'inspectWorkspaceDiff',
    'normalizeResolvedVersions',
    'normalizeVersions',
    'parseAudit',
    'parseAuditJson',
    'parseStableSemver',
    'parseStableVersion',
    'renderPlan',
    'renderPrBody',
    'renderRemediationPlan',
    'renderSummary',
    'validateWorkspaceDiff',
  ]);
});

test('a trusted facade copy retains its runtime closure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-remediation-copy-'));
  try {
    const copiedFacade = join(directory, 'dependency-remediation.mjs');
    const auditFile = join(directory, 'audit.json');
    cpSync(facadePath, copiedFacade);
    cpSync(
      join(scriptDirectory, 'dependency-remediation'),
      join(directory, 'dependency-remediation'),
      { recursive: true },
    );
    writeFileSync(auditFile, JSON.stringify(cleanAudit));

    const result = spawnSync(
      process.execPath,
      [realpathSync(copiedFacade), 'audit-status', '--file', auditFile],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'clean\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the checked-in audit helper accepts matched results and retries parser mismatches', () => {
  const clean = runAuditHelper({
    auditBody: JSON.stringify(cleanAudit),
    auditStatus: 0,
  });
  assert.equal(clean.status, 0);
  assert.equal(clean.attempts, 1);
  assert.equal(clean.outcome, 'clean');

  const invalid = runAuditHelper({ auditBody: '{', auditStatus: 1 });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.attempts, 3);
  assert.equal(invalid.outcome, 'registry-error');
});

test('clean audit produces a deterministic no-op plan', () => {
  const plan = classifyRemediation({
    ...baseInput(),
    beforeAudit: cleanAudit,
    afterAudit: cleanAudit,
    changedFiles: [],
  });

  assert.equal(plan.status, 'noop');
  assert.equal(plan.classification, 'none');
  assert.deepEqual(plan.advisoryIds, []);
});

test('requires independent after-audit evidence', () => {
  assert.throws(
    () => classifyRemediation(baseInput({ afterAudit: undefined })),
    /afterAudit is required/,
  );

  const directory = mkdtempSync(join(tmpdir(), 'dependency-remediation-'));
  try {
    const beforeAuditPath = join(directory, 'before-audit.json');
    writeFileSync(beforeAuditPath, JSON.stringify(vulnerableAudit));

    assert.throws(
      () => runCli(['plan', '--before-audit', beforeAuditPath]),
      /missing --after-audit/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('malformed or unknown audit JSON is rejected instead of treated as clean', () => {
  for (const audit of [
    { auditReportVersion: 2 },
    { auditReportVersion: 2, vulnerabilities: { 'example-package': null } },
    { auditReportVersion: 2, vulnerabilities: [] },
    { auditReportVersion: 2, metadata: { vulnerabilities: { high: 0 } } },
    'null',
    [],
  ]) {
    const parsed = parseAudit(audit);
    assert.equal(parsed.valid, false);
    assert.equal(parsed.registryError, false);
  }
});

test('strict stable patch with a lockfile-only diff is auto-merge eligible', () => {
  const plan = classifyRemediation(baseInput());

  assert.equal(plan.status, 'ready');
  assert.equal(plan.classification, 'patch-auto-merge');
  assert.equal(plan.mergeEligible, true);
  assert.deepEqual(plan.affectedPackages, ['example-package']);
});

test('all resolved version map changes block patch auto-merge', () => {
  const cases = [
    ['unrelated minor', { unrelated: '1.0.0' }, { unrelated: '1.1.0' }],
    ['unrelated major', { unrelated: '1.0.0' }, { unrelated: '2.0.0' }],
    [
      'unrelated prerelease',
      { unrelated: '1.0.0' },
      { unrelated: '1.0.1-beta.1' },
    ],
    ['unrelated removal', { unrelated: '1.0.0' }, {}],
    ['unrelated addition', {}, { unrelated: '1.0.0' }],
  ];
  for (const [label, beforeExtra, afterExtra] of cases) {
    const plan = classifyRemediation(
      baseInput({
        versionsBefore: { 'example-package': '1.2.2', ...beforeExtra },
        versionsAfter: { 'example-package': '1.2.3', ...afterExtra },
      }),
    );
    assert.equal(plan.status, 'ready', label);
    assert.equal(plan.classification, 'review-required', label);
    assert.equal(plan.mergeEligible, false, label);
  }

  const ambiguous = classifyRemediation(
    baseInput({
      versionsAfter: [
        { name: 'example-package', version: '1.2.3' },
        { name: 'example-package', version: '1.2.4' },
      ],
    }),
  );
  assert.equal(ambiguous.status, 'ready');
  assert.equal(ambiguous.classification, 'review-required');
  assert.match(ambiguous.reasons.join('\n'), /ambiguous|missing/i);
});

test('pnpm advisories JSON preserves legacy advisory ids and finding versions', () => {
  const parsed = parseAudit({
    advisories: {
      12345: {
        id: 12345,
        module_name: 'example-package',
        severity: 'high',
        vulnerable_versions: '<1.2.3',
        patched_versions: '>=1.2.3',
        findings: [{ version: '1.2.2', paths: ['example-package'] }],
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 },
    },
  });

  assert.equal(parsed.valid, true);
  assert.equal(parsed.highCritical[0].id, '12345');
  assert.deepEqual(parsed.highCritical[0].versions, ['1.2.2']);
  assert.deepEqual(parsed.highCritical[0].patchedVersions, ['>=1.2.3']);
});

test('minor, major, and prerelease changes remain review-required', () => {
  for (const version of ['1.3.0', '2.0.0', '1.2.3-beta.1']) {
    const plan = classifyRemediation(
      baseInput({ versionsAfter: { 'example-package': version } }),
    );

    assert.equal(plan.status, 'ready');
    assert.equal(plan.classification, 'review-required');
    assert.equal(plan.mergeEligible, false);
  }
});

test('an exact fresh release-age exclusion is review-required and advisory-linked', () => {
  const beforeWorkspace = [
    'minimumReleaseAge: 10080',
    'minimumReleaseAgeExclude:',
    '  - old-package@1.0.0',
    'minimumReleaseAgeStrict: true',
    '',
  ].join('\n');
  const afterWorkspace = [
    'minimumReleaseAge: 10080',
    'minimumReleaseAgeExclude:',
    '  - old-package@1.0.0',
    '  - example-package@1.2.3',
    'minimumReleaseAgeStrict: true',
    '',
  ].join('\n');
  const plan = classifyRemediation(
    baseInput({
      changedFiles: ['pnpm-lock.yaml', 'pnpm-workspace.yaml'],
      workspaceBefore: beforeWorkspace,
      workspaceAfter: afterWorkspace,
    }),
  );

  assert.equal(plan.status, 'ready');
  assert.equal(plan.classification, 'review-required');
  assert.deepEqual(plan.releaseAgeExceptions, ['example-package@1.2.3']);
  assert.match(renderPlan(plan), /example-package@1\.2\.3/);
  assert.match(renderPlan(plan), /CODEOWNER.*publish timestamp/s);
  assert.match(renderPlan(plan), /cannot be auto-merged/);
});

test('unrelated workspace edits are rejected', () => {
  const plan = classifyRemediation(
    baseInput({
      changedFiles: ['pnpm-lock.yaml', 'pnpm-workspace.yaml'],
      workspaceBefore: 'minimumReleaseAge: 10080\n',
      workspaceAfter: 'minimumReleaseAge: 60\n',
    }),
  );

  assert.equal(plan.status, 'rejected');
  assert.match(plan.reasons.join('\n'), /workspace/i);
});

test('manifest and unexpected files are rejected before publication', () => {
  for (const changedFiles of [['package.json'], ['pnpm-lock.yaml', '.env']]) {
    const plan = classifyRemediation(baseInput({ changedFiles }));
    assert.equal(plan.status, 'rejected');
    assert.match(plan.reasons.join('\n'), /unexpected|allowlist/i);
  }
});

test('residual high or critical findings are rejected', () => {
  const plan = classifyRemediation(baseInput({ afterAudit: vulnerableAudit }));

  assert.equal(plan.status, 'rejected');
  assert.match(plan.reasons.join('\n'), /residual/i);
});

test('rejects multiple high or critical findings that map to one package', () => {
  const plan = classifyRemediation(
    baseInput({
      beforeAudit: {
        ...vulnerableAudit,
        vulnerabilities: {
          ...vulnerableAudit.vulnerabilities,
          'example-package-second-advisory': {
            ...vulnerableAudit.vulnerabilities['example-package'],
            name: 'example-package',
            via: [
              {
                source: 'GHSA-example-second',
                severity: 'high',
                range: '<1.2.3',
                title: 'Second example advisory',
              },
            ],
          },
        },
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 0,
            high: 2,
            critical: 0,
          },
        },
      },
    }),
  );

  assert.equal(plan.status, 'rejected');
  assert.match(
    plan.reasons.join('\n'),
    /multiple high\/critical findings to the same package ambiguously/i,
  );
});

test('registry failures and non-JSON audit responses fail closed', () => {
  for (const beforeAudit of [
    { error: { code: 'ERR_PNPM_META_FETCH_FAIL', message: 'timeout' } },
    '<html>registry timeout</html>',
  ]) {
    const parsed = parseAudit(beforeAudit);
    assert.equal(parsed.valid, false);
    const plan = classifyRemediation(baseInput({ beforeAudit }));
    assert.equal(plan.status, 'rejected');
    assert.equal(plan.registryError, true);
  }
});

test('identical input renders byte-for-byte identical plan evidence', () => {
  const first = classifyRemediation(baseInput());
  const second = classifyRemediation(baseInput());

  assert.deepEqual(first, second);
  assert.equal(renderPlan(first), renderPlan(second));
});

test('non-exact or advisory-unrelated release-age exclusions are rejected', () => {
  const beforeWorkspace =
    'minimumReleaseAgeExclude:\n  - old-package@1.0.0\nnext: true\n';
  for (const value of ['example-package@^1.2.3', 'other-package@1.2.3']) {
    const plan = classifyRemediation(
      baseInput({
        changedFiles: ['pnpm-lock.yaml', 'pnpm-workspace.yaml'],
        workspaceBefore: beforeWorkspace,
        workspaceAfter: beforeWorkspace.replace(
          '  - old-package@1.0.0',
          `  - old-package@1.0.0\n  - ${value}`,
        ),
      }),
    );

    assert.equal(plan.status, 'rejected');
    assert.match(plan.reasons.join('\n'), /exception|release-age|advisory/i);
  }
});
