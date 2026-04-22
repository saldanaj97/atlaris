export type AdaptiveTimeoutConfig = {
	baseMs: number;
	extensionMs: number;
	extensionThresholdMs: number;
	now?: () => number;
};
