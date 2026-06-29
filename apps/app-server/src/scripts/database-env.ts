import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

export const DEFAULT_DATABASE_URL =
  "postgresql://pilo:pilo@localhost:5432/pilo";

export interface LoadDatabaseEnvOptions {
  configure?: (path: string) => void;
  defaultDatabaseUrl?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  paths?: string[];
}

export function defaultDatabaseEnvPaths(cwd = process.cwd()) {
  return [resolve(cwd, ".env"), resolve(cwd, "..", "..", ".env")];
}

export function loadDatabaseEnv(options: LoadDatabaseEnvOptions = {}) {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const configure =
    options.configure ??
    ((path: string) => {
      config({ path, processEnv: env as Record<string, string> });
    });
  const paths = options.paths ?? defaultDatabaseEnvPaths();

  for (const envPath of paths) {
    if (!exists(envPath)) {
      continue;
    }

    configure(envPath);

    if (env.DATABASE_URL) {
      break;
    }
  }

  env.DATABASE_URL ??= options.defaultDatabaseUrl ?? DEFAULT_DATABASE_URL;
  return env.DATABASE_URL;
}
