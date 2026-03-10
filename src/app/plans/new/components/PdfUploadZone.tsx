'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { clientLogger } from '@/lib/logging/client';
import { AlertCircle, FileText, Loader2, Upload } from 'lucide-react';
import React, { useCallback, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';

interface PdfUploadZoneProps {
  onFileSelect: (file: File) => void;
  isUploading?: boolean;
  disabled?: boolean;
  error?: string;
}

const CLIENT_PDF_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;
const CLIENT_PDF_SIZE_LIMIT_MB = CLIENT_PDF_SIZE_LIMIT_BYTES / (1024 * 1024);
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export function PdfUploadZone({
  onFileSelect,
  isUploading = false,
  disabled = false,
  error,
}: PdfUploadZoneProps): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const isPdfMagicBytes = useCallback(async (file: File): Promise<boolean> => {
    try {
      const buffer = await file.slice(0, 5).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length < PDF_MAGIC_BYTES.length) {
        return false;
      }
      return PDF_MAGIC_BYTES.every((byte, index) => bytes[index] === byte);
    } catch {
      return false;
    }
  }, []);

  const validatePdfFile = useCallback(
    async (file: File): Promise<boolean> => {
      const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
      const hasPdfMime = file.type === 'application/pdf';
      if (!hasPdfExtension && !hasPdfMime) {
        setLocalError('Please select a valid PDF file.');
        return false;
      }
      if (file.size > CLIENT_PDF_SIZE_LIMIT_BYTES) {
        setLocalError(`PDF must be ${CLIENT_PDF_SIZE_LIMIT_MB}MB or smaller.`);
        return false;
      }
      const hasMagicBytes = await isPdfMagicBytes(file);
      if (!hasMagicBytes) {
        setLocalError('File does not appear to be a valid PDF.');
        return false;
      }
      setLocalError(null);
      return true;
    },
    [isPdfMagicBytes]
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !isUploading) {
        setIsDragging(true);
      }
    },
    [disabled, isUploading]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled || isUploading) return;

      const run = async (): Promise<void> => {
        const files = Array.from(e.dataTransfer.files);

        // Find the first dropped file that passes PDF validation, regardless of
        // position. This prevents non-PDF files earlier in the drop list from
        // blocking a valid PDF file that was also dropped.
        for (const candidate of files) {
          const isValid = await validatePdfFile(candidate);
          if (isValid) {
            onFileSelect(candidate);
            return;
          }
        }
      };

      void run().catch((error: unknown) => {
        clientLogger.error('Failed to handle dropped PDF file', { error });
        setLocalError('Unable to read the dropped file. Please try again.');
      });
    },
    [disabled, isUploading, onFileSelect, validatePdfFile]
  );

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (disabled || isUploading) return;
      const input = e.currentTarget;
      const files = input.files;
      if (!files || !files[0]) return;
      const file = files[0];
      const run = async (): Promise<void> => {
        const isValid = await validatePdfFile(file);
        if (!isValid) {
          input.value = '';
          return;
        }
        onFileSelect(file);
      };

      void run().catch((error: unknown) => {
        clientLogger.error('Failed to read selected PDF file', { error });
        setLocalError('Unable to read the selected file. Please try again.');
        input.value = '';
      });
    },
    [disabled, isUploading, onFileSelect, validatePdfFile]
  );

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  return (
    <div className="w-full max-w-2xl">
      <Button
        type="button"
        variant="ghost"
        size="lg"
        tabIndex={disabled || isUploading ? -1 : 0}
        aria-disabled={disabled || isUploading}
        className={`dark:border-border dark:bg-card/60 border-border bg-card/60 relative block h-auto w-full rounded-3xl border px-6 py-12 text-left whitespace-normal shadow-2xl backdrop-blur-xl transition-all ${isDragging ? 'border-primary/50 bg-primary/5' : ''} ${disabled || isUploading ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/30 cursor-pointer'} `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label="Upload PDF file dropzone"
      >
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          aria-hidden="true"
        >
          <div className="dark:from-primary/40 dark:to-accent/30 from-primary/30 to-accent/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br opacity-40 blur-2xl dark:opacity-20" />
        </div>

        <div className="relative flex flex-col items-center text-center">
          <div className="from-primary to-accent mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br shadow-lg">
            {isUploading ? (
              <Loader2
                className="h-10 w-10 animate-spin text-white"
                aria-hidden="true"
              />
            ) : (
              <FileText className="h-10 w-10 text-white" />
            )}
          </div>

          <h3 className="text-foreground mb-2 text-xl font-semibold">
            {isUploading ? 'Extracting text from PDF...' : 'Upload your PDF'}
          </h3>

          <p className="text-muted-foreground mb-6 text-sm">
            {isUploading
              ? 'This may take a few moments'
              : 'Drag and drop your PDF here, or click to browse'}
          </p>

          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileInputChange}
            className="sr-only"
            disabled={disabled || isUploading}
          />

          {!isUploading && (
            <Button asChild variant="outline" className="pointer-events-none">
              <span>
                <Upload className="mr-2 h-4 w-4" />
                Choose File
              </span>
            </Button>
          )}

          {(localError ?? error) && (
            <Alert
              variant="destructive"
              className="border-destructive/20 bg-destructive/10 mt-4"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{localError ?? error}</AlertDescription>
            </Alert>
          )}

          <p className="text-muted-foreground mt-6 text-xs">
            Supports PDF files with extractable text only
          </p>
        </div>
      </Button>
    </div>
  );
}
