import type { WorkerEnv } from '../env';

/** `GET /healthz` reports the running version; every other request is 404. */
export function handleFetch(
  request: Request,
  env: Pick<WorkerEnv, 'CF_VERSION_METADATA'>,
): Response {
  const { pathname } = new URL(request.url);

  if (request.method === 'GET' && pathname === '/healthz') {
    return Response.json({ ok: true, versionId: env.CF_VERSION_METADATA.id });
  }

  return Response.json({ error: 'not_found' }, { status: 404 });
}
