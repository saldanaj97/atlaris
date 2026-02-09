import type { User } from 'better-auth/types';
import { vi } from 'vitest';

/** Session data shape returned by auth.getSession().data (Neon Auth / better-auth). */
export type AuthSessionData = {
  user: User;
};

export type GetSessionResult = { data: AuthSessionData | null };

/** Context passed to auth route handlers (Next.js App Router). */
export type AuthRouteContext = {
  params?: Promise<{ path: string[] }>;
};

/** Single auth route handler (GET or POST). */
export type AuthRouteHandler = (
  request: Request,
  context?: AuthRouteContext
) => Promise<Response>;

/** Return type of auth.handler() — GET and POST used by app/api/auth/[...path]/route. */
export type AuthHandlerReturn = {
  GET: AuthRouteHandler;
  POST: AuthRouteHandler;
};

/** Mock auth object shape — matches createNeonAuth() surface used by app. */
export type MockAuth = {
  getSession: () => Promise<GetSessionResult>;
  handler: () => AuthHandlerReturn;
};

const defaultSession: GetSessionResult = {
  data: {
    user: {
      id: 'test-auth-user',
      email: 'test@example.com',
      name: 'Test User',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    },
  },
};

export const auth: MockAuth = {
  getSession: vi.fn(async (): Promise<GetSessionResult> => defaultSession),
  handler: vi.fn(
    (): AuthHandlerReturn => ({
      GET: vi.fn(
        async (
          _request: Request,
          _context?: AuthRouteContext
        ): Promise<Response> => new Response(null, { status: 405 })
      ),
      POST: vi.fn(
        async (
          _request: Request,
          _context?: AuthRouteContext
        ): Promise<Response> => new Response(null, { status: 405 })
      ),
    })
  ),
};
