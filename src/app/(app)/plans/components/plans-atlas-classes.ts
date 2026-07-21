import { cn } from '@/lib/utils';

export const ATLAS_CONTROL_CLASS = 'border-primary/20 bg-panel';

// ponytail: literal variants only — dynamic `data-[state=active]:${token}` is not scanned by Tailwind JIT
// After Hours: parchment frost via card/panel alpha (not cold white/45). No --glass-* tokens — recipe is card + primary/panel-border alpha.
const ledgerGlassActiveTab =
  'data-[state=active]:rounded-2xl data-[state=active]:border data-[state=active]:border-primary/35 data-[state=active]:bg-card/75 data-[state=active]:shadow-md data-[state=active]:backdrop-blur-xl dark:data-[state=active]:border-primary/45 dark:data-[state=active]:bg-card/55';

export const PLANS_GLASS_SURFACE =
  'rounded-2xl border border-primary/35 bg-card/75 shadow-md backdrop-blur-xl dark:border-primary/45 dark:bg-card/55';

export const ATLAS_TAB_CLASS = cn(
  ledgerGlassActiveTab,
  // Use primary in both modes — primary-dark + dark:primary can invert under class theme toggles.
  'data-[state=active]:text-primary',
);
