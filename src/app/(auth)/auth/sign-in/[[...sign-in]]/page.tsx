import type { Metadata } from 'next';

import { PageShell } from '@/components/ui/page-shell';
import { SignIn } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'Sign In | Atlaris',
  description:
    'Sign in to Atlaris to continue building and managing your learning schedules.',
};

export default function SignInPage() {
  return (
    <PageShell className='flex flex-col items-center justify-center gap-6'>
      <SignIn fallbackRedirectUrl='/dashboard' signUpUrl='/auth/sign-up' />
    </PageShell>
  );
}
