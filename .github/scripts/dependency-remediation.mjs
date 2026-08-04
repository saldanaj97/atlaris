import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HIGH_SEVERITIES = new Set(['high', 'critical']);
const AUDIT_COUNT_FIELDS = ['info', 'low', 'moderate', 'high', 'critical'];
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const EXACT_PACKAGE_VERSION =
  /^(@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|[A-Za-z0-9._-]+)@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)$/;

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const asJson = (input) => {
  if (isObject(input) || Array.isArray(input)) return input;
  if (typeof input !== 'string' || input.trim() === '') return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
};

const numberOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const severity = (value) => {
  const normalized = String(value ?? '').toLowerCase();
  return ['info', 'low', 'moderate', 'high', 'critical'].includes(normalized)
    ? normalized
    : null;
};

const maxSeverity = (values) => {
  const order = ['info', 'low', 'moderate', 'high', 'critical'];
  return values
    .map(severity)
    .filter(Boolean)
    .sort((left, right) => order.indexOf(right) - order.indexOf(left))[0];
};

const packageName = (value) => {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.startsWith('node_modules/'))
    return value.slice('node_modules/'.length);
  if (value.startsWith('/node_modules/'))
    return value.slice('/node_modules/'.length);
  if (/^@[^/]+\/[^/]+$/.test(value) || /^[A-Za-z0-9._-]+$/.test(value))
    return value;
  return null;
};

const advisoryId = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const registryErrorIn = (root) => {
  if (!isObject(root)) return false;
  if (root.error !== undefined || root.errors !== undefined) return true;
  if (
    typeof root.code === 'string' &&
    /(?:ERR_PNPM|EAI_AGAIN|ENOTFOUND|ECONN|ETIMEDOUT|EHTTP|FETCH|TIMEOUT)/i.test(
      root.code,
    )
  ) {
    return true;
  }
  if (
    typeof root.message === 'string' &&
    /(?:registry|timeout|network|fetch|audit.+fail|meta.+fetch)/i.test(
      root.message,
    ) &&
    root.vulnerabilities === undefined &&
    root.advisories === undefined &&
    root.metadata === undefined
  ) {
    return true;
  }
  return false;
};

const metadataCounts = (root) => {
  const counts = root?.metadata?.vulnerabilities;
  if (
    !isObject(counts) ||
    !['high', 'critical'].every(
      (field) =>
        typeof counts[field] === 'number' &&
        Number.isFinite(counts[field]) &&
        counts[field] >= 0,
    ) ||
    AUDIT_COUNT_FIELDS.some(
      (field) =>
        counts[field] !== undefined &&
        (typeof counts[field] !== 'number' ||
          !Number.isFinite(counts[field]) ||
          counts[field] < 0),
    )
  ) {
    return null;
  }
  return {
    info: numberOrZero(counts.info),
    low: numberOrZero(counts.low),
    moderate: numberOrZero(counts.moderate),
    high: numberOrZero(counts.high),
    critical: numberOrZero(counts.critical),
  };
};

const viaDetails = (via) => {
  const values = Array.isArray(via) ? via : via === undefined ? [] : [via];
  const details = [];
  for (const item of values) {
    if (typeof item === 'string' || typeof item === 'number') {
      details.push({ id: advisoryId(item) });
      continue;
    }
    if (!isObject(item)) continue;
    details.push({
      id: advisoryId(item.id ?? item.source ?? item.ghsa ?? item.cve),
      severity: severity(item.severity),
      range:
        item.range ??
        item.vulnerable_versions ??
        item.vulnerableVersions ??
        null,
      patchedVersions:
        item.patched_versions ??
        item.patchedVersions ??
        item.fixAvailable?.version ??
        null,
      title: typeof item.title === 'string' ? item.title : null,
    });
  }
  return details;
};

