import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface PlanDetailPageErrorProps {
  message?: string;
}

/**
 * Renders a full-screen error UI for the plan detail page.
 *
 * Displays a prominent "Error Loading Plan" heading, a provided error message or a default
 * fallback message, and a button linking back to the plans list.
 *
 * @param message - Optional custom error message to display instead of the default text
 * @returns The React element representing the error page UI
 */
export function PlanDetailPageError({ message }: PlanDetailPageErrorProps) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card>
        <CardContent className="space-y-5 p-6" role="alert">
          <h1>Error Loading Plan</h1>
          <p className="text-muted-foreground">
            {message ??
              'There was an error loading the learning plan. Please try again later.'}
          </p>
          <Button asChild>
            <Link href="/plans">Back to Plans</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
