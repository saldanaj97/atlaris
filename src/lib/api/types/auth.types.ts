import type { DbUser } from '@/lib/db/queries/types/users.types';

export type RouteParams = Record<string, string | string[] | undefined>;

export type RouteHandlerContext = {
	params?: Promise<RouteParams>;
};

export type PlainHandler = (
	req: Request,
	context?: RouteHandlerContext,
) => Promise<Response>;

export type AuthHandlerContext = {
	req: Request;
	userId: string;
	user: DbUser;
	params: RouteParams;
};

export type AuthHandler = (
	ctx: AuthHandlerContext,
) => Promise<Response> | Response;
