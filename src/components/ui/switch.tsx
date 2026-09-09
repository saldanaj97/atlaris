'use client';

import { cn } from '@/lib/utils';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot='switch'
      className={cn(
        'peer group relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border border-input bg-secondary shadow-xs transition-[background-color,border-color,box-shadow] outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring focus-visible:ring-offset-[2px] focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:opacity-100 data-[state=checked]:bg-action-primary data-[state=checked]:hover:bg-action-primary-hover data-[state=checked]:active:bg-action-primary-pressed [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:border-transparent [@media(pointer:coarse)]:!bg-transparent [@media(pointer:coarse)]:shadow-none [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-x-0 [@media(pointer:coarse)]:before:top-1/2 [@media(pointer:coarse)]:before:h-[24px] [@media(pointer:coarse)]:before:-translate-y-1/2 [@media(pointer:coarse)]:before:rounded-full [@media(pointer:coarse)]:before:border [@media(pointer:coarse)]:before:border-input [@media(pointer:coarse)]:before:bg-secondary [@media(pointer:coarse)]:before:shadow-xs [@media(pointer:coarse)]:before:transition-[background-color,border-color,box-shadow] [@media(pointer:coarse)]:before:content-[""] [@media(pointer:coarse)]:hover:before:bg-accent [@media(pointer:coarse)]:data-[state=checked]:before:bg-action-primary [@media(pointer:coarse)]:data-[state=checked]:hover:before:bg-action-primary-hover [@media(pointer:coarse)]:data-[state=checked]:active:before:bg-action-primary-pressed [@media(pointer:coarse)]:data-[disabled]:before:border-disabled-border [@media(pointer:coarse)]:data-[disabled]:before:bg-disabled',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot='switch-thumb'
        className={cn(
          'pointer-events-none relative z-10 block size-[20px] rounded-full bg-foreground shadow-sm ring-0 transition-transform motion-reduce:transition-none group-data-[disabled]:bg-disabled-foreground data-[state=checked]:translate-x-[20px] data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
