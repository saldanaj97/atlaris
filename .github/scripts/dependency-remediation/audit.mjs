import {
  asJson,
  AUDIT_COUNT_FIELDS,
  HIGH_SEVERITIES,
  isObject,
  numberOrZero,
  packageName,
} from './shared.mjs';

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
