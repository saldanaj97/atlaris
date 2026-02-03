export interface PdfExtractionResult {
  success: true;
  text: string;
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
  };
  structure: ExtractedStructure;
}

export interface PdfExtractionError {
  success: false;
  error:
    | 'invalid_file'
    | 'password_protected'
    | 'no_text'
    | 'extraction_failed';
  message: string;
}

export type PdfExtractionResponse = PdfExtractionResult | PdfExtractionError;

export interface ExtractedSection {
  id?: string;
  title: string;
  content: string;
  level: number;
  suggestedTopic?: string;
}

export interface ExtractedStructure {
  sections: ExtractedSection[];
  suggestedMainTopic: string;
  confidence: 'high' | 'medium' | 'low';
}

export type PdfValidationResult =
  | {
      success: true;
      sizeBytes: number;
      pageCount: number;
      message?: string;
    }
  | {
      success: false;
      error:
        | 'invalid_mime'
        | 'too_large'
        | 'too_many_pages'
        | 'no_text'
        | 'invalid_size'
        | 'invalid_page_count'
        | 'empty_document';
      message: string;
    };

export interface PdfValidationInput {
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  text?: string;
}

export interface PdfValidationLimits {
  maxSizeBytes: number;
  maxPages: number;
}
