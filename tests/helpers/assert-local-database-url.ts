/**
 * Fail fast when integration tests point DATABASE_URL at a non-local host.
 * Testcontainers and docker-compose setups use localhost.
 */
export function assertLocalIntegrationDatabaseUrl(): void {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return;
  }
  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    return;
  }
  const host = hostname.replace(/^\[|\]$/g, '');
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal) {
    throw new Error(
      `Refusing to run integration tests against non-local DATABASE_URL host "${hostname}"`,
    );
  }
}
