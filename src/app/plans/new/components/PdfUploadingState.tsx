'use client';

import { PdfUploadZone } from '@/app/plans/new/components/PdfUploadZone';
import { Button } from '@/components/ui/button';

interface PdfUploadingStateProps {
  onFileSelect: (file: File) => void;
  onCancelUpload: () => void;
}

export function PdfUploadingState({
  onFileSelect,
  onCancelUpload,
}: PdfUploadingStateProps): React.ReactElement {
  return (
    <div className="w-full max-w-2xl space-y-4">
      <PdfUploadZone
        onFileSelect={onFileSelect}
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
