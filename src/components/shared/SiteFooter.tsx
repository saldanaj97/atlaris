import BrandLogo from '@/components/shared/BrandLogo';
import { ROUTES } from '@/features/navigation/routes';
import Link from 'next/link';

const marketingLinks = [
  { label: 'Home', href: ROUTES.LANDING },
  { label: 'Pricing', href: ROUTES.PRICING },
  { label: 'About', href: ROUTES.ABOUT },
] as const;
const SUPPORT_EMAIL = 'support@atlaris.app';

interface SiteFooterProps {
  variant?: 'marketing' | 'maintenance';
}

export default function SiteFooter({ variant = 'marketing' }: SiteFooterProps) {
  if (variant === 'maintenance') {
    return (
      <footer className='border-t border-border px-4 py-6 sm:px-6 lg:px-8'>
        <div className='mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row sm:items-end'>
          <div className='text-center sm:text-left'>
            <BrandLogo size='sm' />
            <p className='mt-2 text-xs text-muted-foreground'>
              Learn. Build. Go further.
            </p>
          </div>
          <div className='flex flex-col items-center gap-2 text-xs text-muted-foreground sm:items-end'>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className='inline-flex items-center justify-center text-link transition-colors hover:text-link-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]'
            >
              {SUPPORT_EMAIL}
            </a>
            <p suppressHydrationWarning>
              © {new Date().getFullYear()} Atlaris. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className='border-t border-border px-6 py-9 sm:px-8'>
      <div className='mx-auto flex max-w-7xl flex-col justify-between gap-10 sm:min-h-[11.5rem]'>
        <div className='grid gap-10 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]'>
          <div>
            <BrandLogo size='sm' />
            <p className='mt-3 max-w-xs text-sm leading-[1.375] text-muted-foreground'>
              Learn. Build. Go further.
            </p>
          </div>

          <nav
            aria-label='Footer'
            className='grid grid-cols-2 gap-8 sm:col-span-2 sm:grid-cols-2'
          >
            <div>
              <p className='text-xs font-medium text-foreground'>Explore</p>
              <ul className='mt-2 space-y-1.5 [@media(pointer:coarse)]:space-y-1'>
                {marketingLinks.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className='inline-flex items-center justify-center text-xs leading-[1.125] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]'
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className='text-xs font-medium text-foreground'>Support</p>
              <ul className='mt-2 space-y-1.5 [@media(pointer:coarse)]:space-y-1'>
                <li>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className='inline-flex items-center justify-center text-xs leading-[1.125] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]'
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <p className='text-xs text-muted-foreground' suppressHydrationWarning>
          © {new Date().getFullYear()} Atlaris. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
