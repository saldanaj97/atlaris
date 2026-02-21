import type { Metadata } from 'next';
import type { JSX } from 'react';

import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Explore | Atlaris',
  description:
    'Explore community plans, templates, and curated learning tracks in Atlaris.',
  openGraph: {
    title: 'Explore | Atlaris',
    description:
      'Explore community plans, templates, and curated learning tracks in Atlaris.',
    url: '/explore',
    images: ['/og-default.jpg'],
  },
};

export default function Page(): JSX.Element {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <Card className="p-8">
        <h1 className="text-3xl font-bold">Explore</h1>
        <p className="text-muted-foreground mt-4">
          Community-shared plans, curated templates, and trending topics coming
          soon.
        </p>
      </Card>
    </div>
  );
}