const normalizeFinding = (key, raw) => {
  if (!isObject(raw)) return null;
  const via = viaDetails(raw.via);
  const packageValue =
    packageName(raw.module_name) ??
    packageName(raw.packageName) ??
    packageName(raw.name) ??
    packageName(key);
  const ids = [
    advisoryId(raw.id),
    advisoryId(raw.source),
    advisoryId(raw.ghsa),
    advisoryId(raw.cve),
    ...via.map((item) => item.id),
    typeof key === 'string' && /^(?:\d+|GHSA-|CVE-)/i.test(key)
      ? advisoryId(key)
      : null,
  ].filter(Boolean);
  const versions = Array.isArray(raw.findings)
    ? raw.findings
        .map((finding) => finding?.version)
        .filter((value) => typeof value === 'string')
    : [];
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.map(packageName).filter(Boolean)
    : [];
  const patchedVersions = [
    raw.patched_versions,
    raw.patchedVersions,
    raw.fixAvailable?.version,
    ...via.map((item) => item.patchedVersions),
  ]
    .filter((value) => typeof value === 'string')
    .sort();
  const ranges = [
    raw.vulnerable_versions,
    raw.vulnerableVersions,
    raw.range,
    ...via.map((item) => item.range),
  ]
    .filter((value) => typeof value === 'string')
    .sort();
  const foundSeverity = maxSeverity([
    raw.severity,
    ...via.map((item) => item.severity),
  ]);
  return {
    id: ids[0] ?? null,
    advisoryIds: [...new Set(ids)].sort(),
    package: packageValue,
    severity: foundSeverity,
    range: ranges[0] ?? null,
    patchedVersions: [...new Set(patchedVersions)],
    versions: [...new Set(versions)].sort(),
    nodes: [...new Set(nodes)].sort(),
    direct:
      raw.isDirect === true ||
      raw.is_direct === true ||
      raw.dev === false ||
      raw.devOptional === false,
    title:
      typeof raw.title === 'string'
        ? raw.title
        : (via.find((item) => item.title)?.title ?? null),
  };
};

const dedupeFindings = (findings) => {
  const byKey = new Map();
  for (const finding of findings.filter(Boolean)) {
    const key = [
      finding.id,
      finding.package,
      finding.severity,
      finding.range,
    ].join('|');
    if (!byKey.has(key)) {
      byKey.set(key, finding);
      continue;
    }
    const existing = byKey.get(key);
    byKey.set(key, {
      ...existing,
      advisoryIds: [
        ...new Set([...existing.advisoryIds, ...finding.advisoryIds]),
      ].sort(),
      patchedVersions: [
        ...new Set([...existing.patchedVersions, ...finding.patchedVersions]),
      ].sort(),
      versions: [
        ...new Set([...existing.versions, ...finding.versions]),
      ].sort(),
      nodes: [...new Set([...existing.nodes, ...finding.nodes])].sort(),
      direct: existing.direct || finding.direct,
    });
  }
  return [...byKey.values()].sort((left, right) =>
    [left.package ?? '', left.id ?? '', left.severity ?? '']
      .join('|')
      .localeCompare(
        [right.package ?? '', right.id ?? '', right.severity ?? ''].join('|'),
      ),
  );
};

