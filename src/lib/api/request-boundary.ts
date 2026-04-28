import { randomUUID } from 'node:crypto';

import {
  withAuth,
  withServerActionContext,
  withServerComponentContext,
} from '@/lib/api/auth';
import { getCorrelationId } from '@/lib/api/context';
import { withRateLimit } from '@/lib/api/middleware';
import type {
  AuthHandler,
  PlainHandler,
  RouteHandlerContext,
  RouteParams,
} from '@/lib/api/types/auth.types';
import type { UserRateLimitCategory } from '@/lib/api/user-rate-limit';
import type { DbUser } from '@/lib/db/queries/types/users.types';
import { getDb } from '@/lib/db/runtime';
import type { DbClient } from '@/lib/db/types';

export type RequestScope = Readonly<{
  actor: DbUser;
  db: DbClient;
  owned: Readonly<{
    userId: string;
    dbClient: DbClient;
  }>;
  correlationId: string;
}>;

export type RouteScope = RequestScope &
  Readonly<{
    req: Request;
    params: RouteParams;
  }>;

type RequestBoundaryWork<T> = (scope: RequestScope) => Promise<T> | T;
type RouteBoundaryWork = (scope: RouteScope) => Promise<Response> | Response;

export type RouteBoundaryOptions = Readonly<{
  rateLimit?: UserRateLimitCategory;
}>;

function buildScope(actor: DbUser, db: DbClient): RequestScope {
  return {
    actor,
    db,
    owned: {
      userId: actor.id,
      dbClient: db,
    },
    correlationId: getCorrelationId() ?? randomUUID(),
  };
}

type RouteMethod = {
  (run: RouteBoundaryWork): PlainHandler;
  (options: RouteBoundaryOptions, run: RouteBoundaryWork): PlainHandler;
};

function wrapRouteBoundaryWork(run: RouteBoundaryWork): AuthHandler {
  return ({ req: currentReq, user, params }) =>
    run({
      req: currentReq,
      params,
      ...buildScope(user, getDb()),
    });
}

function createRouteMethod(): RouteMethod {
  function route(
    optionsOrRun: RouteBoundaryOptions | RouteBoundaryWork,
    maybeRun?: RouteBoundaryWork,
  ): PlainHandler {
    if (typeof optionsOrRun === 'function') {
      const handler = withAuth(wrapRouteBoundaryWork(optionsOrRun));
      return (req: Request, context?: RouteHandlerContext) =>
        handler(req, context);
    }

    if (maybeRun === undefined) {
      throw new TypeError(
        'requestBoundary.route: handler required as second argument when passing options',
      );
    }

    const options = optionsOrRun;
    const authHandler =
      options.rateLimit !== undefined
        ? withRateLimit(options.rateLimit)(wrapRouteBoundaryWork(maybeRun))
        : wrapRouteBoundaryWork(maybeRun);
    const handler = withAuth(authHandler);
    return (req: Request, context?: RouteHandlerContext) =>
      handler(req, context);
  }

  return route as RouteMethod;
}

export interface RequestBoundary {
  route: RouteMethod;
  component<T>(run: RequestBoundaryWork<T>): Promise<T | null>;
  action<T>(run: RequestBoundaryWork<T>): Promise<T | null>;
}

export function createRequestBoundary(): RequestBoundary {
  const route = createRouteMethod();
  return {
    route,
    component<T>(run: RequestBoundaryWork<T>): Promise<T | null> {
      return withServerComponentContext(async (actor) =>
        run({
          ...buildScope(actor, getDb()),
        }),
      );
    },
    action<T>(run: RequestBoundaryWork<T>): Promise<T | null> {
      return withServerActionContext(async (actor) =>
        run({
          ...buildScope(actor, getDb()),
        }),
      );
    },
  };
}

export const requestBoundary = createRequestBoundary();
