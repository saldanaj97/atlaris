/** Workflow instance IDs are at most 100 characters (design note, Decision 4). */
const MAX_INSTANCE_ID_LENGTH = 100;
const SAFE_SUFFIX = /^[A-Za-z0-9_-]+$/;
/** 128 bits of SHA-256 keeps collisions out of reach and the ID short. */
const HASH_SUFFIX_HEX_CHARS = 32;

const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * `lessons-<moduleId>-<suffix>`: the suffix is `batchRequestId` when it is
 * URL-safe and the ID fits, otherwise a SHA-256 hex prefix of it. The same
 * claim therefore always maps to the same instance.
 */
export async function moduleLessonsInstanceId(
  moduleId: string,
  batchRequestId: string,
): Promise<string> {
  const prefix = `lessons-${moduleId}-`;
  if (
    SAFE_SUFFIX.test(batchRequestId) &&
    prefix.length + batchRequestId.length <= MAX_INSTANCE_ID_LENGTH
  ) {
    return `${prefix}${batchRequestId}`;
  }
  const hash = await sha256Hex(batchRequestId);
  return `${prefix}${hash.slice(0, HASH_SUFFIX_HEX_CHARS)}`;
}
