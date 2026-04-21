import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { withAuthAndRateLimit } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseListPaginationParams } from '@/lib/api/pagination';
import { json } from '@/lib/api/response';
import { resourceType } from '@/lib/db/enums';
import { getDb } from '@/lib/db/runtime';
import { resources } from '@/lib/db/schema';
import { PAGINATION_MAX_LIMIT } from '@/shared/constants/pagination';

const DEFAULT_RESOURCES_LIMIT = 50;

const resourcesTypeQuerySchema = z.object({
  type: z.enum(resourceType.enumValues).optional(),
});

// GET /api/v1/resources
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req }) => {
    const url = new URL(req.url);

    const parsedTypeQuery = resourcesTypeQuerySchema.safeParse({
      type: url.searchParams.get('type') ?? undefined,
    });
    if (!parsedTypeQuery.success) {
      throw new ValidationError(
        'Invalid resources query parameters',
        parsedTypeQuery.error.flatten()
      );
    }

    const { limit, offset } = parseListPaginationParams(url.searchParams, {
      defaultLimit: DEFAULT_RESOURCES_LIMIT,
      maxLimit: PAGINATION_MAX_LIMIT,
    });

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
        parsedTypeQuery.data.type
          ? eq(resources.type, parsedTypeQuery.data.type)
          : undefined
      )
      .orderBy(desc(resources.createdAt))
      .limit(limit)
      .offset(offset);

    return json(rows);
  })
);
