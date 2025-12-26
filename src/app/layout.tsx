import SiteFooter from '@/components/shared/SiteFooter';
import SiteHeader from '@/components/shared/SiteHeader';
import { ClerkProvider } from '@clerk/nextjs';
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
    'Create personalized learning plans with AI-generated modules and tasks. Track progress, export to Notion, and learn smarter.',
  icons: [
    {
      rel: 'icon',
      url: '/favicon-16x16.png',
      sizes: '16x16',
      type: 'image/png',
    },
    {
      rel: 'icon',
      url: '/favicon-32x32.png',
      sizes: '32x32',
      type: 'image/png',
    },
    {
      rel: 'apple-touch-icon',
      url: '/apple-touch-icon.png',
      sizes: '180x180',
      type: 'image/png',
    },
  ],
  openGraph: {
    title: 'Atlaris - AI-Powered Learning Paths',
    description:
      'Create personalized learning plans with AI-generated modules and tasks. Track progress, export to Notion, and learn smarter.',
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
    site: '@atlarisapp', // Update with actual Twitter handle if available
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
    <ClerkProvider afterSignOutUrl="/landing">
      <html lang="en">
        <body
          className={`${workSans.variable} ${youngSerif.variable} ${workSans.className} mx-auto w-full antialiased`}
        >
          <SiteHeader />
          <main>{children}</main>
          <Toaster />
          <SiteFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
