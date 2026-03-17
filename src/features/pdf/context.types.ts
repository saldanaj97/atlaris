export type PdfContextSection = {
  title: string;
  content: string;
  level: number;
  suggestedTopic?: string;
};

export type PdfContextCaps = {
  maxSections: number;
  maxTotalChars: number;
  maxSectionContentChars: number;
};

export type PdfContext = {
  mainTopic: string;
  sections: PdfContextSection[];
};
