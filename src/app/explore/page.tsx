import { Card } from '@/components/ui/card';

export default function Page() {
  return (
    <div className="container mx-auto py-8">
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
