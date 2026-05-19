'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { CSSProperties, JSX } from 'react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { DropdownOption } from '@/app/(app)/plans/new/components/plan-form/types';
import { cn } from '@/lib/utils';

type DropdownVariant = 'primary';

interface InlineDropdownProps<TValue extends string> {
  id?: string;
  ariaLabel?: string;
  options: readonly DropdownOption<TValue>[];
  value: TValue | null;
  onChange: (value: TValue) => void;
  icon?: React.ReactNode;
  placeholder?: string;
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
    dropdown: 'border-border/80 bg-popover/95 dark:border-border',
    item: 'text-popover-foreground data-[highlighted]:bg-muted/70 data-[highlighted]:text-popover-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary dark:data-[highlighted]:bg-foreground/10 dark:data-[state=checked]:bg-primary/15',
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
  ariaLabel,
  options,
  value,
  icon,
  placeholder,
  onChange,
  variant = 'primary',
}: InlineDropdownProps<TValue>): JSX.Element {
  const generatedId = useId();
  const componentId = id ?? generatedId;
  const styles = VARIANT_STYLES[variant];
  const selectedOption = options.find((opt) => opt.value === value);
  const isPlaceholder = !selectedOption;
  const displayLabel = selectedOption?.label ?? placeholder ?? '';
  const sizerRef = useRef<HTMLDivElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const nextWidth = sizerRef.current?.offsetWidth;

    if (!nextWidth) {
      return;
    }

    setTriggerWidth((currentWidth) =>
      currentWidth === nextWidth ? currentWidth : nextWidth,
    );
  }, [displayLabel]);

  return (
    <div
      className="relative w-full sm:w-auto"
      style={
        {
          '--inline-dropdown-width': triggerWidth
            ? `${triggerWidth}px`
            : undefined,
        } as CSSProperties
      }
    >
      <div
        ref={sizerRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inline-flex min-h-10 items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium whitespace-nowrap"
      >
        {icon}
        <span
          data-label={displayLabel}
          className="after:content-[attr(data-label)]"
        />
        <ChevronDown className="size-3.5" />
      </div>
      <SelectPrimitive.Root
        value={value ?? ''}
        onValueChange={(nextValue) => {
          const nextOption = options.find(
            (option) => option.value === nextValue,
          );

          if (nextOption) {
            onChange(nextOption.value);
          }
        }}
      >
        <SelectPrimitive.Trigger
          id={componentId}
          aria-label={ariaLabel}
          className={cn(
            'inline-flex min-h-10 w-full items-center justify-between gap-1.5 overflow-hidden rounded-xl border px-3 py-2 text-sm font-medium whitespace-nowrap shadow-sm backdrop-blur-sm outline-none sm:w-[var(--inline-dropdown-width)]',
            'transition-[width,background-color,border-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background',
            isPlaceholder
              ? 'border-border/70 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/45 data-[state=open]:border-primary/30 data-[state=open]:bg-muted/45 dark:bg-muted/20 dark:hover:bg-muted/30'
              : styles.pill,
          )}
        >
          {icon}
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="size-3.5 shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={8}
            align="start"
            className={cn(
              'z-50 min-w-[220px] overflow-hidden rounded-2xl border shadow-xl backdrop-blur-xl',
              'data-[state=closed]:animate-out data-[state=open]:animate-in',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
              styles.dropdown,
            )}
          >
            <SelectPrimitive.Viewport className="p-1.5">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  textValue={option.label}
                  className={cn(
                    'relative w-full cursor-default rounded-xl py-2.5 pr-9 pl-3 text-left transition-colors outline-none select-none',
                    styles.item,
                  )}
                >
                  <SelectPrimitive.ItemText>
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                  </SelectPrimitive.ItemText>
                  {option.description && (
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                  <SelectPrimitive.ItemIndicator className="absolute top-1/2 right-3 -translate-y-1/2 text-primary">
                    <Check className="size-4" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
