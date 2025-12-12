import { Card } from '@/components/ui/card';

export default function Page() {
  return (
    <div className="container mx-auto py-8">
      <Card className="p-8">
        <h1 className="text-3xl font-bold">About</h1>
        <p className="text-muted-foreground mt-4">
          Company info and blog links coming soon.
        </p>
      </Card>
    </div>
  );
}
