'use client';

import type { ReactElement } from 'react';

import { PdfUploadZone } from '@/app/plans/new/components/PdfUploadZone';
import { Button } from '@/components/ui/button';

interface PdfUploadingStateProps {
  onCancelUpload: () => void;
}

export function PdfUploadingState({
  onCancelUpload,
}: PdfUploadingStateProps): ReactElement {
  return (
    <div className="w-full max-w-2xl space-y-4">
      <PdfUploadZone
        onFileSelect={() => {
          // Zone is fully disabled during upload; this callback is unreachable.
        }}
        isUploading={true}
        disabled={true}
      />
      <div className="flex justify-center">
        <Button type="button" variant="outline" onClick={onCancelUpload}>
          Cancel upload
        </Button>
      </div>
    </div>
  );
}
