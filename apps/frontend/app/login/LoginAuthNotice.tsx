"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

function providerLabel(provider: string | null) {
  if (provider === "google") return "Google";
  if (provider === "github") return "GitHub";

  return "OAuth";
}

export function LoginAuthNotice() {
  const searchParams = useSearchParams();
  const notice = useMemo(() => {
    const auth = searchParams.get("auth") ?? searchParams.get("status");
    const errorCode =
      searchParams.get("error") ?? searchParams.get("errorCode");
    const provider = providerLabel(searchParams.get("provider"));

    if (auth === "success" || auth === "authenticated") {
      return {
        kind: "success",
        title: "로그인 완료",
        message: `${provider} 인증이 완료되었습니다. 워크스페이스로 이동합니다.`,
      };
    }

    if (auth === "error" || auth === "failed" || errorCode) {
      return {
        kind: "error",
        title: "로그인 실패",
        message:
          searchParams.get("message") ??
          `${provider} 인증을 완료하지 못했습니다. 다시 시도해 주세요.`,
        code: errorCode ?? "oauth_callback_failed",
      };
    }

    return null;
  }, [searchParams]);

  if (!notice) return null;

  return (
    <div
      className={`login-auth-notice login-auth-notice-${notice.kind}`}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <i aria-hidden="true" />
      <span>
        <strong>{notice.title}</strong>
        <small>{notice.message}</small>
        {"code" in notice ? <code>{notice.code}</code> : null}
      </span>
    </div>
  );
}
