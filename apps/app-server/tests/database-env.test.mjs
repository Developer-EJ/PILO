import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { loadDatabaseEnv } = require("../src/scripts/database-env");

describe("loadDatabaseEnv", () => {
  it("continues to the next candidate when an existing env file does not set DATABASE_URL", () => {
    const env = {};
    const configuredPaths = [];

    const databaseUrl = loadDatabaseEnv({
      defaultDatabaseUrl: "postgresql://default",
      env,
      exists: () => true,
      paths: ["empty.env", "database.env"],
      configure: (path) => {
        configuredPaths.push(path);
        if (path === "database.env") {
          env.DATABASE_URL = "postgresql://configured";
        }
      },
    });

    assert.equal(databaseUrl, "postgresql://configured");
    assert.deepEqual(configuredPaths, ["empty.env", "database.env"]);
  });

  it("uses the default URL only after no candidate sets DATABASE_URL", () => {
    const env = {};

    const databaseUrl = loadDatabaseEnv({
      defaultDatabaseUrl: "postgresql://default",
      env,
      exists: () => true,
      paths: ["empty.env"],
      configure: () => {},
    });

    assert.equal(databaseUrl, "postgresql://default");
    assert.equal(env.DATABASE_URL, "postgresql://default");
  });
});
