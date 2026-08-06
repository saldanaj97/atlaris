const markdown = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');

/** Render stable, reviewable evidence for a plan/PR body. */
export function renderPlan(plan) {
  const lines = [
    '# Dependency security remediation',
    '',
    `- Classification: ${plan.classification}`,
    `- Status: ${plan.status}`,
    `- Base SHA: ${plan.baseSha ?? 'unknown'}`,
    `- Merge eligible: ${plan.mergeEligible ? 'yes' : 'no'}`,
  ];
  if (plan.status === 'noop') {
    lines.push(
      '',
      'The production audit was clean; no branch or pull request is required.',
    );
    return `${lines.join('\n')}\n`;
  }
  if (plan.reasons?.length) {
    lines.push(
      '',
      '## Safety notes',
      '',
      ...plan.reasons.map((reason) => `- ${reason}`),
    );
  }
  lines.push('', '## Advisories', '');
  if (plan.findings?.length) {
    lines.push(
      '| Advisory | Package | Severity | Vulnerable range | Patched guidance |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const finding of [...plan.findings].sort((left, right) =>
      `${left.package ?? ''}|${left.id ?? ''}`.localeCompare(
        `${right.package ?? ''}|${right.id ?? ''}`,
      ),
    )) {
      lines.push(
        `| ${markdown(finding.id ?? 'unknown')} | ${markdown(finding.package ?? 'unknown')} | ${markdown(finding.severity ?? 'unknown')} | ${markdown(finding.range ?? 'unknown')} | ${markdown(finding.patchedVersions?.join(', ') || 'unknown')} |`,
      );
    }
  } else {
    lines.push('No high/critical advisory details were reported.');
  }
  lines.push('', '## Resolved versions', '');
  if (plan.affectedPackages?.length) {
    lines.push('| Package | Before | After |', '| --- | --- | --- |');
    for (const packageValue of plan.affectedPackages) {
      const versions = plan.versions?.[packageValue] ?? {};
      lines.push(
        `| ${markdown(packageValue)} | ${markdown(versions.before ?? 'unknown')} | ${markdown(versions.after ?? 'unknown')} |`,
      );
    }
  } else {
    lines.push('No package version mapping was available.');
  }
  if (plan.resolvedVersionChanges?.length) {
    lines.push(
      '',
      '### All resolved-version changes',
      '',
      '| Package | Before map | After map |',
      '| --- | --- | --- |',
    );
    for (const change of plan.resolvedVersionChanges) {
      lines.push(
        `| ${markdown(change.package)} | ${markdown(change.before?.join(', ') || 'absent')} | ${markdown(change.after?.join(', ') || 'absent')} |`,
      );
    }
  }
  lines.push(
    '',
    '## Changed files',
    '',
    ...(plan.changedFiles ?? []).map((file) => `- \`${file}\``),
  );
  lines.push('', '## Release-age exceptions', '');
  if (plan.releaseAgeExceptions?.length) {
    lines.push(...plan.releaseAgeExceptions.map((entry) => `- \`${entry}\``));
    lines.push(
      '',
      '## Required human review',
      '',
      '- A CODEOWNER must verify the registry publish timestamp and confirm each exception is younger than the configured release-age hold.',
      '- The approver must record why waiting for the normal release-age hold is unsafe for this advisory.',
      '- This PR is review-required and cannot be auto-merged.',
    );
  } else {
    lines.push('None.');
  }
  lines.push(
    '',
    'The after-remediation production audit contains no high/critical finding.',
  );
  return `${lines.join('\n')}\n`;
}

export function renderSummary(plan) {
  if (plan.status === 'noop')
    return 'Dependency security remediation: audit clean; no PR created.\n';
  const lines = [
    `Dependency security remediation: ${plan.status}`,
    `classification=${plan.classification}`,
    `base_sha=${plan.baseSha ?? 'unknown'}`,
    `advisories=${plan.advisoryIds?.join(', ') || 'unknown'}`,
    ...(plan.resolvedVersionChanges ?? []).map(
      (change) =>
        `- resolved-version-change package=${change.package} before=${change.before?.join(',') || 'absent'} after=${change.after?.join(',') || 'absent'}`,
    ),
    ...(plan.findings ?? []).map(
      (finding) =>
        `- ${finding.id ?? 'unknown'} package=${finding.package ?? 'unknown'} severity=${finding.severity ?? 'unknown'} direct=${finding.direct ? 'yes' : 'no'} range=${finding.range ?? 'unknown'} patched=${finding.patchedVersions?.join(', ') || 'unknown'}`,
    ),
    ...(plan.reasons ?? []).map((reason) => `- ${reason}`),
  ];
  return `${lines.join('\n')}\n`;
}
