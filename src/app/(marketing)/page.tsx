import { getEffectiveAuthUserId } from '@/lib/api/auth';
import { redirect } from 'next/navigation';

export default async function Home(): Promise<never> {
  const userId = await getEffectiveAuthUserId();
  if (userId) redirect('/dashboard');
  redirect('/landing');
}
