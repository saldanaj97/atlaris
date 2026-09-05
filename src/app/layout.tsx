import type { Metadata, Viewport } from 'next';

import { ThemeProvider } from '@/app/ThemeProvider';
import { VercelTelemetry } from '@/app/VercelTelemetry';
import { PostHogUserIdentifier } from '@/components/PostHogUserIdentifier';
import { Toaster } from '@/components/ui/sonner';
import { shouldUseClerkUi } from '@/lib/auth/local-identity';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';
import { ClerkProvider } from '@clerk/nextjs';
import { Sora, Work_Sans } from 'next/font/google';

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
    colorPrimary: 'var(--action-primary)',
    colorText: 'var(--foreground)',
    colorTextSecondary: 'var(--muted-foreground)',
    fontFamily: 'var(--font-family-base)',
  },
  elements: {
    card: 'bg-panel shadow-none',
    cardBox: 'rounded-2xl border border-panel-border shadow-sm',
    footerActionLink: 'text-link hover:text-link-hover',
    formButtonPrimary:
      'bg-action-primary text-action-primary-foreground hover:bg-action-primary-hover',
    headerSubtitle: 'text-muted-foreground',
    headerTitle: 'text-foreground',
    socialButtonsBlockButton: 'border-input text-foreground hover:bg-muted/70',
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
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon-16.svg', sizes: '16x16', type: 'image/svg+xml' },
      { url: '/brand/favicon-32.svg', sizes: '32x32', type: 'image/svg+xml' },
      {
        url: '/brand/favicon-on-light.svg',
        media: '(prefers-color-scheme: light)',
        type: 'image/svg+xml',
      },
      {
        url: '/brand/favicon-on-dark.svg',
        media: '(prefers-color-scheme: dark)',
        type: 'image/svg+xml',
      },
    ],
    apple: [
      {
        url: '/brand/favicon-on-light.svg',
        type: 'image/svg+xml',
      },
    ],
  },
  openGraph: {
    title: 'Atlaris | Plans for the quiet hours',
    description: metadataDescription,
    images: [OG_DEFAULT_IMAGE],
    type: 'website',
    siteName: 'Atlaris',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Atlaris | Plans for the quiet hours',
    description: metadataDescription,
    images: [OG_DEFAULT_IMAGE.url],
    site: '@atlarisapp',
    creator: '@atlarisapp',
  },
  metadataBase: new URL('https://atlaris.app'),
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#070b10' },
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
          className='fixed top-0 left-4 z-[100] -translate-y-full rounded-md bg-action-primary px-3 py-2 text-sm font-medium text-action-primary-foreground focus-visible:translate-y-[calc(env(safe-area-inset-top,0px)+0.5rem)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none'
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
            <PostHogUserIdentifier />
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
