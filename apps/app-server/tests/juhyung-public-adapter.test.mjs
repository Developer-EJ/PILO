import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  JuhyungPublicAdapter,
} = require("../src/modules/juhyung/juhyung-public.adapter");

const schema = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "..",
      "..",
      "docs",
      "contracts",
      "schemas",
      "pilo-public-contracts.schema.json",
    ),
    "utf8",
  ),
);

const UUIDS = {
  workspace: "11111111-1111-4111-8111-111111111111",
  task: "22222222-2222-4222-8222-222222222222",
  member: "33333333-3333-4333-8333-333333333333",
  user: "44444444-4444-4444-8444-444444444444",
  repository: "55555555-5555-4555-8555-555555555555",
  issue: "66666666-6666-4666-8666-666666666666",
  pullRequest: "77777777-7777-4777-8777-777777777777",
  milestone: "88888888-8888-4888-8888-888888888888",
  snapshot: "99999999-9999-4999-8999-999999999999",
};

function assertContract(defName, value) {
  const errors = validateSchema(schema.$defs[defName], value, schema);
  assert.deepEqual(
    errors,
    [],
    `${defName} contract errors: ${errors.join(", ")}`,
  );
}

function validateSchema(definition, value, root, path = "$") {
  if (definition.$ref) {
    return validateSchema(resolveRef(root, definition.$ref), value, root, path);
  }

  if (definition.anyOf) {
    const optionErrors = definition.anyOf.map((option) =>
      validateSchema(option, value, root, path),
    );
    return optionErrors.some((errors) => errors.length === 0)
      ? []
      : [`${path} did not match any schema option`];
  }

  if (definition.enum && !definition.enum.includes(value)) {
    return [`${path} must be one of ${definition.enum.join(", ")}`];
  }

  const typeErrors = validateType(definition.type, value, path);
  if (typeErrors.length > 0) {
    return typeErrors;
  }

  const errors = [];
  if (definition.format === "uuid" && !isUuid(value)) {
    errors.push(`${path} must be a uuid`);
  }
  if (definition.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${path} must be a date`);
  }
  if (definition.format === "date-time" && Number.isNaN(Date.parse(value))) {
    errors.push(`${path} must be a date-time`);
  }
  if (typeof definition.minimum === "number" && value < definition.minimum) {
    errors.push(`${path} must be >= ${definition.minimum}`);
  }
  if (typeof definition.maximum === "number" && value > definition.maximum) {
    errors.push(`${path} must be <= ${definition.maximum}`);
  }
  if (
    typeof definition.minLength === "number" &&
    value.length < definition.minLength
  ) {
    errors.push(`${path} length must be >= ${definition.minLength}`);
  }

  if (definition.type === "object") {
    const properties = definition.properties ?? {};
    for (const required of definition.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(`${path}.${required} is required`);
      }
    }
    if (definition.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          errors.push(`${path}.${key} is not allowed`);
        }
      }
    }
    for (const [key, childDefinition] of Object.entries(properties)) {
      if (Object.hasOwn(value, key) && value[key] !== undefined) {
        errors.push(
          ...validateSchema(
            childDefinition,
            value[key],
            root,
            `${path}.${key}`,
          ),
        );
      }
    }
  }

  if (definition.type === "array") {
    for (const [index, item] of value.entries()) {
      errors.push(
        ...validateSchema(definition.items, item, root, `${path}[${index}]`),
      );
    }
  }

  return errors;
}

function validateType(expected, value, path) {
  const expectedTypes = Array.isArray(expected) ? expected : [expected];
  if (!expected) {
    return [];
  }
  const actual = Array.isArray(value)
    ? "array"
    : value === null
      ? "null"
      : typeof value;
  if (expectedTypes.includes(actual)) {
    return [];
  }
  if (expectedTypes.includes("integer") && Number.isInteger(value)) {
    return [];
  }
  return [`${path} must be ${expectedTypes.join("|")}`];
}

function resolveRef(root, ref) {
  return ref
    .replace("#/", "")
    .split("/")
    .reduce((value, segment) => value[segment], root);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

describe("JuhyungPublicAdapter", () => {
  const adapter = new JuhyungPublicAdapter();

  it("maps a Milestone domain record to the MilestoneSummary public DTO", () => {
    const summary = adapter.toMilestoneSummary({
      id: UUIDS.milestone,
      workspaceId: UUIDS.workspace,
      title: "MVP Backend",
      status: "in_progress",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-31T00:00:00.000Z"),
      updatedAt: new Date("2026-06-28T12:00:00.000Z"),
    });

    assert.deepEqual(summary, {
      id: UUIDS.milestone,
      workspaceId: UUIDS.workspace,
      title: "MVP Backend",
      status: "in_progress",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      updatedAt: "2026-06-28T12:00:00.000Z",
    });
    assertContract("MilestoneSummary", summary);
  });

  it("maps a Task domain record to the TaskSummary public DTO", () => {
    const summary = adapter.toTaskSummary(
      {
        id: UUIDS.task,
        workspaceId: UUIDS.workspace,
        milestoneId: UUIDS.milestone,
        title: "Connect repository",
        status: "in_progress",
        priority: "high",
        assigneeMemberId: UUIDS.member,
        dueDate: new Date("2026-07-03T00:00:00.000Z"),
        updatedAt: new Date("2026-06-27T12:00:00.000Z"),
      },
      {
        assignee: {
          id: UUIDS.member,
          userId: UUIDS.user,
          displayName: "Juhyung",
        },
        linkedIssueCount: 2,
        linkedPrCount: 1,
        now: new Date("2026-07-04T00:00:00.000Z"),
      },
    );

    assert.deepEqual(summary, {
      id: UUIDS.task,
      workspaceId: UUIDS.workspace,
      milestoneId: UUIDS.milestone,
      title: "Connect repository",
      status: "in_progress",
      priority: "high",
      assignee: {
        memberId: UUIDS.member,
        userId: UUIDS.user,
        name: "Juhyung",
      },
      dueDate: "2026-07-03",
      isDelayed: true,
      linkedIssueCount: 2,
      linkedPrCount: 1,
      updatedAt: "2026-06-27T12:00:00.000Z",
    });
    assertContract("TaskSummary", summary);
  });

  it("maps GitHub and Progress records to public DTOs that match the schema", () => {
    const issue = adapter.toGithubIssueSummary(
      {
        id: UUIDS.issue,
        repositoryId: UUIDS.repository,
        number: 12,
        title: "Task API",
        state: "open",
        url: "https://github.com/org/repo/issues/12",
        syncedAt: new Date("2026-06-27T12:00:00.000Z"),
      },
      {
        labels: ["backend", "task"],
        linkedTaskId: UUIDS.task,
      },
    );
    const pullRequest = adapter.toPullRequestSummary(
      {
        id: UUIDS.pullRequest,
        repositoryId: UUIDS.repository,
        number: 33,
        title: "feat: task api",
        authorLogin: "github-user",
        state: "review_requested",
        branch: "feat/task-api",
        baseBranch: "dev",
        url: "https://github.com/org/repo/pull/33",
        changedFilesCount: 8,
        additions: 200,
        deletions: 40,
        syncedAt: new Date("2026-06-27T12:00:00.000Z"),
      },
      {
        linkedTaskIds: [UUIDS.task],
      },
    );
    const progress = adapter.toProgressSummary({
      workspaceId: UUIDS.workspace,
      milestoneId: UUIDS.milestone,
      totalTasks: 20,
      doneTasks: 8,
      blockedTasks: 2,
      reviewTasks: 3,
      delayedTasks: 1,
      progressRate: "40.00",
      capturedAt: new Date("2026-06-27T12:00:00.000Z"),
    });

    assertContract("GithubIssueSummary", issue);
    assertContract("PullRequestSummary", pullRequest);
    assertContract("ProgressSummary", progress);
    assert.equal(progress.progressRate, 40);
  });
});
