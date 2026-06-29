"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createAuthClient } from "../../lib/auth/authClient.mjs";
import {
  createLoginRedirectHref,
  isProtectedPath,
} from "../../lib/auth/protectedRoutes.mjs";

type AuthGuardProps = {
  children: React.ReactNode;
};

function isMockSignedOut(value: string | null) {
  return value === "signed_out" || value === "guest";
}

function createNextPath(pathname: string, searchParams: URLSearchParams) {
  const cleanParams = new URLSearchParams(searchParams);

  cleanParams.delete("mockAuth");

  const query = cleanParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [allowed, setAllowed] = useState(false);
  const [authError, setAuthError] = useState(false);

  const nextPath = useMemo(
    () => createNextPath(pathname, new URLSearchParams(searchKey)),
    [pathname, searchKey],
  );
  const loginHref = useMemo(
    () => createLoginRedirectHref(nextPath),
    [nextPath],
  );

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      if (!isProtectedPath(pathname)) {
        setAuthError(false);
        setAllowed(true);
        return;
      }

      setAuthError(false);
      setAllowed(false);

      const authClient = createAuthClient({
        mock: {
          signedOut: isMockSignedOut(
            new URLSearchParams(searchKey).get("mockAuth"),
          ),
        },
      });
      const session = await authClient.getAuthSession();

      if (cancelled) return;

      if (!session.authenticated) {
        router.replace(loginHref);
        return;
      }

      setAllowed(true);
    }

    checkAuth().catch(() => {
      if (!cancelled) {
        setAuthError(true);
        setAllowed(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loginHref, pathname, router, searchKey]);

  if (authError) {
    return (
      <main className="auth-guard-error" role="alert">
        <strong>세션 확인에 실패했습니다.</strong>
        <button onClick={() => window.location.reload()} type="button">
          다시 시도
        </button>
      </main>
    );
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