/** Parse pnpm audit JSON without relying on pnpm's transitive dependencies. */
export function parseAudit(input) {
  const root = asJson(input);
  if (root === null) {
    const jsonNull = typeof input === 'string' && input.trim() === 'null';
    return {
      valid: false,
      registryError: !jsonNull,
      error: jsonNull
        ? 'audit JSON was null'
        : 'audit output was not valid JSON',
    };
  }
  if (registryErrorIn(root)) {
    return {
      valid: false,
      registryError: true,
      error: 'audit reported a registry or infrastructure error',
    };
  }
  const counts = metadataCounts(root);
  const findings = [];
  const findingContainers = [
    ['advisories', root.advisories],
    ['vulnerabilities', root.vulnerabilities],
  ].filter(([, value]) => value !== undefined);
  if (findingContainers.some(([, value]) => !isObject(value))) {
    return {
      valid: false,
      registryError: false,
      error: 'audit findings were not object maps',
    };
  }
  if (isObject(root.advisories)) {
    for (const [key, value] of Object.entries(root.advisories)) {
      const finding = normalizeFinding(key, value);
      if (!finding) {
        return {
          valid: false,
          registryError: false,
          error: 'audit advisory entry was not an object',
        };
      }
      findings.push(finding);
    }
  }
  if (isObject(root.vulnerabilities)) {
    for (const [key, value] of Object.entries(root.vulnerabilities)) {
      const finding = normalizeFinding(key, value);
      if (!finding) {
        return {
          valid: false,
          registryError: false,
          error: 'audit vulnerability entry was not an object',
        };
      }
      findings.push(finding);
    }
  }

  const normalizedFindings = dedupeFindings(findings);
  const countHighCritical = counts ? counts.high + counts.critical : 0;
  const findingHighCritical = normalizedFindings.filter((finding) =>
    HIGH_SEVERITIES.has(finding.severity),
  ).length;
  const unknownSeverity = normalizedFindings.some(
    (finding) => !finding.severity,
  );
  const ambiguous =
    unknownSeverity ||
    (countHighCritical > findingHighCritical && countHighCritical > 0) ||
    normalizedFindings.some(
      (finding) => HIGH_SEVERITIES.has(finding.severity) && !finding.package,
    );

  const hasFindingContainer = findingContainers.length > 0;
  const hasTrustworthyAudit = counts !== null || normalizedFindings.length > 0;
  if (
    !hasTrustworthyAudit ||
    (!counts && hasFindingContainer && normalizedFindings.length === 0)
  ) {
    return {
      valid: false,
      registryError: false,
      error: 'unrecognized or incomplete audit JSON shape',
    };
  }

  const highCritical = normalizedFindings.filter((finding) =>
    HIGH_SEVERITIES.has(finding.severity),
  );
  if (countHighCritical > findingHighCritical) {
    highCritical.push({
      id: null,
      advisoryIds: [],
      package: null,
      severity: 'unknown',
      range: null,
      patchedVersions: [],
      versions: [],
      nodes: [],
      direct: false,
      title: null,
    });
  }

  return {
    valid: true,
    registryError: false,
    ambiguous,
    clean: countHighCritical === 0 && highCritical.length === 0 && !ambiguous,
    counts: counts ?? {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
    },
    findings: normalizedFindings,
    highCritical,
    advisoryIds: [
      ...new Set(normalizedFindings.flatMap((finding) => finding.advisoryIds)),
    ].sort(),
  };
}

export const parseAuditJson = parseAudit;

/** Parse only strict stable x.y.z versions. */
export function parseStableVersion(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(STABLE_VERSION);
  if (!match) return null;
  return {
    raw: value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export const parseStableSemver = parseStableVersion;

const addResolvedVersion = (versions, name, value) => {
  const packageValue = packageName(name);
  if (
    !packageValue ||
    typeof value !== 'string' ||
    value.length === 0 ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)
  ) {
    return;
  }
  if (!versions.has(packageValue)) versions.set(packageValue, new Set());
  versions.get(packageValue).add(value);
};

/** Normalize pnpm list --json output, or a package-to-version map, without reading lockfile YAML. */
export function normalizeResolvedVersions(input) {
  const root = asJson(input);
  if (root === null)
    return {
      valid: false,
      error: 'resolved package output was not valid JSON',
    };
  const versions = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isObject(value)) return;
    if (typeof value.name === 'string' && typeof value.version === 'string') {
      addResolvedVersion(versions, value.name, value.version);
    }
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string') addResolvedVersion(versions, key, child);
      if (isObject(child) && typeof child.version === 'string')
        addResolvedVersion(versions, key, child.version);
      if (Array.isArray(child)) {
        for (const item of child) {
          if (typeof item === 'string') addResolvedVersion(versions, key, item);
          if (isObject(item) && typeof item.version === 'string')
            addResolvedVersion(versions, key, item.version);
        }
      }
      visit(child);
    }
  };
  visit(root);
  return {
    valid: true,
    versions: Object.fromEntries(
      [...versions.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, values]) => [name, [...values].sort()]),
    ),
  };
}

export const normalizeVersions = normalizeResolvedVersions;

const versionsFor = (input, packageValue) => {
  const normalized = normalizeResolvedVersions(input);
  if (!normalized.valid)
    return { values: [], ambiguous: true, error: normalized.error };
  const values = normalized.versions[packageValue] ?? [];
  return { values, ambiguous: values.length !== 1 };
};

