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
