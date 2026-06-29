export function authProviderHref(
  path,
  baseUrl = process.env.NEXT_PUBLIC_APP_SERVER_URL,
) {
  const normalizedBaseUrl = baseUrl?.replace(/\/$/, "");

  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;
}
