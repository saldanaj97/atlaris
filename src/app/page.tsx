import { redirect } from 'next/navigation';

import { getEffectiveAuthUserId } from '@/lib/api/auth';

export default async function Home(): Promise<never> {
  const userId = await getEffectiveAuthUserId();
  if (userId) redirect('/dashboard');
  redirect('/landing');
}
