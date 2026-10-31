import type { Metadata, Viewport } from 'next';

import { sora, workSans } from './fonts';
import { ThemeProvider } from '@/app/ThemeProvider';
import { VercelTelemetry } from '@/app/VercelTelemetry';
import { Toaster } from '@/components/ui/sonner';
import { shouldUseClerkUi } from '@/lib/auth/local-identity';
import { PostHogUserIdentifier } from '@/shared/analytics/PostHogUserIdentifier';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';
import { ClerkProvider } from '@clerk/nextjs';
import { headers } from 'next/headers';

import './globals.css';

const metadataDescription =
  'Name a goal. Atlaris charts the plan and remembers where you left off.';

const clerkAppearance = {
  layout: {
    // The mark is white; the light theme inverts it so it shows on light cards.
    logoImageUrl: '/brand/mark-on-dark.svg',
  },
  variables: {
    borderRadius: 'var(--radius)',
    colorBackground: 'var(--panel)',
    colorBorder: 'var(--border)',
    colorForeground: 'var(--foreground)',
    colorInput: 'var(--card)',
    colorInputForeground: 'var(--foreground)',
    colorMuted: 'var(--secondary)',
    colorMutedForeground: 'var(--muted-foreground)',
    colorNeutral: 'var(--foreground)',
    colorPrimary: 'var(--action-primary)',
    colorPrimaryForeground: 'var(--action-primary-foreground)',
    colorRing: 'var(--ring)',
    fontFamily: 'var(--font-family-base)',
  },
  elements: {
    card: 'bg-panel shadow-none',
    cardBox: 'rounded-2xl border border-panel-border shadow-sm',
    footer: { background: 'var(--secondary)' },
    footerActionLink: {
      color: 'var(--link)',
      '&:hover': { color: 'var(--link-hover)' },
    },
    formButtonPrimary: {
      backgroundColor: 'var(--action-primary)',
      backgroundImage: 'none',
      boxShadow: 'none',
      color: 'var(--action-primary-foreground)',
      '&:hover': { backgroundColor: 'var(--action-primary-hover)' },
    },
    headerSubtitle: 'text-muted-foreground',
    headerTitle: 'text-foreground',
    logoBox: { height: '2.5rem' },
    logoImage: {
      height: '2.5rem',
      width: 'auto',
      'html:not(.dark) &': { filter: 'invert(1)' },
    },
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
        url: '/brand/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
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
    { media: '(prefers-color-scheme: dark)', color: '#02070a' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // src/proxy.ts sets x-nonce per request (absent when it skips CSP). Reading
  // it opts the layout into dynamic rendering, which nonce-based CSP requires.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const appContent = (
    <ThemeProvider nonce={nonce}>
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
          className='fixed top-0 left-4 z-[100] -translate-y-[calc(100%+1rem)] rounded-md bg-action-primary px-3 py-2 type-label text-action-primary-foreground focus-visible:translate-y-[calc(env(safe-area-inset-top,0px)+0.5rem)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none'
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
            // Clerk's "Join waitlist" links (Waitlist sign-up mode) open the app's page, not the Account Portal.
            waitlistUrl='/waitlist'
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
