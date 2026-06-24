export function createMaintenancePostRequest(
  url: string,
  init: RequestInit & { token?: string; useBearer?: boolean } = {},
): Request {
  const { token, useBearer = true, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);

  if (token) {
    if (useBearer) {
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      headers.set('x-maintenance-worker-token', token);
    }
  }

  return new Request(url, {
    method: 'POST',
    ...requestInit,
    headers,
  });
}
