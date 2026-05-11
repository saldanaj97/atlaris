import { ThemeProvider } from '@/app/ThemeProvider';
import { shouldUseClerkUi } from '@/lib/auth/local-identity';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { Work_Sans, Young_Serif } from 'next/font/google';
import type { ComponentProps } from 'react';
import { Toaster } from 'sonner';
import './globals.css';

const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-work-sans',
});

const youngSerif = Young_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-young-serif',
});

export const metadata: Metadata = {
  title: 'Atlaris - AI-Powered Learning Paths',
  description:
    'Create personalized learning plans with AI-generated modules and tasks. Track progress, sync to Google Calendar, and learn smarter.',
  openGraph: {
    title: 'Atlaris - AI-Powered Learning Paths',
    description:
      'Create personalized learning plans with AI-generated modules and tasks. Track progress, sync to Google Calendar, and learn smarter.',
    images: [
      { url: '/og-default.jpg', width: 1200, height: 630, alt: 'Atlaris' },
      {
        url: '/og-landing.jpg',
        width: 1200,
        height: 630,
        alt: 'Atlaris Landing',
      },
    ],
    type: 'website',
    siteName: 'Atlaris',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Atlaris - AI-Powered Learning Paths',
    description:
      'Create personalized learning plans with AI-generated modules and tasks.',
    images: ['/og-default.jpg'],
    site: '@atlarisapp',
    creator: '@atlarisapp',
  },
  metadataBase: new URL('https://atlaris.app'),
};

type SpeedInsightsBeforeSend = NonNullable<
  ComponentProps<typeof SpeedInsights>['beforeSend']
>;

const SPEED_INSIGHTS_SAMPLE_RATE = 0.25;

const SPEED_INSIGHTS_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/pricing\/?$/,
  /^\/dashboard\/?$/,
  /^\/plans\/new\/?$/,
  /^\/plans\/[^/]+\/?$/,
  /^\/plans\/[^/]+\/modules\/[^/]+\/?$/,
];

const filterSpeedInsights: SpeedInsightsBeforeSend = (event) => {
  const { pathname } = new URL(event.url);
  return SPEED_INSIGHTS_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
    ? event
    : null;
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appContent = (
    <ThemeProvider>
      {children}
      <Toaster />
    </ThemeProvider>
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${workSans.variable} ${youngSerif.variable} ${workSans.className} flex min-h-screen w-full flex-col antialiased`}
      >
        {/* shouldUseClerkUi reads env config only, so server/client markup stays deterministic. */}
        {shouldUseClerkUi() ? (
          <ClerkProvider
            afterSignOutUrl="/"
            signInUrl="/auth/sign-in"
            signUpUrl="/auth/sign-up"
          >
            {appContent}
          </ClerkProvider>
        ) : (
          appContent
        )}
        <Analytics
          beforeSend={(event) => {
            if (localStorage.getItem('va-disable')) {
              return null;
            }
            return event;
          }}
        />
        <SpeedInsights
          sampleRate={SPEED_INSIGHTS_SAMPLE_RATE}
          beforeSend={filterSpeedInsights}
        />
      </body>
    </html>
  );
}
