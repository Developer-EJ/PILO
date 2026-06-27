export const mockCurrentUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "donghyun@example.com",
  name: "Donghyun",
  avatarUrl: null,
  providers: ["google", "github"],
  lastLoginAt: "2026-06-27T09:00:00.000Z",
};

export function createMockAuthClient({ currentUser = mockCurrentUser } = {}) {
  let signedOut = false;

  return {
    async getCurrentUser() {
      return signedOut ? null : currentUser;
    },

    async getAuthSession() {
      const user = signedOut ? null : currentUser;

      return {
        authenticated: Boolean(user),
        user,
      };
    },

    async logout() {
      signedOut = true;
    },
  };
}
