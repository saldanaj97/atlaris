import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { redirect } from 'next/navigation';

export default async function Home() {
  const userId = await getEffectiveClerkUserId();
  if (userId) redirect('/dashboard');
  redirect('/landing');
}
