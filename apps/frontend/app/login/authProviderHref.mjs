import { defaultAppServerUrl } from "../../lib/auth/authClient.mjs";
import { safeNextPath } from "../../lib/auth/protectedRoutes.mjs";

function normalizeOptions(options) {
  if (typeof options === "string" || options === undefined) {
    return {
      baseUrl: options ?? defaultAppServerUrl(),
      next: null,
    };
  }

  return {
    baseUrl: options.baseUrl ?? defaultAppServerUrl(),
    next: options.next ?? null,
  };
}

export function authProviderHref(path, options) {
  const { baseUrl, next } = normalizeOptions(options);
  const normalizedBaseUrl = baseUrl?.replace(/\/$/, "");
  const href = normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;

  if (!next) {
    return href;
  }

  const params = new URLSearchParams({ next: safeNextPath(next) });
  const separator = href.includes("?") ? "&" : "?";

  return `${href}${separator}${params.toString()}`;
}
