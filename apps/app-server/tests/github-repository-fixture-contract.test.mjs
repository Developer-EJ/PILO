import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { URL } from "node:url";

describe("GitHub repository fixture contract", () => {
  it("keeps fixture repositories compatible with GithubRepositorySummary", () => {
    const schema = JSON.parse(
      readFileSync(
        new URL(
          "../../../docs/contracts/schemas/pilo-public-contracts.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const repositorySchema = schema.$defs.GithubRepositorySummary;
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          "../../../docs/contracts/fixtures/github-repositories.fixture.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );

    assert.ok(Array.isArray(fixture.githubRepositories));
    for (const repository of fixture.githubRepositories) {
      assert.deepEqual(
        Object.keys(repository).sort(),
        Object.keys(repositorySchema.properties).sort(),
      );
      for (const field of repositorySchema.required) {
        assert.ok(
          Object.hasOwn(repository, field),
          `fixture repository is missing ${field}`,
        );
      }

      assert.equal(typeof repository.id, "string");
      assert.equal(typeof repository.workspaceId, "string");
      assert.equal(typeof repository.owner, "string");
      assert.equal(typeof repository.repoName, "string");
      assert.equal(typeof repository.url, "string");
      assert.ok(
        typeof repository.defaultBranch === "string" ||
          repository.defaultBranch === null,
      );
      assert.match(repository.syncedAt, /^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