const compareResolvedVersionMaps = (beforeInput, afterInput) => {
  const before = normalizeResolvedVersions(beforeInput);
  const after = normalizeResolvedVersions(afterInput);
  if (!before.valid || !after.valid) {
    return {
      valid: false,
      changes: [],
      error: 'resolved version map was not valid JSON',
    };
  }
  const packages = [
    ...new Set([
      ...Object.keys(before.versions),
      ...Object.keys(after.versions),
    ]),
  ].sort();
  const changes = packages
    .filter(
      (packageValue) =>
        JSON.stringify(before.versions[packageValue] ?? []) !==
        JSON.stringify(after.versions[packageValue] ?? []),
    )
    .map((packageValue) => ({
      package: packageValue,
      before: before.versions[packageValue] ?? [],
      after: after.versions[packageValue] ?? [],
    }));
  return { valid: true, changes };
};

export const compareResolvedVersions = compareResolvedVersionMaps;

const workspaceLine = (line) => line.replace(/\r$/, '');

const workspaceBlock = (text) => {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n');
  const start = lines.findIndex(
    (line) => workspaceLine(line) === 'minimumReleaseAgeExclude:',
  );
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length) {
    const line = workspaceLine(lines[end]);
    if (line === '' || /^\s/.test(line)) {
      end += 1;
      continue;
    }
    break;
  }
  return { lines, start, end, body: lines.slice(start + 1, end) };
};

const exactException = (raw) => {
  if (typeof raw !== 'string') return null;
  let value = workspaceLine(raw).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const quote = value[0];
    value = value.slice(1, -1);
    if (quote === '"' && value.includes('\\')) return null;
  } else if (value.includes('"') || value.includes("'")) {
    return null;
  }
  const match = value.match(EXACT_PACKAGE_VERSION);
  return match ? { value, package: match[1], version: match[2] } : null;
};

const entryLine = (line) => {
  const match = workspaceLine(line).match(/^ {2}- (.+)$/);
  return match ? exactException(match[1]) : null;
};

/** Prove that workspace changes are only additions to minimumReleaseAgeExclude. */
export function inspectWorkspaceDiff(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'workspace contents are required',
    };
  }
  if (before === after)
    return { valid: true, changed: false, additions: [], entries: [] };
  const beforeBlock = workspaceBlock(before);
  const afterBlock = workspaceBlock(after);
  if (!beforeBlock || !afterBlock) {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'workspace minimumReleaseAgeExclude block is missing',
    };
  }
  const outsideBefore = [
    ...beforeBlock.lines.slice(0, beforeBlock.start),
    ...beforeBlock.lines.slice(beforeBlock.end),
  ];
  const outsideAfter = [
    ...afterBlock.lines.slice(0, afterBlock.start),
    ...afterBlock.lines.slice(afterBlock.end),
  ];
  if (JSON.stringify(outsideBefore) !== JSON.stringify(outsideAfter)) {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'workspace content outside exclusion block changed',
    };
  }

  const additions = [];
  let cursor = 0;
  for (const line of afterBlock.body) {
    if (cursor < beforeBlock.body.length && line === beforeBlock.body[cursor]) {
      cursor += 1;
      continue;
    }
    const parsed = entryLine(line);
    if (!parsed) {
      return {
        valid: false,
        changed: true,
        additions: [],
        error: 'workspace release-age block contains a non-addition change',
      };
    }
    additions.push(parsed);
  }
  if (cursor !== beforeBlock.body.length) {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'existing release-age exclusions were removed or reordered',
    };
  }

  const allEntries = [
    ...beforeBlock.body,
    ...additions.map((item) => `  - ${item.value}`),
  ]
    .map(entryLine)
    .filter(Boolean)
    .map((item) => item.value);
  if (new Set(allEntries).size !== allEntries.length) {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'release-age exclusions contain duplicates',
    };
  }
  return {
    valid: true,
    changed: true,
    additions: additions.map((item) => item.value).sort(),
    entries: additions,
  };
}

