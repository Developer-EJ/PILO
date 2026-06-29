"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "../../lib/auth/authClient.mjs";

export function LogoutButton() {
  const router = useRouter();
  const authClient = useMemo(() => createAuthClient(), []);
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;

    setPending(true);
    setErrorMessage("");

    try {
      await authClient.logout();
      router.replace("/login");
    } catch {
      setErrorMessage("로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="logout-control">
      <button
        className="logout-button"
        disabled={pending}
        onClick={handleLogout}
        type="button"
      >
        {pending ? "로그아웃 중" : "로그아웃"}
      </button>
      {errorMessage ? (
        <small className="logout-error" role="alert">
          {errorMessage}
        </small>
      ) : null}
    </span>
  );
}
