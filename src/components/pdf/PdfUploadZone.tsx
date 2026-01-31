'use client';

import { Button } from '@/components/ui/button';
import { FileText, Loader2, Upload } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';

interface PdfUploadZoneProps {
  onFileSelect: (file: File) => void;
  isUploading?: boolean;
  disabled?: boolean;
  error?: string;
}

/**
 * PDF Upload Zone Component
 *
 * Drag-drop or click to upload PDF files.
 * Features glassmorphism design matching the landing page aesthetic.
 */
export function PdfUploadZone({
  onFileSelect,
  isUploading = false,
  disabled = false,
  error,
}: PdfUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !isUploading) {
        setIsDragging(true);
      }
    },
    [disabled, isUploading]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled || isUploading) return;

      const files = Array.from(e.dataTransfer.files);
      const pdfFile = files.find((file) => file.type === 'application/pdf');

      if (pdfFile) {
        onFileSelect(pdfFile);
      }
    },
    [disabled, isUploading, onFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files[0]) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  return (
    <div className="w-full max-w-2xl">
      <div
        tabIndex={disabled || isUploading ? -1 : 0}
        className={`dark:border-border dark:bg-card/60 border-border bg-card/60 relative rounded-3xl border px-6 py-12 shadow-2xl backdrop-blur-xl transition-all ${isDragging ? 'border-primary/50 bg-primary/5' : ''} ${disabled || isUploading ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/30 cursor-pointer'} `}
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
          <div className="dark:from-primary/40 dark:to-accent/30 from-primary/30 to-accent/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-40 blur-2xl dark:opacity-20" />
        </div>

        <div className="relative flex flex-col items-center text-center">
          <div className="from-primary to-accent mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg">
            {isUploading ? (
              <Loader2 className="h-10 w-10 animate-spin text-white" />
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
            <Button
              type="button"
              variant="outline"
              className="pointer-events-auto"
              disabled={disabled}
            >
              <Upload className="mr-2 h-4 w-4" />
              Choose File
            </Button>
          )}

          {error && (
            <div className="bg-destructive/10 border-destructive/20 text-destructive mt-4 rounded-lg border px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <p className="text-muted-foreground mt-6 text-xs">
            Supports PDF files with extractable text only
          </p>
        </div>
      </div>
    </div>
  );
}
