/**
 * Test-only helper for exercising the DEV_AUTH_USER_ID config path without
 * mutating process.env directly in tests.
 */
export function setDevAuthUserIdForTests(userId: string): void {
	process.env.DEV_AUTH_USER_ID = userId;
}

/** Test-only companion to {@link setDevAuthUserIdForTests}. */
export function clearDevAuthUserIdForTests(): void {
	delete process.env.DEV_AUTH_USER_ID;
}
