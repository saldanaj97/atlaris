import { ThemeProvider } from '@/components/providers/ThemeProvider';
import SiteFooter from '@/components/shared/SiteFooter';
import SiteHeader from '@/components/shared/SiteHeader';
import { authClient } from '@/lib/auth/client';
import { NeonAuthUIProvider } from '@neondatabase/auth/react';
import { type Metadata } from 'next';
import { Work_Sans, Young_Serif } from 'next/font/google';
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
  // TODO: Add favicon files to public/ folder then uncomment this
  // icons: [
  //   {
  //     rel: 'icon',
  //     url: '/favicon-16x16.png',
  //     sizes: '16x16',
  //     type: 'image/png',
  //   },
  //   {
  //     rel: 'icon',
  //     url: '/favicon-32x32.png',
  //     sizes: '32x32',
  //     type: 'image/png',
  //   },
  //   {
  //     rel: 'apple-touch-icon',
  //     url: '/apple-touch-icon.png',
  //     sizes: '180x180',
  //     type: 'image/png',
  //   },
  // ],
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
  metadataBase: new URL('https://atlaris.com'), // Replace with production URL
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${workSans.variable} ${youngSerif.variable} ${workSans.className} flex min-h-screen w-full flex-col antialiased`}
      >
        <NeonAuthUIProvider
          authClient={authClient}
          redirectTo="/dashboard"
          emailOTP
          social={{ providers: ['google'] }}
          account={{
            basePath: '/settings',
            fields: ['image', 'name'],
            viewPaths: { SETTINGS: 'profile' },
          }}
        >
          <ThemeProvider>
            <SiteHeader />
            <main className="flex-1 pt-16">{children}</main>
            <Toaster />
            <SiteFooter />
          </ThemeProvider>
        </NeonAuthUIProvider>
      </body>
    </html>
  );
}
