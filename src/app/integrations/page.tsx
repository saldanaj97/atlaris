import { Card } from '@/components/ui/card';

export default function Page() {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <Card className="p-8">
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-4">
          Showcase for Notion, Google Calendar, and CSV exports coming soon.
        </p>
      </Card>
    </div>
  );
}
