'use client';

import { AlertTriangle, ArrowLeft } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';

const ERROR_MESSAGES = {
  FILE_TOO_LARGE: {
    title: 'File Too Large',
    description:
      'This PDF exceeds the size limit for your subscription tier. Try a smaller file or upgrade your plan.',
  },
  TOO_MANY_PAGES: {
    title: 'Too Many Pages',
    description:
      'This PDF has too many pages for your subscription tier. Try a shorter document or upgrade your plan.',
  },
  NO_TEXT: {
    title: 'No Extractable Text',
    description:
      'This PDF appears to be scanned or image-based. Please use a PDF with selectable text.',
  },
  QUOTA_EXCEEDED: {
    title: 'Monthly Limit Reached',
    description:
      "You've reached your monthly PDF plan limit. Upgrade your plan or wait until next month.",
  },
  INVALID_FILE: {
    title: 'Invalid File',
    description:
      'This file is not a valid PDF or is corrupted. Please try a different file.',
  },
  PASSWORD_PROTECTED: {
    title: 'Password Protected',
    description:
      'Password-protected PDFs are not supported. Please remove the password protection or use a different file.',
  },
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

const ERROR_CODES: ErrorCode[] = Object.keys(ERROR_MESSAGES) as ErrorCode[];

export function isKnownErrorCode(code: string | undefined): code is ErrorCode {
  return typeof code === 'string' && ERROR_CODES.includes(code as ErrorCode);
}

interface PdfUploadErrorProps {
  error: string;
  code?: ErrorCode;
  onRetry?: () => void;
  onBack?: () => void;
}

export function PdfUploadError({
  error,
  code,
  onRetry,
  onBack,
}: PdfUploadErrorProps): React.ReactElement {
  const errorInfo = code ? ERROR_MESSAGES[code] : null;

  return (
    <div className="w-full max-w-2xl" role="alert">
      <div className="dark:border-border dark:bg-card/60 border-border bg-card/60 relative rounded-3xl border px-6 py-12 shadow-2xl backdrop-blur-xl">
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          aria-hidden="true"
        >
          <div className="dark:from-destructive/40 from-destructive/30 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br to-orange-500/20 opacity-40 blur-2xl dark:to-orange-500/30 dark:opacity-20" />
        </div>

        <div className="relative flex flex-col items-center text-center">
          <div className="from-destructive mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br to-orange-500 shadow-lg">
            <AlertTriangle className="h-10 w-10 text-white" />
          </div>

          <h3 className="text-foreground mb-2 text-xl font-semibold">
            {errorInfo?.title || 'Upload Failed'}
          </h3>

          <p className="text-muted-foreground mb-6 text-sm">
            {errorInfo?.description || error}
          </p>

          <div className="flex gap-3">
            {onBack && (
              <Button type="button" variant="outline" onClick={onBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go Back
              </Button>
            )}

            {onRetry && (
              <Button
                type="button"
                onClick={onRetry}
                className="from-primary via-accent to-primary shadow-primary/25 hover:shadow-primary/30 rounded-2xl bg-linear-to-r text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl"
              >
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
