import { BillingCardsSkeleton } from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import { PageHeader } from '@/components/ui/page-header';

export default function BillingSettingsLoading() {
  return (
    <>
      <PageHeader
        title='Billing'
        titleAs='h2'
        subtitle='Manage your subscription and view usage'
      />

      <div className='grid gap-6 md:grid-cols-2'>
        <BillingCardsSkeleton />
      </div>
    </>
  );
}
