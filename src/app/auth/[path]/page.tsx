import { AuthView } from '@neondatabase/auth/react';
import { authViewPaths } from '@neondatabase/auth/react/ui/server';

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  const allowedPaths = Object.values(authViewPaths);
  const safePath = allowedPaths.includes(path)
    ? path
    : (allowedPaths[0] ?? 'sign-in');

  return (
    <main className="container mx-auto flex grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6">
      <AuthView path={safePath} />
    </main>
  );
}
