import type { ParsedModule } from '@/shared/types/ai-parser.types';

export type { ParsedModule, ParsedTask } from '@/shared/types/ai-parser.types';

export type ParserCallbacks = {
	onFirstModuleDetected?: () => void;
	signal?: AbortSignal;
};

export type ParserErrorKind = 'invalid_json' | 'validation';

export type ParsedGeneration = {
	modules: ParsedModule[];
	rawText: string;
};
