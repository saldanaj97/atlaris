import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'About | Atlaris',
  description:
    'Learn about Atlaris and how we help learners turn goals into scheduled execution.',
  openGraph: {
    title: 'About | Atlaris',
    description:
      'Learn about Atlaris and how we help learners turn goals into scheduled execution.',
    url: '/about',
    images: ['/og-default.jpg'],
  },
};

export default function Page() {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <Card className="p-8">
        <h1 className="text-3xl font-bold">About</h1>
        <p className="text-muted-foreground mt-4">
          Company info and blog links coming soon.
        </p>
      </Card>
    </div>
  );
}
