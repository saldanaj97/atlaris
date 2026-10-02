import { Button } from '@/components/ui/button';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { ROUTES } from '@/features/navigation/routes';
import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

/** Fallback for unmatched URLs and `notFound()` calls without a nearer boundary. */
export default function NotFound() {
  return (
    <main
      id='main-content'
      tabIndex={-1}
      className='flex flex-1 items-center justify-center px-4 py-12'
    >
      <RouteEmptyState
        icon={FileQuestion}
        title='Page not found'
        description="The page you're looking for doesn't exist or has moved."
        className='max-w-lg'
        action={
          <Button asChild>
            <Link href={ROUTES.HOME}>Back to home</Link>
          </Button>
        }
      />
    </main>
  );
}
