import type { Metadata } from 'next';
import type { JSX } from 'react';
import { AuthView } from '@neondatabase/auth/react';
import { authViewPaths } from '@neondatabase/auth/react/ui/server';

interface AuthPageProps {
  params: Promise<{ path: string }>;
}

const ALLOWED_PATHS = Object.values(authViewPaths);
const DEFAULT_AUTH_PATH = ALLOWED_PATHS[0] ?? 'sign-in';

const MODULE_METADATA_BY_PATH: Record<string, Metadata> = {
  'sign-in': {
    title: 'Sign In | Atlaris',
    description:
      'Sign in to Atlaris to continue building and managing your learning schedules.',
  },
  'sign-up': {
    title: 'Create Account | Atlaris',
    description:
      'Create your Atlaris account to turn learning goals into structured schedules.',
  },
  'forgot-password': {
    title: 'Reset Password | Atlaris',
    description:
      'Request a password reset to regain access to your Atlaris account.',
  },
  'reset-password': {
    title: 'Set New Password | Atlaris',
    description: 'Choose a new password to secure your Atlaris account.',
  },
  'magic-link': {
    title: 'Email Sign In | Atlaris',
    description: 'Use a magic link to sign in to your Atlaris account.',
  },
  'two-factor': {
    title: 'Two-Factor Verification | Atlaris',
    description: 'Complete two-factor verification to finish signing in.',
  },
  callback: {
    title: 'Signing You In | Atlaris',
    description: 'Completing authentication for your Atlaris session.',
  },
  'sign-out': {
    title: 'Sign Out | Atlaris',
    description: 'Sign out of your Atlaris account.',
  },
};

function getSafeAuthPath(candidatePath: string): string {
  return ALLOWED_PATHS.includes(candidatePath)
    ? candidatePath
    : DEFAULT_AUTH_PATH;
}

export async function generateMetadata({
  params,
}: AuthPageProps): Promise<Metadata> {
  const { path } = await params;
  const safePath = getSafeAuthPath(path);

  return (
    MODULE_METADATA_BY_PATH[safePath] ?? {
      title: 'Authentication | Atlaris',
      description: 'Manage authentication for your Atlaris account.',
    }
  );
}

export default async function AuthPage({
  params,
}: AuthPageProps): Promise<JSX.Element> {
  const { path } = await params;
  const safePath = getSafeAuthPath(path);

  return (
    <main className="container mx-auto flex grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6">
      <AuthView path={safePath} />
    </main>
  );
}
