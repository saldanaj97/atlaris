import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { resourceType } from '@/lib/db/enums';
import { getDb } from '@/lib/db/runtime';
import { resources } from '@/lib/db/schema';

const DEFAULT_RESOURCES_LIMIT = 50;
const MAX_RESOURCES_LIMIT = 100;

const resourcesQuerySchema = z.object({
  type: z.enum(resourceType.enumValues).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_RESOURCES_LIMIT)
    .default(DEFAULT_RESOURCES_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/v1/resources
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req }) => {
    const url = new URL(req.url);
    const queryInput = {
      type: url.searchParams.get('type') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    };

    const parsedQuery = resourcesQuerySchema.safeParse(queryInput);
    if (!parsedQuery.success) {
      throw new ValidationError(
        'Invalid resources query parameters',
        parsedQuery.error.flatten()
      );
    }

    const db = getDb();
    const rows = await db
      .select({
        id: resources.id,
        type: resources.type,
        title: resources.title,
        url: resources.url,
        domain: resources.domain,
        author: resources.author,
        durationMinutes: resources.durationMinutes,
        tags: resources.tags,
      })
      .from(resources)
      .where(
        parsedQuery.data.type
          ? eq(resources.type, parsedQuery.data.type)
          : undefined
      )
      .orderBy(desc(resources.createdAt))
      .limit(parsedQuery.data.limit)
      .offset(parsedQuery.data.offset);

    return json(rows);
  })
);
