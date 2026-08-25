import BrandLogo from '@/components/shared/BrandLogo';

export default function SiteFooter() {
  return (
    <footer className='border-t border-border px-4 py-8 sm:px-6 lg:px-8'>
      <div className='mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row'>
        <BrandLogo size='sm' />
        <p className='text-xs text-muted-foreground' suppressHydrationWarning>
          © {new Date().getFullYear()} Atlaris. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
