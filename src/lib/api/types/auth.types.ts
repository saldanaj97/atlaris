import type { DbUser } from '@/lib/db/queries/types/users.types';

export type RouteHandlerContext = {
  params?: Promise<Record<string, string>>;
  [key: string]: unknown;
};

export type PlainHandler = (
  req: Request,
  context?: RouteHandlerContext
) => Promise<Response>;

export type AuthHandlerContext = {
  req: Request;
  userId: string;
  user: DbUser;
  params: Record<string, string | undefined>;
};

export type AuthHandler = (
  ctx: AuthHandlerContext
) => Promise<Response> | Response;
