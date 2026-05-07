import { getOpenApiDocument } from '@/lib/api/openapi';
import { json } from '@/lib/api/response';

import { enforceDocsAccess } from '../enforce-docs-access';

export const GET = async (request: Request) => {
  const denied = enforceDocsAccess(request);
  if (denied) return denied;

  const document = await getOpenApiDocument();

  return json(document);
};
