import type { Metadata } from 'next';

import { PageShell } from '@/components/ui/page-shell';
import { SignUp } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'Create Account | Atlaris',
  description:
    'Create your Atlaris account to chart a course for the quiet hours.',
};

export default function SignUpPage() {
  return (
    <PageShell className='flex flex-col items-center justify-center gap-6'>
      <SignUp fallbackRedirectUrl='/dashboard' signInUrl='/auth/sign-in' />
    </PageShell>
  );
}
