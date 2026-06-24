import { ModelSelectionCardSkeleton } from '@/app/(app)/settings/ai/components/ModelSelectionCardSkeleton';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function AISettingsLoading() {
  return (
    <>
      <PageHeader
        title='AI Preferences'
        titleAs='h2'
        subtitle='Save the model Atlaris should use for future plan generations.'
      />

      <div className='grid gap-6 md:grid-cols-2'>
        <ModelSelectionCardSkeleton />
        <Card className='p-6'>
          <Skeleton className='mb-4 h-6 w-36' />
          <div className='space-y-3'>
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-5/6' />
            <Skeleton className='h-16 w-full rounded-md' />
          </div>
        </Card>
      </div>
    </>
  );
}
