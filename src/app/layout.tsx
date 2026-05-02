import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Work_Sans, Young_Serif } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/app/ThemeProvider';
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
        <ClerkProvider
          afterSignOutUrl="/"
          signInUrl="/auth/sign-in"
          signUpUrl="/auth/sign-up"
        >
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
