import type { ResponsiveBackdropProps } from '@/components/ui/responsive-backdrop';

import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { cn } from '@/lib/utils';

import styles from './dissolved-backdrop.module.css';

export type DissolvedBackdropProps = ResponsiveBackdropProps;

/** Decorative artwork that fades into `--background` on the edges. */
export function DissolvedBackdrop({
  desktop,
  mobile,
  overlay = 'background',
  className,
  ...props
}: DissolvedBackdropProps) {
  return (
    <ResponsiveBackdrop
      {...props}
      slot='dissolved-backdrop'
      overlay={overlay}
      className={cn(styles.frame, className)}
      desktop={{
        ...desktop,
        className: cn(styles.plate, desktop.className),
      }}
      mobile={{
        ...mobile,
        className: cn(styles.plate, mobile.className),
      }}
    />
  );
}
