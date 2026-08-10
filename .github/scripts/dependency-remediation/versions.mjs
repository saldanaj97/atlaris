import { asJson, isObject, packageName, STABLE_VERSION } from './shared.mjs';

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


export const versionsFor = (input, packageValue) => {
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
