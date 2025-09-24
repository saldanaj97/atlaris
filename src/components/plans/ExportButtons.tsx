import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { Calendar, Download, FileText } from 'lucide-react';

export const ExportButtons = () => {
  const handleExport = (type: 'notion' | 'calendar' | 'csv') => {
    toast.info(`Export to ${type.toUpperCase()} is coming soon.`);
  };

  return (
    <div className="mt-6 mb-8 grid gap-4 md:grid-cols-3">
      <Button onClick={() => handleExport('notion')}>
        <Download className="mr-2 h-4 w-4" />
        Export to Notion
      </Button>
      <Button variant="outline" onClick={() => handleExport('calendar')}>
        <Calendar className="mr-2 h-4 w-4" />
        Add to Calendar
      </Button>
      <Button variant="outline" onClick={() => handleExport('csv')}>
        <FileText className="mr-2 h-4 w-4" />
        Download CSV
      </Button>
    </div>
  );
};

export default ExportButtons;
