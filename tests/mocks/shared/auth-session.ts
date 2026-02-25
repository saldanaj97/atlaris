interface MockAuthSession {
  data: {
    user: {
      id: string;
    } | null;
  };
}

export function createAuthenticatedSession(userId: string): MockAuthSession {
  return {
    data: {
      user: {
        id: userId,
      },
    },
  };
}

export function createUnauthenticatedSession(): MockAuthSession {
  return {
    data: {
      user: null,
    },
  };
}
