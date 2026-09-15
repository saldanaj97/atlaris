import { getShellAuthUserId } from '@/lib/auth/local-identity';
import { getSessionSafe } from '@/lib/auth/server';
import { redirect } from 'next/navigation';

export default async function Home(): Promise<never> {
  const { session } = await getSessionSafe();
  const userId = getShellAuthUserId(session?.user?.id);
  if (userId) redirect('/dashboard');
  redirect('/landing');
}
