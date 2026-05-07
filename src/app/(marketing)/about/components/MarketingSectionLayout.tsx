import type { JSX, ReactNode } from 'react';

interface MarketingSectionLayoutProps {
  headingId: string;
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}

/**
 * Marketing section shell: section spacing, max-width container, centered h2 + subtitle stack.
 */
export function MarketingSectionLayout({
  headingId,
  title,
  subtitle,
  children,
}: MarketingSectionLayoutProps): JSX.Element {
  return (
    <section className="relative py-24 lg:py-32" aria-labelledby={headingId}>
      <div className="relative z-10 mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <h2 id={headingId} className="marketing-h2 mb-4 text-foreground">
            {title}
          </h2>
          <p className="marketing-subtitle mx-auto max-w-2xl text-muted-foreground">
            {subtitle}
          </p>
        </div>

        {children}
      </div>
    </section>
  );
}
