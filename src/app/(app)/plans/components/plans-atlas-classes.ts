import { cn } from '@/lib/utils';

export const ATLAS_CONTROL_CLASS = 'border-primary/20 bg-panel';

// ponytail: literal variants only — dynamic `data-[state=active]:${token}` is not scanned by Tailwind JIT
const ledgerGlassActiveTab =
  'data-[state=active]:rounded-2xl data-[state=active]:border data-[state=active]:border-primary/40 data-[state=active]:bg-white/45 data-[state=active]:shadow-lg data-[state=active]:backdrop-blur-xl dark:data-[state=active]:border-primary/50 dark:data-[state=active]:bg-card/50';

export const PLANS_GLASS_SURFACE =
  'rounded-2xl border border-primary/40 bg-white/45 shadow-lg backdrop-blur-xl dark:border-primary/50 dark:bg-card/50';

export const ATLAS_TAB_CLASS = cn(
  ledgerGlassActiveTab,
  'data-[state=active]:text-primary-dark dark:data-[state=active]:text-primary',
);
