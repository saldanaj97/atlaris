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
