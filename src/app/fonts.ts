import {
  IBM_Plex_Mono,
  Instrument_Serif,
  Sora,
  Work_Sans,
} from 'next/font/google';

export const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-work-sans',
});

export const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
});

export const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
});
