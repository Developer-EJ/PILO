const PROTECTED_PATH_PREFIXES = [
  "/canvas",
  "/dashboard",
  "/workspace",
  "/workspaces",
];

export function isProtectedPath(pathname) {
  if (pathname === "/") {
    return true;
  }

  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function safeNextPath(value, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export function createLoginRedirectHref(nextPath = "/") {
  const safePath = safeNextPath(nextPath);
  const params = new URLSearchParams({ next: safePath });

  return `/login?${params.toString()}`;
}

export function isLocalMvpAuthFallbackAllowed({
  authMode = process.env.NEXT_PUBLIC_PILO_AUTH_MODE,
  disabled = process.env.NEXT_PUBLIC_PILO_DISABLE_LOCAL_AUTH_FALLBACK,
  hostname = "",
} = {}) {
  if (authMode !== "api" || disabled === "true") {
    return false;
  }

  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}
