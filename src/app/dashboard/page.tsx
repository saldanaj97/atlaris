import { getOrCreateCurrentUserRecord } from '@/lib/api/auth';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { redirect } from 'next/navigation';
import { ActivityStream } from './components/ActivityStream';

export default async function DashboardPage() {
  const user = await getOrCreateCurrentUserRecord();
  if (!user) {
    redirect('/sign-in?redirect_url=/dashboard');
  }

  const summaries = await getPlanSummariesForUser(user.id);

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <ActivityStream summaries={summaries} />
    </div>
  );
}
