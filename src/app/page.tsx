import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getEffectiveAuthUserId } from '@/lib/api/auth';

export const metadata: Metadata = {
  title: 'Atlaris',
  description:
    'Atlaris turns what you want to learn into a time-blocked, resource-linked schedule that syncs to your calendar.',
};

export default async function Home() {
  const userId = await getEffectiveAuthUserId();
  if (userId) redirect('/dashboard');
  redirect('/landing');
}
