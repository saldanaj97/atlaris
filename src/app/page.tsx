import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getEffectiveAuthUserId } from '@/lib/api/auth';

export const metadata: Metadata = {
  title: 'Atlaris',
  description:
    'Root route for Atlaris. Signed-in users are redirected to dashboard and signed-out users to landing.',
};

export default async function Home() {
  const userId = await getEffectiveAuthUserId();
  if (userId) redirect('/dashboard');
  redirect('/landing');
}
