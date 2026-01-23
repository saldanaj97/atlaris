import {
  clerkMiddleware,
  createRouteMatcher,
  type ClerkMiddlewareAuth,
} from '@clerk/nextjs/server';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/api(.*)',
  '/plans(.*)',
]);

export default clerkMiddleware(
  async (auth: ClerkMiddlewareAuth, request: NextRequest) => {
    const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
    const isMaintenancePage = request.nextUrl.pathname === '/maintenance';

    if (isMaintenanceMode && !isMaintenancePage) {
      return NextResponse.redirect(new URL('/maintenance', request.url));
    }

    if (!isMaintenanceMode && isMaintenancePage) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    if (request.nextUrl.pathname.startsWith('/api/v1/stripe/webhook')) {
      return NextResponse.next();
    }

    if (isProtectedRoute(request)) await auth.protect();

    const headerCorrelationId = request.headers.get('x-correlation-id');
    const correlationId =
      headerCorrelationId && headerCorrelationId.length
        ? headerCorrelationId
        : crypto.randomUUID();

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-correlation-id', correlationId);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set('x-correlation-id', correlationId);

    return response;
  },
  {
    // CSP configuration - see https://clerk.com/docs/security/clerk-csp
    contentSecurityPolicy: {
      directives: {
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'style-src': [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ],
      },
    },
  }
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
