export const mockCurrentUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "donghyun@example.com",
  name: "Donghyun",
  avatarUrl: null,
  providers: ["google", "github"],
  lastLoginAt: "2026-06-27T09:00:00.000Z",
};

export const MOCK_AUTH_SIGNED_OUT_KEY = "pilo.mockAuth.signedOut";

function defaultMockAuthStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

function isStorageSignedOut(storage) {
  return storage?.getItem(MOCK_AUTH_SIGNED_OUT_KEY) === "true";
}

export function markMockAuthSignedIn(storage = defaultMockAuthStorage()) {
  storage?.removeItem(MOCK_AUTH_SIGNED_OUT_KEY);
}

export function markMockAuthSignedOut(storage = defaultMockAuthStorage()) {
  storage?.setItem(MOCK_AUTH_SIGNED_OUT_KEY, "true");
}

export function createMockAuthClient({
  currentUser = mockCurrentUser,
  signedOut = false,
  storage = defaultMockAuthStorage(),
} = {}) {
  let memorySignedOut = signedOut;

  function isSignedOut() {
    return (
      memorySignedOut || currentUser === null || isStorageSignedOut(storage)
    );
  }

  return {
    async getCurrentUser() {
      return isSignedOut() ? null : currentUser;
    },

    async getAuthSession() {
      const user = isSignedOut() ? null : currentUser;

      return {
        authenticated: Boolean(user),
        user,
      };
    },

    async logout() {
      memorySignedOut = true;
      markMockAuthSignedOut(storage);
    },
  };
}
