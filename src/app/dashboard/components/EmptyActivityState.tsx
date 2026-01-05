import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface EmptyActivityStateProps {
  filter: string;
}

export function EmptyActivityState({ filter }: EmptyActivityStateProps) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/60 p-8 text-center backdrop-blur-sm">
      <p className="text-muted-foreground">
        {filter === 'all'
          ? "You don't have any activity yet. Create a plan to get started!"
          : `No ${filter} activities found.`}
      </p>
      {filter === 'all' && (
        <Button asChild className="mt-4">
          <Link href="/plans/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Plan
          </Link>
        </Button>
      )}
    </div>
  );
}
