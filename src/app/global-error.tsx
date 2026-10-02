'use client';

import { sora, workSans } from './fonts';
import { ThemeProvider } from '@/app/ThemeProvider';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import './globals.css';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    clientLogger.error('Global app error:', {
      context: 'global-error-boundary',
      errorDigest: error.digest,
      message: error?.message,
      stack: error?.stack,
    });
    Sentry.captureException(error);
  }, [error]);

  // This boundary replaces the root layout, so it owns <html>, <body>, the
  // global stylesheet and the theme provider.
  return (
    <html
      lang='en'
      className={`${workSans.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <body
        className={`${workSans.className} flex min-h-screen w-full flex-col items-center justify-center p-4 antialiased`}
      >
        <ThemeProvider>
          <RouteErrorState
            title='Something went wrong'
            message="Atlaris couldn't load this page. Try again, or reload if the problem continues."
            onRetry={retry}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
