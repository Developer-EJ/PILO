const DEFAULT_REDIRECT_PATH = "/";
const LOGIN_RETRY_PATH = "/login";

function firstParam(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function createParamReader(source) {
  if (source && typeof source.get === "function") {
    return {
      get(name) {
        return source.get(name);
      },
    };
  }

  return {
    get(name) {
      return firstParam(source?.[name]);
    },
  };
}

function normalizeProvider(value) {
  if (value === "google" || value === "github") {
    return value;
  }

  return null;
}

function providerLabel(provider) {
  if (provider === "google") return "Google";
  if (provider === "github") return "GitHub";

  return "OAuth";
}

function appendIfPresent(params, name, value) {
  if (value) {
    params.set(name, value);
  }
}

function createLoginHref(entries) {
  const params = new URLSearchParams();

  for (const [name, value] of entries) {
    appendIfPresent(params, name, value);
  }

  const query = params.toString();

  return query ? `${LOGIN_RETRY_PATH}?${query}` : LOGIN_RETRY_PATH;
}

export function normalizeCallbackRedirect(
  value,
  fallback = DEFAULT_REDIRECT_PATH,
) {
  const target = firstParam(value);

  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return fallback;
  }

  return target;
}

export function resolveOAuthCallbackState(source = {}) {
  const params = createParamReader(source);
  const provider = normalizeProvider(params.get("provider"));
  const label = providerLabel(provider);
  const status = params.get("status") ?? params.get("auth");
  const errorCode = params.get("error") ?? params.get("errorCode");
  const message = params.get("message") ?? params.get("error_description");
  const nextPath = normalizeCallbackRedirect(params.get("next"));

  if (
    status === "success" ||
    status === "authenticated" ||
    status === "signed_in"
  ) {
    return {
      kind: "success",
      provider,
      providerLabel: label,
      title: "로그인 완료",
      message: `${label} 인증이 완료되었습니다. Workspace로 이동합니다.`,
      redirectTo: nextPath,
      loginHref: createLoginHref([
        ["auth", "success"],
        ["provider", provider],
        ["next", nextPath],
      ]),
      retryHref: LOGIN_RETRY_PATH,
    };
  }

  if (status === "error" || status === "failed" || errorCode) {
    return {
      kind: "error",
      provider,
      providerLabel: label,
      title: "로그인 실패",
      message:
        message ?? `${label} 인증이 완료되지 않았습니다. 다시 시도해 주세요.`,
      errorCode: errorCode ?? "oauth_callback_failed",
      redirectTo: null,
      loginHref: createLoginHref([
        ["auth", "error"],
        ["provider", provider],
        ["error", errorCode ?? "oauth_callback_failed"],
        ["message", message],
      ]),
      retryHref: LOGIN_RETRY_PATH,
    };
  }

  return {
    kind: "processing",
    provider,
    providerLabel: label,
    title: "로그인 확인 중",
    message: `${label} 인증 응답을 확인하고 있습니다.`,
    redirectTo: null,
    loginHref: LOGIN_RETRY_PATH,
    retryHref: LOGIN_RETRY_PATH,
  };
}
