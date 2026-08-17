import type { Metadata, Viewport } from 'next';

import { ThemeProvider } from '@/app/ThemeProvider';
import { VercelTelemetry } from '@/app/VercelTelemetry';
import { shouldUseClerkUi } from '@/lib/auth/local-identity';
import { ClerkProvider } from '@clerk/nextjs';
import { Sora, Work_Sans } from 'next/font/google';
import { Toaster } from 'sonner';

import './globals.css';

const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-work-sans',
});

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
});

const metadataDescription =
  'Name a goal. Atlaris charts the plan and remembers where you left off.';

const clerkAppearance = {
  variables: {
    borderRadius: 'var(--radius)',
    colorBackground: 'var(--panel)',
    colorPrimary: 'var(--primary)',
    colorText: 'var(--foreground)',
    colorTextSecondary: 'var(--muted-foreground)',
    fontFamily: 'var(--font-family-base)',
  },
  elements: {
    card: 'bg-panel shadow-none',
    cardBox: 'rounded-2xl border border-panel-border shadow-sm',
    footerActionLink: 'text-primary hover:text-primary-dark',
    formButtonPrimary: 'bg-primary hover:bg-primary/90',
    headerSubtitle: 'text-muted-foreground',
    headerTitle: 'text-foreground',
    socialButtonsBlockButton: 'border-border text-foreground hover:bg-muted/70',
  },
};

const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to Atlaris',
      titleCombined: 'Sign in to Atlaris',
      subtitle: 'Pick up tonight’s route.',
      subtitleCombined: 'Pick up tonight’s route.',
    },
  },
  signUp: {
    start: {
      title: 'Create your Atlaris account',
      titleCombined: 'Create your Atlaris account',
      subtitle: 'Name a goal. Atlaris holds the route.',
      subtitleCombined: 'Name a goal. Atlaris holds the route.',
    },
  },
};

export const metadata: Metadata = {
  title: 'Atlaris | Plans for the quiet hours',
  description: metadataDescription,
  openGraph: {
    title: 'Atlaris | Plans for the quiet hours',
    description: metadataDescription,
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
    title: 'Atlaris | Plans for the quiet hours',
    description: metadataDescription,
    images: ['/og-default.jpg'],
    site: '@atlarisapp',
    creator: '@atlarisapp',
  },
  metadataBase: new URL('https://atlaris.app'),
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4ebe1' },
    { media: '(prefers-color-scheme: dark)', color: '#180d18' },
  ],
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
    <html
      lang='en'
      suppressHydrationWarning
      className={`${workSans.variable} ${sora.variable}`}
    >
      <body
        className={`${workSans.className} flex min-h-screen w-full flex-col antialiased`}
      >
        <a
          href='#main-content'
          className='fixed top-0 left-4 z-[100] -translate-y-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:translate-y-[calc(env(safe-area-inset-top,0px)+0.5rem)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none'
        >
          Skip to main content
        </a>
        {/* shouldUseClerkUi reads env config only, so server/client markup stays deterministic. */}
        {shouldUseClerkUi() ? (
          <ClerkProvider
            afterSignOutUrl='/'
            appearance={clerkAppearance}
            localization={clerkLocalization}
            signInUrl='/auth/sign-in'
            signUpUrl='/auth/sign-up'
          >
            {appContent}
          </ClerkProvider>
        ) : (
          appContent
        )}
        <VercelTelemetry />
      </body>
    </html>
  );
}
