import type {
  AuthHandler,
  PlainHandler,
  RouteParams,
} from '@/lib/api/types/auth.types';
import type { UserRateLimitCategory } from '@/lib/api/user-rate-limit';
import type { ActorUser } from '@/lib/db/queries/types/users.types';
import type { DbClient } from '@/lib/db/types';

import {
  runServerComponentContext,
  withAuth,
  withServerActionContext,
} from '@/lib/api/auth';
import { getCorrelationId } from '@/lib/api/context';
import { withErrorBoundary, withRateLimit } from '@/lib/api/route-wrappers';
import { checkUserRateLimit } from '@/lib/api/user-rate-limit';
import { getDb } from '@supabase/runtime';
import { randomUUID } from 'node:crypto';

export type RequestScope = Readonly<{
  actor: ActorUser;
  db: DbClient;
  owned: Readonly<{
    userId: string;
    dbClient: DbClient;
  }>;
  correlationId: string;
}>;

type RouteScope = RequestScope &
  Readonly<{
    req: Request;
    params: RouteParams;
  }>;

type RequestBoundaryWork<T> = (scope: RequestScope) => Promise<T> | T;
type RouteBoundaryWork = (scope: RouteScope) => Promise<Response> | Response;

type RateLimitBoundaryOptions = Readonly<{
  rateLimit?: UserRateLimitCategory;
}>;

function buildScope(actor: ActorUser, db: DbClient): RequestScope {
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
  (options: RateLimitBoundaryOptions, run: RouteBoundaryWork): PlainHandler;
};

type ActionMethod = {
  <T>(run: RequestBoundaryWork<T>): Promise<T | null>;
  <T>(
    options: RateLimitBoundaryOptions,
    run: RequestBoundaryWork<T>,
  ): Promise<T | null>;
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
    optionsOrRun: RateLimitBoundaryOptions | RouteBoundaryWork,
    maybeRun?: RouteBoundaryWork,
  ): PlainHandler {
    let options: RateLimitBoundaryOptions | undefined;
    let run: RouteBoundaryWork;

    if (typeof optionsOrRun === 'function') {
      run = optionsOrRun;
    } else if (maybeRun === undefined) {
      throw new TypeError(
        'requestBoundary.route: handler required as second argument when passing options',
      );
    } else {
      options = optionsOrRun;
      run = maybeRun;
    }

    let authHandler = wrapRouteBoundaryWork(run);
    if (options?.rateLimit !== undefined) {
      authHandler = withRateLimit(options.rateLimit)(authHandler);
    }

    const handler = withAuth(authHandler);
    return withErrorBoundary(handler);
  }

  return route as RouteMethod;
}

function createActionMethod(): ActionMethod {
  function action<T>(
    optionsOrRun: RateLimitBoundaryOptions | RequestBoundaryWork<T>,
    maybeRun?: RequestBoundaryWork<T>,
  ): Promise<T | null> {
    let options: RateLimitBoundaryOptions | undefined;
    let run: RequestBoundaryWork<T>;

    if (typeof optionsOrRun === 'function') {
      run = optionsOrRun;
    } else if (maybeRun === undefined) {
      throw new TypeError(
        'requestBoundary.action: handler required as second argument when passing options',
      );
    } else {
      options = optionsOrRun;
      run = maybeRun;
    }

    return withServerActionContext(async (actor) => {
      if (options?.rateLimit !== undefined) {
        checkUserRateLimit(actor.id, options.rateLimit);
      }

      return run({
        ...buildScope(actor, getDb()),
      });
    });
  }

  return action as ActionMethod;
}

interface RequestBoundary {
  route: RouteMethod;
  component<T>(run: RequestBoundaryWork<T>): Promise<T | null>;
  action: ActionMethod;
}

export function createRequestBoundary(): RequestBoundary {
  const route = createRouteMethod();
  const action = createActionMethod();
  return {
    route,
    component<T>(run: RequestBoundaryWork<T>): Promise<T | null> {
      return runServerComponentContext(async (actor) =>
        run({
          ...buildScope(actor, getDb()),
        }),
      );
    },
    action,
  };
}

export const requestBoundary = createRequestBoundary();