export const validateWorkspaceDiff = inspectWorkspaceDiff;

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

const markdown = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');

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
  const resolvedMaps = compareResolvedVersionMaps(
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

export const classifyPlan = classifyRemediation;
export const buildPlan = classifyRemediation;

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

export const renderPrBody = renderPlan;
export const renderRemediationPlan = renderPlan;

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

const parseArgs = (argv) => {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    result[key] =
      argv[index + 1] && !argv[index + 1].startsWith('--')
        ? argv[++index]
        : true;
  }
  return result;
};

const readRequired = (file, label) => {
  if (typeof file !== 'string') throw new Error(`missing --${label}`);
  return readFileSync(file, 'utf8');
};

const writePlanArtifacts = (plan, outputDirectory, patchFile) => {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(
    resolve(outputDirectory, 'plan.json'),
    `${JSON.stringify(plan, null, 2)}\n`,
  );
  writeFileSync(resolve(outputDirectory, 'pr-body.md'), renderPlan(plan));
  writeFileSync(resolve(outputDirectory, 'summary.md'), renderSummary(plan));
  if (patchFile)
    copyFileSync(patchFile, resolve(outputDirectory, 'remediation.patch'));
};

const verifyWorktree = (planFile, baseSha) => {
  const plan = JSON.parse(readRequired(planFile, 'plan'));
  const actual = execFileSync('git', ['diff', '--name-only', baseSha], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(plan.changedFiles ?? [])) {
    throw new Error(`worktree files differ from plan: ${actual.join(', ')}`);
  }
  if (
    actual.some(
      (file) => !['pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(file),
    )
  ) {
    throw new Error(
      'worktree contains a file outside the remediation allowlist',
    );
  }
  if (actual.includes('pnpm-workspace.yaml')) {
    const before = execFileSync(
      'git',
      ['show', `${baseSha}:pnpm-workspace.yaml`],
      { encoding: 'utf8' },
    );
    const after = readFileSync('pnpm-workspace.yaml', 'utf8');
    const workspace = inspectWorkspaceDiff(before, after);
    if (
      !workspace.valid ||
      JSON.stringify(workspace.additions) !==
        JSON.stringify(plan.releaseAgeExceptions ?? [])
    ) {
      throw new Error(
        workspace.error ?? 'worktree workspace policy diff failed validation',
      );
    }
  }
};

const main = () => {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === 'audit-status') {
    const audit = parseAudit(readRequired(args.file ?? args.input, 'file'));
    if (!audit.valid) {
      console.error(audit.error);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`${audit.clean ? 'clean' : 'vulnerable'}\n`);
    process.exitCode = audit.clean ? 0 : 1;
    return;
  }
  if (command === 'verify-worktree') {
    verifyWorktree(args.plan, args['base-sha']);
    return;
  }
  if (command === 'plan') {
    const beforeAudit = readRequired(args['before-audit'], 'before-audit');
    const afterAudit = readRequired(
      args['after-audit'] ?? args['before-audit'],
      'after-audit',
    );
    const changedFiles = readRequired(args['changed-files'], 'changed-files');
    const input = {
      baseSha: args['base-sha'],
      beforeAudit,
      afterAudit,
      changedFiles,
      versionsBefore: args['versions-before']
        ? readRequired(args['versions-before'], 'versions-before')
        : undefined,
      versionsAfter: args['versions-after']
        ? readRequired(args['versions-after'], 'versions-after')
        : undefined,
      workspaceBefore: args['workspace-before']
        ? readRequired(args['workspace-before'], 'workspace-before')
        : undefined,
      workspaceAfter: args['workspace-after']
        ? readRequired(args['workspace-after'], 'workspace-after')
        : undefined,
    };
    const plan = classifyRemediation(input);
    writePlanArtifacts(
      plan,
      args['out-dir'] ?? 'remediation-artifact',
      args['patch-file'],
    );
    process.stdout.write(`${plan.status}\n`);
    if (plan.status === 'rejected') process.exitCode = 1;
    return;
  }
  throw new Error(
    'usage: dependency-remediation.mjs <audit-status|plan|verify-worktree> ...',
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
