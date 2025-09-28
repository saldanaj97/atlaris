import { randomUUID } from 'node:crypto';

import { clerkMiddleware } from '@clerk/nextjs/server';

import { createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/api(.*)',
  '/plans(.*)',
]);

// Use basic auth for protected routes for now and later add paid plan
// with isAuthenticated and user roles
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();

  const headerCorrelationId = req.headers.get('x-correlation-id');
  const correlationId =
    headerCorrelationId && headerCorrelationId.length
      ? headerCorrelationId
      : randomUUID();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-correlation-id', correlationId);

  return response;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
