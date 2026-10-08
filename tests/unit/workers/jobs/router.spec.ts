import { handleFetch } from '../../../../workers/jobs/src/http/router';
import { describe, expect, it } from 'vitest';

const env = {
  CF_VERSION_METADATA: { id: 'version-123', tag: '', timestamp: '' },
};

describe('handleFetch', () => {
  it('reports health and the running version on GET /healthz', async () => {
    const response = handleFetch(
      new Request('https://workers-staging.atlaris.app/healthz'),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      versionId: 'version-123',
    });
  });

  it.each([
    ['GET', '/'],
    ['GET', '/healthz/extra'],
    ['GET', '/v1/regeneration/enqueue'],
    ['POST', '/healthz'],
  ])('returns 404 for %s %s', async (method, path) => {
    const response = handleFetch(
      new Request(`https://workers-staging.atlaris.app${path}`, { method }),
      env,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
  });
});
