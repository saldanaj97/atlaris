'use client';

import { CheckCircle2, FileText } from 'lucide-react';
import type { JSX } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const CONFIDENCE_COLORS: Record<'high' | 'medium' | 'low', string> = {
  high: 'border-success/30 bg-success/10 text-success dark:text-success-foreground',
  medium:
    'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
  low: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
};

interface PdfExtractionHeaderProps {
  pageCount: number;
  sectionCount: number;
  confidence: 'high' | 'medium' | 'low';
}

export function PdfExtractionHeader({
  pageCount,
  sectionCount,
  confidence,
}: PdfExtractionHeaderProps): JSX.Element {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="from-primary to-accent flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br shadow-lg">
          <FileText className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="text-foreground text-lg font-semibold">
            PDF Extracted Successfully
          </h3>
          <p className="text-muted-foreground text-sm">
            {pageCount} pages • {sectionCount} sections found
          </p>
        </div>
      </div>

      <Badge className={cn(CONFIDENCE_COLORS[confidence], 'border')}>
        <CheckCircle2 className="mr-1 h-3 w-3" />
        {confidence} confidence
      </Badge>
    </div>
  );
}
