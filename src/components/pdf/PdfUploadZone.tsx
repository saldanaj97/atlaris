'use client';

import { Button } from '@/components/ui/button';
import { clientLogger } from '@/lib/logging/client';
import { FileText, Loader2, Upload } from 'lucide-react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import React, { useCallback, useId, useRef, useState } from 'react';

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
}: PdfUploadZoneProps): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const isPdfMagicBytes = useCallback(async (file: File): Promise<boolean> => {
    try {
      const buffer = await file.slice(0, 5).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const magicBytes = [0x25, 0x50, 0x44, 0x46, 0x2d];
      if (bytes.length < magicBytes.length) {
        return false;
      }
      return magicBytes.every((byte, index) => bytes[index] === byte);
    } catch {
      return false;
    }
  }, []);

  const validatePdfFile = useCallback(
    async (file: File): Promise<boolean> => {
      const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
      const hasPdfMime = file.type === 'application/pdf';
      if (!hasPdfExtension || !hasPdfMime) {
        setLocalError('Please select a valid PDF file.');
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
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled || isUploading) return;

      const files = Array.from(e.dataTransfer.files);
      const pdfFile = files.find(
        (file) =>
          file.type === 'application/pdf' &&
          file.name.toLowerCase().endsWith('.pdf')
      );

      if (!pdfFile) {
        setLocalError('Please select a PDF file.');
        return;
      }

      const isValid = await validatePdfFile(pdfFile);
      if (isValid) {
        onFileSelect(pdfFile);
      }
    },
    [disabled, isUploading, onFileSelect, validatePdfFile]
  );

  const handleFileInputChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      if (disabled || isUploading) return;
      const files = e.target.files;
      if (!files || !files[0]) return;
      const file = files[0];
      try {
        const isValid = await validatePdfFile(file);
        if (!isValid) {
          e.target.value = '';
          return;
        }
        onFileSelect(file);
      } catch (error) {
        clientLogger.error('Failed to read selected PDF file', { error });
        setLocalError('Unable to read the selected file. Please try again.');
        e.target.value = '';
      }
    },
    [disabled, isUploading, onFileSelect, validatePdfFile]
  );

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
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
        role="button"
        tabIndex={disabled || isUploading ? -1 : 0}
        aria-disabled={disabled || isUploading}
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
          <div className="dark:from-primary/40 dark:to-accent/30 from-primary/30 to-accent/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br opacity-40 blur-2xl dark:opacity-20" />
        </div>

        <div className="relative flex flex-col items-center text-center">
          <div className="from-primary to-accent mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br shadow-lg">
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

          {(localError ?? error) && (
            <div className="bg-destructive/10 border-destructive/20 text-destructive mt-4 rounded-lg border px-4 py-2 text-sm">
              {localError ?? error}
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
