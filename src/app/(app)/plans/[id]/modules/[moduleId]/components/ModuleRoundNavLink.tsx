import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function ModuleRoundNavLink({
  planId,
  targetModuleId,
  direction,
}: {
  planId: string;
  targetModuleId: string | null;
  direction: 'previous' | 'next';
}) {
  const Icon = direction === 'previous' ? ArrowLeft : ArrowRight;
  const ariaLabel =
    direction === 'previous' ? 'Previous module' : 'Next module';

  if (!targetModuleId) {
    return (
      <span className="cursor-not-allowed rounded-full bg-white/10 p-2 text-white/40">
        <Icon className="h-4 w-4" />
      </span>
    );
  }

  return (
    <Link
      href={`/plans/${planId}/modules/${targetModuleId}`}
      className="rounded-full bg-white/25 p-2 text-white transition hover:bg-white/35"
      aria-label={ariaLabel}
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}
