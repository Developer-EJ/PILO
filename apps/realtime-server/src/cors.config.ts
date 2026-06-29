export function createRealtimeCorsOptions(origin = process.env.CORS_ORIGIN) {
  const configuredOrigin = origin?.trim() || "*";

  if (configuredOrigin === "*") {
    return {
      origin: true,
      credentials: false,
    };
  }

  return {
    origin: configuredOrigin
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    credentials: true,
  };
}
