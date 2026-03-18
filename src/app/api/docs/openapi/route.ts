import { toErrorResponse } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { appEnv } from '@/lib/config/env';
import { json } from '@/lib/api/response';
import { getOpenApiDocument } from '@/lib/api/openapi';

export const GET = async (request: Request) => {
  if (!appEnv.isDevelopment && !appEnv.isTest) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    checkIpRateLimit(request, 'docs');
  } catch (error) {
    return toErrorResponse(error);
  }

  const document = await getOpenApiDocument();

  return json(document);
};
