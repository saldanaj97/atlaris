'use client';

import { cn } from '@/lib/utils';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import type { DropdownOption } from './types';

type DropdownVariant = 'primary' | 'accent' | 'cyan' | 'rose';

interface InlineDropdownProps<TValue extends string> {
  id?: string;
  options: readonly DropdownOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  icon?: React.ReactNode;
  variant?: DropdownVariant;
}

const VARIANT_STYLES: Record<
  DropdownVariant,
  {
    pill: string;
    dropdown: string;
    item: string;
  }
> = {
  primary: {
    pill: 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 data-[state=open]:bg-primary/20 dark:border-primary/40 dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30 dark:data-[state=open]:bg-primary/30',
    dropdown:
      'border-primary/20 bg-white/70 dark:border-border dark:bg-popover',
    item: 'text-foreground hover:bg-primary/10 data-[highlighted]:bg-primary/20 data-[highlighted]:text-primary data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary dark:text-popover-foreground dark:hover:bg-foreground/10 dark:data-[highlighted]:bg-foreground/15 dark:data-[highlighted]:text-foreground dark:data-[state=checked]:bg-primary/20 dark:data-[state=checked]:text-primary',
  },
  accent: {
    pill: 'border-accent/30 bg-accent/30 text-accent-foreground hover:bg-accent/50 data-[state=open]:bg-accent/50 dark:border-primary/40 dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30 dark:data-[state=open]:bg-primary/30',
    dropdown: 'border-accent/20 bg-white/70 dark:border-border dark:bg-popover',
    item: 'text-foreground hover:bg-accent/30 data-[highlighted]:bg-accent/50 data-[highlighted]:text-accent-foreground data-[state=checked]:bg-accent/50 data-[state=checked]:text-accent-foreground dark:text-popover-foreground dark:hover:bg-foreground/10 dark:data-[highlighted]:bg-foreground/15 dark:data-[highlighted]:text-foreground dark:data-[state=checked]:bg-primary/20 dark:data-[state=checked]:text-primary',
  },
  cyan: {
    pill: 'border-cyan-200/60 bg-cyan-50/80 text-cyan-700 hover:bg-cyan-100/80 data-[state=open]:bg-cyan-100/80 dark:border-primary/40 dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30 dark:data-[state=open]:bg-primary/30',
    dropdown:
      'border-cyan-200/40 bg-white/70 dark:border-border dark:bg-popover',
    item: 'text-foreground hover:bg-cyan-50/80 data-[highlighted]:bg-cyan-100/80 data-[highlighted]:text-cyan-800 data-[state=checked]:bg-cyan-100/80 data-[state=checked]:text-cyan-800 dark:text-popover-foreground dark:hover:bg-foreground/10 dark:data-[highlighted]:bg-foreground/15 dark:data-[highlighted]:text-foreground dark:data-[state=checked]:bg-primary/20 dark:data-[state=checked]:text-primary',
  },
  rose: {
    pill: 'border-rose-200/60 bg-rose-50/80 text-rose-700 hover:bg-rose-100/80 data-[state=open]:bg-rose-100/80 dark:border-primary/40 dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30 dark:data-[state=open]:bg-primary/30',
    dropdown:
      'border-rose-200/40 bg-white/70 dark:border-border dark:bg-popover',
    item: 'text-foreground hover:bg-rose-50/80 data-[highlighted]:bg-rose-100/80 data-[highlighted]:text-rose-800 data-[state=checked]:bg-rose-100/80 data-[state=checked]:text-rose-800 dark:text-popover-foreground dark:hover:bg-foreground/10 dark:data-[highlighted]:bg-foreground/15 dark:data-[highlighted]:text-foreground dark:data-[state=checked]:bg-primary/20 dark:data-[state=checked]:text-primary',
  },
};

/**
 * Inline dropdown component that appears as a styled pill within text.
 * Used in the unified plan generation form for natural language-style input.
 *
 * Built on Radix Select primitives for proper accessibility:
 * - Keyboard navigation (arrow keys, typeahead)
 * - Automatic focus on selected item when opened
 * - Focus management and trapping
 * - Proper ARIA attributes
 * - Outside click and escape key handling
 */
export function InlineDropdown<TValue extends string>({
  id,
  options,
  value,
  icon,
  onChange,
  variant = 'primary',
}: InlineDropdownProps<TValue>) {
  const generatedId = useId();
  const componentId = id ?? generatedId;
  const styles = VARIANT_STYLES[variant];
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as TValue)}
    >
      <SelectPrimitive.Trigger
        id={componentId}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm backdrop-blur-sm transition outline-none',
          'focus-visible:ring-ring dark:focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2',
          styles.pill
        )}
      >
        {icon}
        <SelectPrimitive.Value>
          {selectedOption?.label ?? value}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={8}
          align="start"
          className={cn(
            'z-50 min-w-[180px] overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            styles.dropdown
          )}
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className={cn(
                  'w-full cursor-default rounded-xl px-3 py-2 text-left transition-colors outline-none',
                  styles.item
                )}
              >
                <SelectPrimitive.ItemText>
                  <span className="block text-sm font-medium">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-muted-foreground block text-xs">
                      {option.description}
                    </span>
                  )}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
