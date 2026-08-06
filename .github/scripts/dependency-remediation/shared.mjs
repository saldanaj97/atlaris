export const HIGH_SEVERITIES = new Set(['high', 'critical']);
export const AUDIT_COUNT_FIELDS = ['info', 'low', 'moderate', 'high', 'critical'];
export const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const EXACT_PACKAGE_VERSION =
  /^(@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|[A-Za-z0-9._-]+)@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)$/;

export const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const asJson = (input) => {
  if (isObject(input) || Array.isArray(input)) return input;
  if (typeof input !== 'string' || input.trim() === '') return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
};

export const numberOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

export const packageName = (value) => {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.startsWith('node_modules/'))
    return value.slice('node_modules/'.length);
  if (value.startsWith('/node_modules/'))
    return value.slice('/node_modules/'.length);
  if (/^@[^/]+\/[^/]+$/.test(value) || /^[A-Za-z0-9._-]+$/.test(value))
    return value;
  return null;
};
