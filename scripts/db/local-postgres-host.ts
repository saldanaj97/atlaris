const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function getPostgresHostname(connectionUrl: string): string | null {
  try {
    return new URL(connectionUrl).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

export function isLocalPostgresHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname);
}
