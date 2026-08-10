import type { DbClient } from '@/lib/db/types';

import { requestBoundary } from '@/lib/api/request-boundary';

type PageActor = { readonly id: string };

export function loadAuthorizedPageEntity<TEntity, TSuccess, TUnauth>(options: {
  fetch: (ctx: { actor: PageActor; db: DbClient }) => Promise<TEntity | null>;
  notFound: () => TSuccess;
  success: (entity: TEntity) => TSuccess;
  unauthenticatedMessage: string;
  unauthenticated: (message: string) => TUnauth;
  logNotFound?: (ctx: { userId: string }) => void;
  logUnauthenticated?: () => void;
}): Promise<TSuccess | TUnauth> {
  return requestBoundary
    .component(async ({ actor, db }) => {
      const entity = await options.fetch({ actor, db });
      if (!entity) {
        options.logNotFound?.({ userId: actor.id });
        return options.notFound();
      }
      return options.success(entity);
    })
    .then((boundaryResult) => {
      if (boundaryResult !== null) {
        return boundaryResult;
      }
      options.logUnauthenticated?.();
      return options.unauthenticated(options.unauthenticatedMessage);
    });
}
