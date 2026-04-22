import { randomUUID } from 'node:crypto';

import {
	withAuth,
	withServerActionContext,
	withServerComponentContext,
} from '@/lib/api/auth';
import { getCorrelationId } from '@/lib/api/context';
import type {
	PlainHandler,
	RouteHandlerContext,
	RouteParams,
} from '@/lib/api/types/auth.types';
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

export interface RequestBoundary {
	route(run: RouteBoundaryWork): PlainHandler;
	component<T>(run: RequestBoundaryWork<T>): Promise<T | null>;
	action<T>(run: RequestBoundaryWork<T>): Promise<T | null>;
}

export function createRequestBoundary(): RequestBoundary {
	return {
		route(run: RouteBoundaryWork): PlainHandler {
			const handler = withAuth(async ({ req: currentReq, user, params }) =>
				run({
					req: currentReq,
					params,
					...buildScope(user, getDb()),
				}),
			);

			return (req: Request, context?: RouteHandlerContext) =>
				handler(req, context);
		},
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
