import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  // We already handle protection in the middleware but this is an extra layer of security
  // to ensure that only authenticated users can access this page.
  const { userId } = await auth();
  if (!userId) redirect('/landing');

  return (
    <div className="bg-ceramic-black text-ceramic-white flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">Welcome to the Dashboard</h1>
    </div>
  );
}
