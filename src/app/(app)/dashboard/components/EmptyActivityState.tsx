/**
 * Empty state inside the dashboard activity ledger.
 */
export function EmptyActivityState() {
  return (
    <div className='px-5 py-12 text-center sm:px-6'>
      <p className='text-sm font-medium text-foreground'>No activity yet</p>
      <p className='mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground'>
        Plan generation and progress updates will appear here.
      </p>
    </div>
  );
}
