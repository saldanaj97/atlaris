import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search } from 'lucide-react';

/** Skeleton for the plans search and table. */
export function PlansContentSkeleton() {
  return (
    <div className='space-y-5'>
      <div className='relative w-full'>
        <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
        <Skeleton className='h-9 w-full rounded-md' />
      </div>

      <Table className='min-w-[840px]'>
        <TableHeader className='bg-transparent [&_tr]:border-border/60'>
          <TableRow className='hover:bg-transparent'>
            <TableHead className='w-10 px-3'>
              <Skeleton className='size-4 rounded' />
            </TableHead>
            <TableHead>
              <Skeleton className='h-3 w-16' />
            </TableHead>
            <TableHead>
              <Skeleton className='h-3 w-20' />
            </TableHead>
            <TableHead>
              <Skeleton className='h-3 w-14' />
            </TableHead>
            <TableHead>
              <Skeleton className='h-3 w-16' />
            </TableHead>
            <TableHead>
              <Skeleton className='h-3 w-16' />
            </TableHead>
            <TableHead className='w-12' />
          </TableRow>
        </TableHeader>
        <TableBody className='[&_tr:last-child]:border-b [&_tr:last-child]:border-border/60'>
          {[1, 2, 3, 4, 5].map((planSkeletonId) => (
            <PlanRowSkeleton key={`plan-row-skeleton-${planSkeletonId}`} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PlanRowSkeleton() {
  return (
    <TableRow className='border-border/60'>
      <TableCell className='w-10 px-3'>
        <Skeleton className='size-4 rounded' />
      </TableCell>
      <TableCell className='min-w-72 space-y-1.5 py-4'>
        <Skeleton className='h-4 w-64' />
        <Skeleton className='h-3 w-32' />
      </TableCell>
      <TableCell>
        <Skeleton className='h-1 w-32' />
      </TableCell>
      <TableCell>
        <Skeleton className='h-3 w-12' />
      </TableCell>
      <TableCell>
        <Skeleton className='h-3 w-20' />
      </TableCell>
      <TableCell>
        <Skeleton className='h-3 w-16' />
      </TableCell>
      <TableCell className='w-12'>
        <Skeleton className='size-8' />
      </TableCell>
    </TableRow>
  );
}
