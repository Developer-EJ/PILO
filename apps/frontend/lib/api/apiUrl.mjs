export function defaultAppServerUrl() {
  return (
    process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL ??
    process.env.NEXT_PUBLIC_APP_SERVER_URL ??
    ""
  );
}

export function normalizePiloApiPath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("PILO API path must start with /");
  }

  return path === "/api" || path.startsWith("/api/")
    ? path
    : `/api${path}`;
}

export function buildPiloApiUrl(path, baseUrl = defaultAppServerUrl()) {
  const apiPath = normalizePiloApiPath(path);
  const normalizedBaseUrl = (baseUrl ?? "").trim().replace(/\/+$/, "");

  if (!normalizedBaseUrl) {
    return apiPath;
  }

  if (normalizedBaseUrl.endsWith("/api")) {
    return `${normalizedBaseUrl}${apiPath.slice("/api".length)}`;
  }

  return `${normalizedBaseUrl}${apiPath}`;
}
