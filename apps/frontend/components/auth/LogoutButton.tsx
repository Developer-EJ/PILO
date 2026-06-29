"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "../../lib/auth/authClient.mjs";

export function LogoutButton() {
  const router = useRouter();
  const authClient = useMemo(() => createAuthClient(), []);
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;

    setPending(true);

    try {
      await authClient.logout();
      router.replace("/login");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className="logout-button"
      disabled={pending}
      onClick={handleLogout}
      type="button"
    >
      {pending ? "로그아웃 중" : "로그아웃"}
    </button>
  );
}
