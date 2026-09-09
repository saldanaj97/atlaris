import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export function ModuleCompletePanel({
  planId,
  nextModuleId,
}: {
  planId: string;
  nextModuleId: string | null;
}) {
  return (
    <Card className='mt-8 gap-4 p-6'>
      <div className='flex items-start gap-3'>
        <CheckCircle2
          aria-hidden='true'
          className='mt-0.5 size-6 shrink-0 text-success'
        />
        <div className='min-w-0 space-y-2'>
          <CardTitle as='h3'>Module completed</CardTitle>
          <CardDescription>
            You have finished every lesson in this module.
          </CardDescription>
        </div>
      </div>
      {nextModuleId ? (
        <Button asChild className='w-full sm:w-auto'>
          <Link href={`/plans/${planId}/modules/${nextModuleId}`}>
            Continue to next module
            <ArrowRight className='size-4' />
          </Link>
        </Button>
      ) : (
        <Button asChild variant='outline' className='w-full sm:w-auto'>
          <Link href={`/plans/${planId}`}>
            Back to plan overview
            <ArrowRight className='size-4' />
          </Link>
        </Button>
      )}
    </Card>
  );
}
