export function setTestUser(clerkUserId: string) {
  process.env.DEV_CLERK_USER_ID = clerkUserId;
}
