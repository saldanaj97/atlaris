import { BookOpen } from 'lucide-react';

export default function SiteFooter() {
  return (
    <footer className="container mx-auto border-t px-6 py-8">
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center space-x-2">
          <BookOpen className="text-primary h-6 w-6" />
          <span className="font-semibold">Learn App</span>
        </div>
        <div className="text-muted-foreground text-sm">
          © 2025 Learn App. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
