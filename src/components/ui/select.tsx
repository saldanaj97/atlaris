'use client';

import { cn } from '@/lib/utils';
import * as SelectPrimitive from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import * as React from 'react';

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot='select' {...props} />;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot='select-group' {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot='select-value' {...props} />;
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: 'sm' | 'default';
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot='select-trigger'
      data-size={size}
      className={cn(
        "flex w-fit min-w-0 max-w-full items-center justify-between gap-[8px] rounded-[8px] border border-input bg-card px-[12px] py-[8px] text-base leading-[24px] whitespace-normal [overflow-wrap:anywhere] shadow-xs transition-[color,border-color,box-shadow] outline-none hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring focus-visible:ring-offset-[2px] focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100 aria-invalid:border-danger aria-invalid:hover:border-danger focus-visible:aria-invalid:border-danger data-placeholder:text-muted-foreground data-[size=default]:min-h-[40px] data-[size=sm]:min-h-[32px] data-[size=sm]:text-sm data-[size=sm]:leading-[20px] [@media(pointer:coarse)]:min-h-[44px] *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:whitespace-normal *:data-[slot=select-value]:[overflow-wrap:anywhere] *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[20px] data-[size=sm]:[&_svg:not([class*='size-'])]:size-[16px] [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  align = 'center',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot='select-content'
        className={cn(
          'relative z-50 max-h-(--radix-select-content-available-height) min-w-[12rem] max-w-[20rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-[8px] border border-input bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-[8px]',
            position === 'popper' &&
              'h-(--radix-select-trigger-height) min-w-0 w-full scroll-my-1',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot='select-label'
      className={cn(
        'px-[8px] py-[4px] text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot='select-item'
      className={cn(
        "relative flex min-h-[40px] w-full cursor-default items-center gap-[8px] rounded-[8px] py-[8px] pr-[32px] pl-[8px] text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-disabled:pointer-events-none data-disabled:border-disabled-border data-disabled:bg-disabled data-disabled:text-disabled-foreground data-disabled:opacity-100 [@media(pointer:coarse)]:min-h-[44px] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[16px] [&_svg:not([class*='text-'])]:text-muted-foreground [&>span:last-child]:flex [&>span:last-child]:items-center [&>span:last-child]:gap-[8px]",
        className,
      )}
      {...props}
    >
      <span
        data-slot='select-item-indicator'
        className='absolute right-[8px] flex size-[16px] items-center justify-center'
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className='size-[16px]' />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText className='min-w-0 flex-1 whitespace-normal'>
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot='select-separator'
      className={cn(
        'pointer-events-none -mx-[8px] my-[4px] h-px bg-border',
        className,
      )}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot='select-scroll-up-button'
      className={cn(
        'flex min-h-[40px] cursor-default items-center justify-center py-[4px] [@media(pointer:coarse)]:min-h-[44px]',
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className='size-[16px]' />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot='select-scroll-down-button'
      className={cn(
        'flex min-h-[40px] cursor-default items-center justify-center py-[4px] [@media(pointer:coarse)]:min-h-[44px]',
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className='size-[16px]' />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
