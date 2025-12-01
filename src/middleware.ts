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
  // Check if maintenance mode is enabled
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  const isMaintenancePage = req.nextUrl.pathname === '/maintenance';

  // If maintenance mode is enabled and user is not already on maintenance page,
  // redirect to maintenance page
  if (isMaintenanceMode && !isMaintenancePage) {
    return NextResponse.redirect(new URL('/maintenance', req.url));
  }

  // If maintenance mode is disabled and user is on maintenance page,
  // redirect to home page
  if (!isMaintenanceMode && isMaintenancePage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (req.nextUrl.pathname.startsWith('/api/v1/stripe/webhook')) {
    return NextResponse.next();
  }

  if (isProtectedRoute(req)) await auth.protect();

  const headerCorrelationId = req.headers.get('x-correlation-id');
  const correlationId =
    headerCorrelationId && headerCorrelationId.length
      ? headerCorrelationId
      : crypto.randomUUID();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-correlation-id', correlationId);

  return response;
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
