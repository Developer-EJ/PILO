import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { DatabaseService } = require("../src/modules/database/database.service");

describe("DatabaseService", () => {
  it("uses a tagged query for ping", async () => {
    process.env.DATABASE_URL ??= "postgresql://pilo:pilo@localhost:5432/pilo";
    const queries = [];
    const database = new DatabaseService();
    database.$queryRaw = async (query) => {
      queries.push(query);
      return [{ "?column?": 1 }];
    };
    database.$queryRawUnsafe = async () => {
      throw new Error("ping should not use unsafe raw queries");
    };

    const result = await database.ping();

    assert.equal(result, true);
    assert.equal(queries.length, 1);
    assert.deepEqual(Array.from(queries[0]), ["SELECT 1"]);
  });
});
