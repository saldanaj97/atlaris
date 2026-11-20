export function normalizeProxyPathname(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const hasDotSegment = decoded
    .split('/')
    .some((segment) => segment === '.' || segment === '..');
  return hasDotSegment ? null : decoded;
}
