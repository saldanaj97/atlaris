import { appEnv } from '@/lib/config/env';
import { json } from '@/lib/api/response';
import { getOpenApiDocument } from '@/lib/api/openapi/schema';

export const GET = async () => {
  if (!appEnv.isDevelopment && !appEnv.isTest) {
    return new Response('Not Found', { status: 404 });
  }

  const document = getOpenApiDocument();

  return json(document);
};
