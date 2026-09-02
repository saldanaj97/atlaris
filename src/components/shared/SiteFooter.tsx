import BrandLogo from '@/components/shared/BrandLogo';
import { ROUTES } from '@/features/navigation/routes';
import Link from 'next/link';

const footerLinks = [
  { label: 'Home', href: ROUTES.LANDING },
  { label: 'Pricing', href: ROUTES.PRICING },
  { label: 'About', href: ROUTES.ABOUT },
] as const;

export default function SiteFooter() {
  return (
    <footer className='border-t border-border px-4 py-8 sm:px-6 lg:px-8'>
      <div className='mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row'>
        <BrandLogo size='sm' />
        <nav aria-label='Footer' className='flex items-center gap-6 lg:gap-8'>
          {footerLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className='font-serif text-xs tracking-[0.04em] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <p className='text-xs text-muted-foreground' suppressHydrationWarning>
          © {new Date().getFullYear()} Atlaris. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
