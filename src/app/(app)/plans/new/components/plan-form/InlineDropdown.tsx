'use client';

import type { DropdownOption } from '@/app/(app)/plans/new/components/plan-form/types';
import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

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
    pill: 'border-input bg-action-primary/10 text-link hover:bg-action-primary/20 data-[state=open]:bg-action-primary/20',
    dropdown: 'border-input bg-popover',
    item: 'text-popover-foreground data-[highlighted]:bg-muted/70 data-[highlighted]:text-popover-foreground data-[state=checked]:bg-action-primary/10 data-[state=checked]:text-link',
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
}: InlineDropdownProps<TValue>) {
  const generatedId = useId();
  const componentId = id ?? generatedId;
  const styles = VARIANT_STYLES[variant];
  const selectedOption = options.find((opt) => opt.value === value);
  const isPlaceholder = !selectedOption;
  const displayLabel = selectedOption?.label ?? placeholder ?? '';
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);

  const measureTrigger = (label: HTMLSpanElement | null) => {
    if (!label) return;

    label.dataset.label = displayLabel;
    const nextWidth = label.parentElement?.offsetWidth;
    if (!nextWidth) return;

    setTriggerWidth((currentWidth) =>
      currentWidth === nextWidth ? currentWidth : nextWidth,
    );
  };

  return (
    <div
      className='relative w-full sm:w-auto'
      style={
        {
          '--inline-dropdown-width': triggerWidth
            ? `${triggerWidth}px`
            : undefined,
        } as CSSProperties
      }
    >
      <div
        aria-hidden='true'
        className='pointer-events-none invisible absolute inline-flex min-h-[40px] items-center justify-between gap-[6px] rounded-[8px] border px-[12px] py-[8px] text-sm font-medium whitespace-nowrap'
      >
        {icon}
        <span
          ref={measureTrigger}
          className='after:content-[attr(data-label)]'
        />
        <ChevronDown className='size-[14px]' />
      </div>
      <SelectPrimitive.Root
        value={value ?? ''}
        onValueChange={(nextValue) => {
          const nextOption = options.find(
            (option) => option.value === nextValue,
          );

          if (nextOption && !nextOption.disabled) {
            onChange(nextOption.value);
          }
        }}
      >
        <SelectPrimitive.Trigger
          id={componentId}
          aria-label={ariaLabel}
          className={cn(
            'inline-flex min-h-[40px] w-full items-center justify-between gap-[6px] overflow-hidden rounded-[8px] border px-[12px] py-[8px] text-sm font-medium leading-5 whitespace-nowrap shadow-sm outline-none hover:border-foreground focus-visible:border-ring [@media(pointer:coarse)]:min-h-[44px]',
            'transition-[width,background-color,border-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
            'focus-visible:ring-[2px] focus-visible:ring-ring focus-visible:ring-offset-[2px] focus-visible:ring-offset-background sm:w-[var(--inline-dropdown-width)]',
            isPlaceholder
              ? 'border-input bg-card text-muted-foreground hover:border-foreground data-[state=open]:border-ring data-[state=open]:bg-muted'
              : styles.pill,
          )}
        >
          {icon}
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <ChevronDown className='size-[14px] shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180' />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position='popper'
            sideOffset={8}
            align='start'
            className={cn(
              'z-50 min-w-[12rem] max-w-[20rem] overflow-hidden rounded-[16px] border border-input bg-popover p-[8px] shadow-xl',
              'data-[state=closed]:animate-out data-[state=open]:animate-in',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
              styles.dropdown,
            )}
          >
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  textValue={option.label}
                  disabled={option.disabled}
                  className={cn(
                    'relative flex min-h-[40px] w-full cursor-default items-center rounded-[8px] py-[8px] pr-[36px] pl-[12px] text-left transition-colors outline-none select-none [@media(pointer:coarse)]:min-h-[44px]',
                    'data-disabled:cursor-not-allowed data-disabled:border-disabled-border data-disabled:bg-disabled data-disabled:text-disabled-foreground data-disabled:opacity-100',
                    styles.item,
                  )}
                >
                  <span className='min-w-0 flex-1'>
                    <SelectPrimitive.ItemText>
                      <span className='block text-sm font-medium'>
                        {option.label}
                      </span>
                    </SelectPrimitive.ItemText>
                    {option.description && (
                      <span className='block text-xs text-muted-foreground'>
                        {option.description}
                      </span>
                    )}
                  </span>
                  <SelectPrimitive.ItemIndicator className='absolute top-1/2 right-[12px] -translate-y-1/2 text-primary'>
                    <Check className='size-[16px]' />
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
