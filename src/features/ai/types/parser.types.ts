export type ParsedTask = {
  title: string;
  description?: string;
  estimatedMinutes: number;
};

export type ParsedModule = {
  title: string;
  description?: string;
  estimatedMinutes: number;
  tasks: ParsedTask[];
};

export type ParserCallbacks = {
  onFirstModuleDetected?: () => void;
  signal?: AbortSignal;
};

export type ParserErrorKind = 'invalid_json' | 'validation';

export type ParsedGeneration = {
  modules: ParsedModule[];
  rawText: string;
};
