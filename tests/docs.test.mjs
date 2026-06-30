import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function assertMatchesSchema(defs, schema, value, fieldPath) {
  if (schema.$ref) {
    const refName = schema.$ref.replace("#/$defs/", "");
    if (refName === "uuid") {
      assert.equal(typeof value, "string", `${fieldPath} must be a uuid string`);
      assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      return;
    }

    assert.ok(defs[refName], `${fieldPath} references missing schema ${refName}`);
    assertMatchesSchema(defs, defs[refName], value, fieldPath);
    return;
  }

  if (schema.anyOf) {
    const errors = [];
    for (const option of schema.anyOf) {
      try {
        assertMatchesSchema(defs, option, value, fieldPath);
        return;
      } catch (error) {
        errors.push(error.message);
      }
    }

    assert.fail(`${fieldPath} must match one anyOf schema: ${errors.join("; ")}`);
  }

  if (schema.format === "uuid") {
    assert.equal(typeof value, "string", `${fieldPath} must be a uuid string`);
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    return;
  }

  if (schema.enum) {
    assert.ok(schema.enum.includes(value), `${fieldPath} must be one of ${schema.enum.join(", ")}`);
    return;
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actualType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const typeMatches = types.includes(actualType) || (types.includes("integer") && Number.isInteger(value));
  assert.ok(typeMatches, `${fieldPath} must be ${types.join(" or ")}`);

  if (types.includes("integer") && actualType !== "null") {
    assert.ok(Number.isInteger(value), `${fieldPath} must be an integer`);
  }

  if (typeof schema.minimum === "number") {
    assert.ok(value >= schema.minimum, `${fieldPath} must be >= ${schema.minimum}`);
  }

  if (typeof schema.maximum === "number") {
    assert.ok(value <= schema.maximum, `${fieldPath} must be <= ${schema.maximum}`);
  }

  if (typeof schema.minLength === "number" && actualType !== "null") {
    assert.equal(typeof value, "string", `${fieldPath} must be a string`);
    assert.ok(
      value.length >= schema.minLength,
      `${fieldPath} must have length >= ${schema.minLength}`,
    );
  }

  if (schema.format === "date") {
    assert.equal(typeof value, "string", `${fieldPath} must be a date string`);
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${fieldPath} must be an ISO date`);
  }

  if (schema.format === "date-time") {
    assert.equal(
      typeof value,
      "string",
      `${fieldPath} must be a date-time string`,
    );
    assert.match(
      value,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
      `${fieldPath} must be an ISO date-time`,
    );
  }

  if (actualType === "array" && schema.items) {
    value.forEach((item, index) => assertMatchesSchema(defs, schema.items, item, `${fieldPath}[${index}]`));
  }

  if (actualType === "object" && schema.properties) {
    for (const key of schema.required || []) {
      assert.ok(Object.hasOwn(value, key), `${fieldPath}.${key} is required`);
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        assert.ok(schema.properties[key], `${fieldPath}.${key} is not in the public schema`);
      }
    }

    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key)) {
        assertMatchesSchema(defs, childSchema, value[key], `${fieldPath}.${key}`);
      }
    }
  }
}

function assertMatchesDefinition(defs, defName, value) {
  const def = defs[defName];
  assert.equal(def.type, "object", `${defName} must be an object schema`);

  for (const key of def.required || []) {
    assert.ok(Object.hasOwn(value, key), `${defName}.${key} is required`);
  }

  if (def.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      assert.ok(def.properties[key], `${defName}.${key} is not in the public schema`);
    }
  }

  for (const [key, schema] of Object.entries(def.properties)) {
    if (Object.hasOwn(value, key)) {
      assertMatchesSchema(defs, schema, value[key], `${defName}.${key}`);
    }
  }
}

function readJson(relPath) {
  return JSON.parse(read(relPath));
}

function validateJsonSchema(schema, value, root = schema) {
  const errors = [];

  function resolveRef(ref) {
    const parts = ref.replace(/^#\//, "").split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
    return parts.reduce((current, part) => current?.[part], root);
  }

  function typeMatches(type, data) {
    if (type === "null") return data === null;
    if (type === "array") return Array.isArray(data);
    if (type === "object") return data !== null && typeof data === "object" && !Array.isArray(data);
    if (type === "integer") return Number.isInteger(data);
    return typeof data === type;
  }

  function datePartsMatch(year, month, day) {
    const parsed = new Date(Date.UTC(year, month - 1, day));
    parsed.setUTCFullYear(year);
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }

  function formatMatches(format, data) {
    if (format === "uuid") {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data);
    }

    if (format === "date-time") {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(data);
      if (!match) return false;

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = Number(match[6]);
      const offsetHour = match[8] === undefined ? null : Number(match[8]);
      const offsetMinute = match[9] === undefined ? null : Number(match[9]);

      return (
        datePartsMatch(year, month, day) &&
        hour <= 23 &&
        minute <= 59 &&
        second <= 59 &&
        (offsetHour === null || (offsetHour <= 23 && offsetMinute <= 59))
      );
    }

    if (format === "date") {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
      if (!match) return false;

      const [, year, month, day] = match.map(Number);
      return datePartsMatch(year, month, day);
    }

    return true;
  }

  function check(node, data, currentPath = "$") {
    const localErrors = [];
    const fail = (message) => localErrors.push(`${currentPath}: ${message}`);

    if (node.$ref) {
      return check(resolveRef(node.$ref), data, currentPath);
    }

    if (node.allOf) {
      for (const child of node.allOf) {
        localErrors.push(...check(child, data, currentPath));
      }
    }

    if (node.if && check(node.if, data, currentPath).length === 0 && node.then) {
      localErrors.push(...check(node.then, data, currentPath));
    }

    if (node.anyOf) {
      const validCount = node.anyOf.filter((child) => check(child, data, currentPath).length === 0).length;
      if (validCount === 0) fail("must match at least one anyOf schema");
    }

    if (node.oneOf) {
      const validCount = node.oneOf.filter((child) => check(child, data, currentPath).length === 0).length;
      if (validCount !== 1) fail(`must match exactly one oneOf schema, matched ${validCount}`);
    }

    if (node.const !== undefined && data !== node.const) {
      fail(`must equal ${JSON.stringify(node.const)}`);
    }

    if (node.enum && !node.enum.includes(data)) {
      fail(`must be one of ${JSON.stringify(node.enum)}`);
    }

    if (node.type) {
      const allowedTypes = Array.isArray(node.type) ? node.type : [node.type];
      if (!allowedTypes.some((type) => typeMatches(type, data))) {
        fail(`must be type ${allowedTypes.join(" or ")}`);
      }
    }

    if (typeMatches("object", data)) {
      if (node.required) {
        for (const key of node.required) {
          if (!Object.hasOwn(data, key)) {
            fail(`missing required property ${key}`);
          }
        }
      }

      if (node.additionalProperties === false && node.properties) {
        for (const key of Object.keys(data)) {
          if (!Object.hasOwn(node.properties, key)) {
            fail(`unexpected property ${key}`);
          }
        }
      }

      if (node.properties) {
        for (const [key, child] of Object.entries(node.properties)) {
          if (Object.hasOwn(data, key)) {
            localErrors.push(...check(child, data[key], `${currentPath}.${key}`));
          }
        }
      }
    }

    if (Array.isArray(data) && node.items) {
      data.forEach((item, index) => {
        localErrors.push(...check(node.items, item, `${currentPath}[${index}]`));
      });
    }

    if (typeof data === "string" && node.minLength !== undefined && data.length < node.minLength) {
      fail(`must have length >= ${node.minLength}`);
    }

    if (typeof data === "string" && node.format && !formatMatches(node.format, data)) {
      fail(`must match format ${node.format}`);
    }

    if (typeof data === "string" && node.pattern && !new RegExp(node.pattern).test(data)) {
      fail(`must match pattern ${node.pattern}`);
    }

    if (typeof data === "number" && node.minimum !== undefined && data < node.minimum) {
      fail(`must be >= ${node.minimum}`);
    }

    if (typeof data === "number" && node.maximum !== undefined && data > node.maximum) {
      fail(`must be <= ${node.maximum}`);
    }

    return localErrors;
  }

  errors.push(...check(schema, value));
  return {
    valid: errors.length === 0,
    errors,
  };
}

describe("agent bootstrap docs", () => {
  it("agent.md points agents to the contract docs and schemas", () => {
    const content = read("agent.md");
    assert.match(content, /docs\/contracts\/README\.md/);
    assert.match(content, /docs\/contracts\/interface-contract-guide\.md/);
    assert.match(content, /docs\/contracts\/schemas\/pilo-public-contracts\.schema\.json/);
  });

  it("agent.md uses real owner names", () => {
    const content = read("agent.md");
    for (const name of ["동현", "주형", "진호", "은재", "세인"]) {
      assert.match(content, new RegExp(`${name}:`));
    }
  });

  it("uses agent.md as the single bootstrap filename", () => {
    assert.ok(exists("agent.md"));
    assert.equal(exists("AGENTS.md"), false, "AGENTS.md must not become a second bootstrap source");
    for (const file of ["agent.md", "docs/README.md", "docs/agents/README.md", "docs/contracts/README.md"]) {
      const content = read(file);
      assert.match(content, /agent\.md/);
      assert.match(content, /AGENTS\.md/);
    }
  });
});

describe("contract document set", () => {
  const requiredContracts = [
    "docs/contracts/README.md",
    "docs/contracts/auth.md",
    "docs/contracts/workspace.md",
    "docs/contracts/canvas.md",
    "docs/contracts/task.md",
    "docs/contracts/github.md",
    "docs/contracts/progress.md",
    "docs/contracts/meeting.md",
    "docs/contracts/review.md",
    "docs/contracts/agent-actions.md",
    "docs/contracts/planning.md",
    "docs/contracts/common-system.md",
    "docs/contracts/contract-change-rules.md",
    "docs/contracts/interface-contract-guide.md",
  ];

  for (const file of requiredContracts) {
    it(`${file} exists`, () => {
      assert.ok(exists(file), `${file} must exist`);
      assert.ok(read(file).length > 0, `${file} must not be empty`);
    });
  }

  it("contract index maps every owner to their contract files", () => {
    const content = read("docs/contracts/README.md");
    for (const token of ["동현", "주형", "진호", "은재", "세인", "workspace.md", "canvas.md", "task.md", "review.md", "agent-actions.md"]) {
      assert.match(content, new RegExp(token.replace(".", "\\.")));
    }
  });

  it("interface guide defines owner/consumer handling for overlapping features", () => {
    const content = read("docs/contracts/interface-contract-guide.md");
    for (const token of ["원본 owner", "Canvas 카드", "Meeting Action Item", "Task -> PR -> Review", "mock", "Agent Action"]) {
      assert.match(content, new RegExp(token.replace("->", "->")));
    }
  });
  it("contract index defines the active status vocabulary", () => {
    const content = read("docs/contracts/README.md");
    for (const token of ["Current Runtime APIs", "Deferred APIs", "MVP Target APIs"]) {
      assert.match(content, new RegExp(token));
    }
  });

  it("current contract docs do not use stale status labels or branch wording", () => {
    const checkedDocs = [
      ...requiredContracts,
      "docs/mvp-contract-v0.md",
      "docs/api-contract-v1.md",
    ];

    for (const file of checkedDocs) {
      const content = read(file);
      assert.doesNotMatch(content, /origin\/dev/, `${file} must not point agents at origin/dev`);
      assert.doesNotMatch(content, /## Provided APIs/, `${file} must use Current Runtime APIs or Deferred APIs`);
      assert.doesNotMatch(content, /## Planned APIs/, `${file} must use Deferred APIs`);
      assert.doesNotMatch(content, /Planned \/ Deferred APIs/, `${file} must use Deferred APIs`);
      assert.doesNotMatch(content, /Task draft HTTP API/, `${file} must not describe implemented task drafts as missing`);
      assert.doesNotMatch(
        content,
        /`(?:GET|POST|PATCH|PUT|DELETE) \/(?!api\/)(auth|workspaces|workspace-invites|canvas-boards|canvas-shapes|canvas-connections|pull-requests|code-review-rooms|pull-request-analyses|review-nodes|github\/app|repositories|tasks|milestones)\b/,
        `${file} must expose current and target public routes with /api prefix`,
      );
    }
  });

  it("contract docs keep current runtime APIs separate from deferred MVP targets", () => {
    const task = read("docs/contracts/task.md");
    assert.match(task, /`POST`\s*\|\s*`\/api\/workspaces\/:workspaceId\/task-drafts`/);
    assert.match(task, /`POST`\s*\|\s*`\/api\/task-drafts\/:draftId\/approve`/);
    assert.match(task, /## Deferred APIs/);

    const taskDeferred = task.slice(task.indexOf("## Deferred APIs"));
    assert.doesNotMatch(taskDeferred, /`POST`\s*\|\s*`\/api\/workspaces\/:workspaceId\/task-drafts`/);
    assert.match(taskDeferred, /`GET`\s*\|\s*`\/api\/workspaces\/:workspaceId\/task-drafts`/);

    const review = read("docs/contracts/review.md");
    assert.match(review, /`GET`\s*\|\s*`\/api\/pull-request-analyses\/:analysisId\/graph`/);
    assert.match(review, /`GET`\s*\|\s*`\/api\/pull-request-analyses\/:analysisId\/canvas`/);
    assert.match(review, /`POST`\s*\|\s*`\/api\/code-review-rooms\/:roomId\/comments`/);

    const agent = read("docs/contracts/agent-actions.md");
    assert.match(agent, /Current Runtime APIs/);
    assert.match(agent, /Agent run\/action HTTP controller/);
    assert.match(agent, /`POST`\s*\|\s*`\/api\/workspaces\/:workspaceId\/agent-runs`/);
    assert.doesNotMatch(agent, /`POST \/agent-runs`/);

    const planning = read("docs/contracts/planning.md");
    assert.match(planning, /Current Runtime APIs/);
    assert.match(planning, /Planning HTTP controller/);
    assert.match(planning, /`POST`\s*\|\s*`\/api\/workspaces\/:workspaceId\/project-plan-drafts`/);
    assert.doesNotMatch(planning, /`GET \/project-plan-drafts/);
  });

  it("rebaseline docs use TaskDraft and Canvas shapes/connections as canonical terms", () => {
    const checkedDocs = [
      "docs/api-contract-v1.md",
      "docs/domain-boundary-v1.md",
      "docs/contracts/task.md",
      "docs/contracts/canvas.md",
      "docs/contracts/interface-contract-guide.md",
    ];

    for (const file of checkedDocs) {
      const content = read(file);
      assert.doesNotMatch(content, /task-candidates/, `${file} must not expose task-candidates`);
      assert.doesNotMatch(content, /\/api\/canvas-(?:nodes|edges)\b/, `${file} must not expose canvas nodes/edges routes`);
      assert.doesNotMatch(content, /\/api\/canvas-boards\/:boardId\/(?:nodes|edges)\b/, `${file} must not expose canvas board nodes/edges routes`);
    }

    assert.match(read("docs/contracts/task.md"), /TaskDraft/);
    assert.match(read("docs/contracts/task.md"), /TaskDraftSourceType|sourceType/);
    assert.match(read("docs/contracts/canvas.md"), /CanvasBoardDetail\.shapes/);
    assert.match(read("docs/contracts/canvas.md"), /CanvasBoardDetail\.connections/);
  });

  it("contract rules require explicit mock, in-memory, deferred, and shared-file handling", () => {
    for (const file of [
      "docs/contracts/README.md",
      "docs/contracts/contract-change-rules.md",
      "docs/contracts/fixtures/README.md",
      "docs/agents/shared-implementation-rules.md",
    ]) {
      const content = read(file);
      assert.match(content, /mock/i, `${file} must mention mock handling`);
      assert.match(content, /Deferred API|Deferred APIs|Deferred/i, `${file} must mention deferred handling`);
    }

    assert.match(read("docs/agents/shared-implementation-rules.md"), /shared\/common 파일 변경은 기능 구현 PR에 섞지 않는다/);
    assert.match(read("docs/contracts/fixtures/README.md"), /additionalProperties: false/);
  });

  it("boundary docs define access guards, progress math, and SQL versus Prisma runtime scope", () => {
    const boundary = read("docs/domain-boundary-v1.md");
    const progress = read("docs/contracts/progress.md");
    const task = read("docs/contracts/task.md");
    const github = read("docs/contracts/github.md");
    const docsIndex = read("docs/README.md");

    for (const token of ["auth_sessions", "workspace_members", "Task access", "GitHub repository/issue/PR access"]) {
      assert.match(boundary, new RegExp(token));
    }
    assert.match(boundary, /SQL baseline/);
    assert.match(boundary, /Prisma-backed runtime subset/);
    assert.match(docsIndex, /SQL baseline/);
    assert.match(docsIndex, /Prisma-backed runtime subset/);
    assert.match(task, /workspace_members\.id/);
    assert.match(github, /GitHub login OAuth is not sufficient for repository access/);
    for (const token of ["totalTasks", "doneTasks", "blockedTasks", "reviewTasks", "delayedTasks", "progressRate"]) {
      assert.match(progress, new RegExp(token));
    }
    assert.match(progress, /doneTasks \/ totalTasks/);
  });

  it("api contract is target-only where it differs from current runtime contracts", () => {
    const apiContract = read("docs/api-contract-v1.md");

    for (const label of ["Current", "Deferred", "Target", "Excluded"]) {
      assert.match(apiContract, new RegExp(`\\\`${label}\\\``));
    }

    assert.match(apiContract, /Target/);
    assert.match(apiContract, /docs\/contracts\/\*/);
    assert.match(apiContract, /Current Runtime APIs/);
  });

  it("agent docs use the current AgentAction workflow and status vocabulary", () => {
    const checkedDocs = [
      "docs/api-contract-v1.md",
      "docs/contracts/agent-actions.md",
      "docs/agents/sein-agent-planning.md",
    ];

    for (const file of checkedDocs) {
      const content = read(file);
      assert.doesNotMatch(content, /task_suggestion/, `${file} must not expose the legacy task_suggestion workflow`);
      assert.doesNotMatch(content, /create_task/, `${file} must not expose the legacy create_task action type`);
      assert.doesNotMatch(content, /requires_approval/, `${file} must not expose the legacy requires_approval status`);
      assert.match(content, /task\.create\.draft/, `${file} must use task.create.draft`);
      assert.match(content, /meeting\.report\.generate/, `${file} must use meeting.report.generate`);
      assert.match(content, /waiting_confirmation|requires_confirmation/, `${file} must use the current confirmation vocabulary`);
    }
  });

  it("github current and deferred API paths use the canonical contract split", () => {
    const apiContract = read("docs/api-contract-v1.md");
    const githubContract = read("docs/contracts/github.md");
    const boundary = read("docs/domain-boundary-v1.md");

    for (const oldPathPattern of [
      /\/api\/workspaces\/:workspaceId\/github\/sync(?:`|\s|\||$)/,
      /\/api\/workspaces\/:workspaceId\/github\/issues(?:`|\s|\||$)/,
      /\/api\/github\/pull-requests\/:pullRequestId(?:`|\s|\||$)/,
      /\/api\/tasks\/:taskId\/github-issue(?:`|\s|\||$)/,
    ]) {
      assert.doesNotMatch(apiContract, oldPathPattern, `api contract must not expose old GitHub path ${oldPathPattern}`);
    }

    for (const canonicalPath of [
      "/api/workspaces/:workspaceId/github/connections",
      "/api/workspaces/:workspaceId/github/repositories",
      "/api/workspaces/:workspaceId/github/repositories/sync",
      "/api/repositories/:repositoryId/issues",
      "/api/repositories/:repositoryId/pull-requests",
      "/api/pull-requests/:pullRequestId/changed-files",
      "/api/tasks/:taskId/github-issues",
    ]) {
      assert.ok(apiContract.includes(canonicalPath), `api contract must include ${canonicalPath}`);
    }

    assert.match(githubContract, /Current runtime connection APIs require Workspace membership/);
    assert.match(githubContract, /Owner-only/);
    assert.match(boundary, /Current GitHub connection runtime APIs require Workspace membership/);
    assert.match(boundary, /Owner-only/);
  });

  it("meeting and voice docs do not present legacy paths as current APIs", () => {
    const docs = [
      "docs/api-contract-v1.md",
      "docs/contracts/meeting.md",
      "docs/contracts/voice.md",
      "docs/agents/jinho-meeting-report.md",
    ];

    for (const file of docs) {
      const content = read(file);
      for (const oldPath of [
        "/api/meetings/:meetingId/notes",
        "/api/meetings/:meetingId/voice-sessions/start",
        "/api/meetings/:meetingId/report-draft",
        "/api/reports/:reportId/confirm",
        "/api/action-items/:actionItemId/convert-to-task",
      ]) {
        assert.equal(content.includes(oldPath), false, `${file} must not expose old Meeting/Voice path ${oldPath}`);
      }
    }

    const apiContract = read("docs/api-contract-v1.md");
    assert.ok(apiContract.includes("/api/meetings/:meetingId/memos"));
    assert.ok(apiContract.includes("/api/meetings/:meetingId/report-generation"));
    assert.ok(apiContract.includes("/api/workspaces/:workspaceId/meetings/:meetingId/voice-room"));
    assert.match(apiContract, /MeetingStatus = "scheduled" \| "in_progress" \| "ended" \| "report_generated"/);
    assert.match(apiContract, /recordingStatus/);
  });

  it("task enum and MVP target-only fields stay aligned across scope, API, schema, and SQL", () => {
    const mvpScope = read("docs/mvp-scope-v1.md");
    const apiContract = read("docs/api-contract-v1.md");
    const taskContract = read("docs/contracts/task.md");
    const schema = readJson("docs/contracts/schemas/pilo-public-contracts.schema.json");
    const sql = read("docs/db/pilo_erd_schema.sql");

    assert.match(mvpScope, /`todo`, `in_progress`, `in_review`, `done`, `blocked`/);
    assert.match(mvpScope, /`low`, `medium`, `high`, `urgent`/);
    assert.doesNotMatch(mvpScope, /`todo`, `in_progress`, `review`, `done`, `blocked`/);

    assert.match(apiContract, /type TaskStatus = "todo" \| "in_progress" \| "in_review" \| "done" \| "blocked"/);
    assert.match(apiContract, /type TaskPriority = "low" \| "medium" \| "high" \| "urgent"/);
    assert.deepEqual(schema.$defs.TaskSummary.properties.status.enum, ["todo", "in_progress", "in_review", "done", "blocked"]);
    assert.deepEqual(schema.$defs.TaskSummary.properties.priority.enum, ["low", "medium", "high", "urgent"]);
    assert.match(sql, /status IN \('todo', 'in_progress', 'in_review', 'done', 'blocked'\)/);
    assert.match(sql, /priority IN \('low', 'medium', 'high', 'urgent'\)/);

    assert.ok(mvpScope.includes("`taskType`"));
    assert.ok(mvpScope.includes("`acceptanceCriteria`"));
    assert.ok(taskContract.includes("MVP Target fields `taskType` and `acceptanceCriteria`"));
    assert.ok(apiContract.includes("`taskType` and `acceptanceCriteria` are MVP Target fields"));
  });

  it("workspace Canvas current APIs use shapes/connections, not nodes/edges", () => {
    const canvas = read("docs/contracts/canvas.md");
    const currentApis = canvas.slice(
      canvas.indexOf("## Current Runtime APIs"),
      canvas.indexOf("## Terminology"),
    );
    const mvpScope = read("docs/mvp-scope-v1.md");

    assert.match(currentApis, /\/api\/canvas-boards\/:boardId\/shapes/);
    assert.match(currentApis, /\/api\/canvas-boards\/:boardId\/connections/);
    assert.doesNotMatch(currentApis, /\/(?:nodes|edges)\b/);
    assert.match(canvas, /nodes` and `edges` are deprecated for the workspace Canvas contract/);
    assert.match(mvpScope, /Workspace Canvas current runtime.*`shapes`\/`connections`/);
  });

  it("juhyung owner brief points to the actual current module path", () => {
    const brief = read("docs/agents/juhyung-task-github-progress.md");
    const suggestedPathLines = brief
      .split(/\r?\n/)
      .filter((line) => /^- (App Server|Public adapters):/.test(line))
      .join("\n");

    assert.match(suggestedPathLines, /apps\/app-server\/src\/modules\/juhyung/);
    assert.doesNotMatch(suggestedPathLines, /apps\/app-server\/src\/modules\/(?:task|github|progress)/);
    assert.match(brief, /future refactor targets only/);
    assert.match(brief, /Progress is an MVP Target read model, not Current Runtime/);
  });
});

describe("independent agent briefs", () => {
  const requiredBriefs = [
    "docs/agents/README.md",
    "docs/agents/shared-implementation-rules.md",
    "docs/agents/donghyun-auth-workspace-canvas.md",
    "docs/agents/juhyung-task-github-progress.md",
    "docs/agents/jinho-meeting-report.md",
    "docs/agents/eunjae-pr-review.md",
    "docs/agents/sein-agent-planning.md",
  ];

  for (const file of requiredBriefs) {
    it(`${file} exists and defines implementation boundaries`, () => {
      const content = read(file);
      assert.ok(content.length > 0, `${file} must not be empty`);
      assert.match(content, /docs\/contracts|Mission|Shared Implementation Rules|Independent Agent Briefs/);
    });
  }

  it("domain agent briefs separate Current Runtime APIs and Deferred APIs with /api public paths", () => {
    const domainBriefs = requiredBriefs.filter((file) => !file.endsWith("README.md") && !file.endsWith("shared-implementation-rules.md"));

    for (const file of domainBriefs) {
      const content = read(file);
      assert.match(content, /## Current Runtime APIs/, `${file} must list Current Runtime APIs`);
      assert.match(content, /## Deferred APIs/, `${file} must list Deferred APIs`);
      assert.doesNotMatch(
        content,
        /`(?:GET|POST|PATCH|PUT|DELETE) \/(?!api\/)(auth|workspaces|workspace-invites|canvas-boards|canvas-shapes|canvas-connections|pull-requests|code-review-rooms|pull-request-analyses|review-nodes|github\/app|repositories|tasks|milestones|agent-runs|agent-actions|project-plan-drafts|meetings|voice)\b/,
        `${file} must use public /api paths`,
      );
    }
  });

  it("agent docs are linked from the bootstrap and collaboration docs", () => {
    assert.match(read("agent.md"), /docs\/agents\/README\.md/);
    assert.match(read("docs/collaboration-v1.md"), /docs\/agents\/README\.md/);
    assert.match(read("docs/contracts/README.md"), /docs\/agents\/README\.md/);
  });

  it("collaboration guide does not point to deprecated domain paths or missing contract docs", () => {
    const content = read("docs/collaboration-v1.md");
    assert.doesNotMatch(content, /docs\/contracts\/agent\.md/);
    assert.doesNotMatch(content, /apps\/frontend\/src\/domains/);
    assert.doesNotMatch(content, /apps\/app-server\/src\/domains/);
    assert.doesNotMatch(content, /apps\/ai-worker\/app\/domains/);
  });

  it("collaboration guide has no trailing whitespace", () => {
    const lines = read("docs/collaboration-v1.md").split(/\r?\n/);
    lines.forEach((line, index) => {
      assert.doesNotMatch(line, /[ \t]+$/, `docs/collaboration-v1.md:${index + 1} has trailing whitespace`);
    });
  });

  it("current bootstrap docs do not point agents at archived legacy planning docs", () => {
    const currentDocs = [
      "agent.md",
      ".coderabbit.yaml",
      "docs/README.md",
      "docs/collaboration-v1.md",
      "docs/contracts/README.md",
      "docs/agents/README.md",
    ];

    for (const file of currentDocs) {
      const content = read(file);
      assert.doesNotMatch(content, /docs\/agent-collaboration-guide\.md/);
      assert.doesNotMatch(content, /docs\/PILO_5인_분업_상세_명세\.md/);
    }
  });

  it("archive docs are explicitly historical and not implementation sources", () => {
    assert.match(read("docs/README.md"), /docs\/archive\/\*\*/);
    assert.match(read("docs/archive/README.md"), /구현 기준이 아니다/);
  });
});

describe("machine-readable public contract schema", () => {
  const schemaPath = "docs/contracts/schemas/pilo-public-contracts.schema.json";

  it("schema file exists and parses as JSON", () => {
    assert.ok(exists(schemaPath));
    const schema = JSON.parse(read(schemaPath));
    assert.equal(schema.title, "PILO Public Contracts");
  });

  it("schema defines all core read models and action payloads", () => {
    const schema = JSON.parse(read(schemaPath));
    const defs = schema.$defs;
    for (const name of [
      "CurrentUser",
      "WorkspaceSummary",
      "WorkspaceMemberSummary",
      "TaskSummary",
      "TaskDraftSourceType",
      "TaskDraft",
      "TaskCreateDraft",
      "TaskStatusUpdateAction",
      "MilestoneSummary",
      "ProgressSummary",
      "ProgressSnapshotSummary",
      "GithubConnectionSummary",
      "GithubRepositorySummary",
      "GithubIssueSummary",
      "GithubIssueCreateAction",
      "PullRequestSummary",
      "PullRequestChangedFileSummary",
      "MeetingReportGenerateAction",
      "ReviewAnalysisGenerateAction",
      "PlanningApproveAction",
      "ProjectPlanDraftSummary",
      "ProjectPlanDraftDetail",
      "ProjectPlanTechStackRecommendation",
      "ProjectPlanFeatureDraft",
      "ProjectPlanRoleDraft",
      "ProjectPlanMilestoneDraft",
      "ProjectPlanRiskNote",
      "ProjectPlanFirstAgendaDraft",
      "ProjectPlanApprovalState",
      "PlanningOwnerApiResult",
      "MeetingReportSummary",
      "MeetingActionItem",
      "CodeReviewRoomSummary",
      "PRAnalysisSummary",
      "ReviewCanvasSummary",
      "ReviewCanvasNode",
      "ReviewCanvasEdge",
      "ReviewNodeDetail",
      "ReviewChangeGroup",
      "ReviewDiffHunk",
      "ReviewNodeSummary",
      "ReviewRiskSummary",
      "CanvasEntityRef",
      "AgentRecommendation",
      "CanvasConnectionType",
      "AgentRunCreateRequest",
      "AgentRunStatusResponse",
      "AgentRunDetail",
      "AgentRunStepDetail",
      "AgentTraceEntry",
      "AgentAction",
      "AgentJobMessage",
      "AgentResultMessage",
      "NotificationCreateRequest",
      "SharedFileRef",
    ]) {
      assert.ok(defs[name], `schema must define ${name}`);
    }
  });

  it("schema defines planning detail sections and approval result boundaries", () => {
    const schema = JSON.parse(read(schemaPath));
    const detail = schema.$defs.ProjectPlanDraftDetail;
    const approval = schema.$defs.ProjectPlanApprovalState;
    const ownerResult = schema.$defs.PlanningOwnerApiResult;

    for (const key of ["techStack", "featureDrafts", "roleDrafts", "milestoneDrafts", "riskNotes", "firstAgendaDraft", "approval"]) {
      assert.ok(detail.required.includes(key), `ProjectPlanDraftDetail must require ${key}`);
    }

    assert.equal(detail.properties.approval.$ref, "#/$defs/ProjectPlanApprovalState");
    assert.equal(detail.properties.featureDrafts.items.$ref, "#/$defs/ProjectPlanFeatureDraft");
    assert.equal(detail.properties.milestoneDrafts.items.$ref, "#/$defs/ProjectPlanMilestoneDraft");
    assert.deepEqual(schema.$defs.ProjectPlanDraftStatus.enum, ["draft", "reviewing", "approved", "rejected"]);
    assert.deepEqual(approval.properties.status.$ref, "#/$defs/PlanningApprovalStatus");
    assert.equal(approval.properties.ownerApiResults.items.$ref, "#/$defs/PlanningOwnerApiResult");
    assert.deepEqual(ownerResult.properties.operation.enum, ["task.create", "milestone.create"]);
    assert.deepEqual(ownerResult.properties.sourceDraftType.enum, ["feature", "milestone"]);
    assert.deepEqual(ownerResult.properties.status.enum, ["not_requested", "pending", "succeeded", "failed", "skipped"]);
  });

  it("schema aligns TaskDraft vocabulary and task enums with runtime and DB", () => {
    const schema = readJson(schemaPath);
    const uuid = "00000000-0000-4000-8000-000000000001";
    const taskCreateDraft = schema.$defs.TaskCreateDraft;

    assert.deepEqual(schema.$defs.TaskDraftSourceType.enum, [
      "meeting_action_item",
      "planning_feature",
      "agent_recommendation",
      "manual",
    ]);
    assert.deepEqual(schema.$defs.TaskDraft.properties.status.enum, ["draft", "approved", "rejected"]);
    assert.deepEqual(schema.$defs.TaskDraftSummary.properties.status.enum, ["draft", "approved", "rejected"]);
    assert.deepEqual(schema.$defs.TaskSummary.properties.status.enum, ["todo", "in_progress", "in_review", "done", "blocked"]);
    assert.deepEqual(schema.$defs.TaskSummary.properties.priority.enum, ["low", "medium", "high", "urgent"]);
    assert.equal(validateJsonSchema(taskCreateDraft, { workspaceId: uuid, title: "OAuth callback" }, schema).valid, true);
    assert.equal(
      validateJsonSchema(taskCreateDraft, { workspaceId: uuid, title: "OAuth callback", sourceType: "planning_feature", sourceId: uuid }, schema).valid,
      true,
    );
    assert.equal(
      validateJsonSchema(taskCreateDraft, { workspaceId: uuid, title: "OAuth callback", sourceType: "planning_feature" }, schema).valid,
      false,
    );
    assert.equal(
      validateJsonSchema(taskCreateDraft, { workspaceId: uuid, title: "OAuth callback", sourceType: "legacy_candidate", sourceId: uuid }, schema).valid,
      false,
    );
  });

  it("schema and docs define AgentRecommendation as a deferred read model", () => {
    const schema = readJson(schemaPath);
    const recommendation = schema.$defs.AgentRecommendation;
    const contract = read("docs/contracts/agent-actions.md");

    assert.ok(recommendation.required.includes("owner"));
    assert.deepEqual(recommendation.properties.owner.enum, ["agent_runtime"]);
    assert.deepEqual(recommendation.properties.status.enum, ["draft", "waiting_confirmation", "confirmed", "executed", "rejected", "failed"]);
    assert.match(contract, /AgentRecommendation Read Model/);
    assert.match(contract, /Current Runtime APIs: none/);
    assert.match(contract, /Deferred APIs: `GET \/api\/workspaces\/:workspaceId\/agent-recommendations`/);
    assert.match(contract, /Dashboard/);
    assert.match(contract, /Canvas/);
  });

  it("validates ProjectPlanApprovalState state timestamp constraints", () => {
    const schema = readJson(schemaPath);
    const approval = schema.$defs.ProjectPlanApprovalState;
    const uuid = "00000000-0000-4000-8000-000000000001";
    const dateTime = "2026-06-27T10:00:00.000Z";
    const base = {
      status: "not_requested",
      actionId: null,
      requestedAt: null,
      confirmedAt: null,
      executedAt: null,
      ownerApiResults: [],
    };

    assert.equal(validateJsonSchema(approval, base, schema).valid, true);
    assert.equal(validateJsonSchema(approval, { ...base, status: "not_requested", actionId: uuid }, schema).valid, false);
    assert.equal(validateJsonSchema(approval, { ...base, status: "waiting_confirmation", actionId: uuid, requestedAt: dateTime }, schema).valid, true);
    assert.equal(
      validateJsonSchema(approval, { ...base, status: "waiting_confirmation", actionId: uuid, requestedAt: dateTime, confirmedAt: dateTime }, schema).valid,
      false,
    );
    assert.equal(
      validateJsonSchema(approval, { ...base, status: "confirmed", actionId: uuid, requestedAt: dateTime, confirmedAt: dateTime }, schema).valid,
      true,
    );
    assert.equal(
      validateJsonSchema(approval, { ...base, status: "executed", actionId: uuid, requestedAt: dateTime, confirmedAt: dateTime, executedAt: dateTime }, schema).valid,
      true,
    );
    assert.equal(
      validateJsonSchema(approval, { ...base, status: "executed", actionId: uuid, requestedAt: dateTime, confirmedAt: dateTime, executedAt: null }, schema).valid,
      false,
    );
    assert.equal(validateJsonSchema(approval, { ...base, status: "rejected", actionId: uuid, requestedAt: dateTime }, schema).valid, true);
    assert.equal(
      validateJsonSchema(approval, { ...base, status: "rejected", actionId: uuid, requestedAt: dateTime, executedAt: dateTime }, schema).valid,
      false,
    );
  });

  it("validates PlanningOwnerApiResult state and source coupling", () => {
    const schema = readJson(schemaPath);
    const ownerResult = schema.$defs.PlanningOwnerApiResult;
    const uuid = "00000000-0000-4000-8000-000000000001";
    const targetId = "00000000-0000-4000-8000-000000000002";
    const baseResult = {
      owner: "task",
      operation: "task.create",
      sourceDraftType: "feature",
      sourceDraftId: uuid,
      status: "succeeded",
      targetEntityId: targetId,
      errorMessage: null,
    };

    assert.equal(validateJsonSchema(ownerResult, baseResult, schema).valid, true);
    assert.equal(validateJsonSchema(ownerResult, { ...baseResult, targetEntityId: null }, schema).valid, false);
    assert.equal(validateJsonSchema(ownerResult, { ...baseResult, errorMessage: "unexpected" }, schema).valid, false);
    assert.equal(validateJsonSchema(ownerResult, { ...baseResult, status: "failed", targetEntityId: null, errorMessage: "Task API failed" }, schema).valid, true);
    assert.equal(validateJsonSchema(ownerResult, { ...baseResult, status: "failed", errorMessage: "Task API failed" }, schema).valid, false);
    assert.equal(validateJsonSchema(ownerResult, { ...baseResult, status: "failed", targetEntityId: null, errorMessage: null }, schema).valid, false);
    assert.equal(validateJsonSchema(ownerResult, { ...baseResult, status: "failed", targetEntityId: null, errorMessage: "" }, schema).valid, false);

    for (const status of ["not_requested", "pending", "skipped"]) {
      assert.equal(validateJsonSchema(ownerResult, { ...baseResult, status, targetEntityId: null }, schema).valid, true);
      assert.equal(validateJsonSchema(ownerResult, { ...baseResult, status, targetEntityId: targetId }, schema).valid, false);
    }

    assert.equal(validateJsonSchema(ownerResult, { ...baseResult, operation: "task.create", sourceDraftType: "milestone" }, schema).valid, false);
    assert.equal(
      validateJsonSchema(ownerResult, { ...baseResult, operation: "milestone.create", sourceDraftType: "feature" }, schema).valid,
      false,
    );
    assert.equal(
      validateJsonSchema(ownerResult, { ...baseResult, operation: "milestone.create", sourceDraftType: "milestone" }, schema).valid,
      true,
    );
  });

  it("agent action schema binds every supported action type to a concrete payload schema", () => {
    const schema = JSON.parse(read(schemaPath));
    const agentAction = schema.$defs.AgentAction;

    function payloadRefFor(actionType) {
      const actionVariant = agentAction.oneOf.find((entry) => {
        return entry.allOf?.some((child) => child.properties?.type?.const === actionType);
      });
      const typedSchema = actionVariant?.allOf.find((child) => child.properties?.payload?.$ref);

      return typedSchema?.properties?.payload?.$ref;
    }

    const expectedPayloadRefs = new Map([
      ["task.create.draft", "#/$defs/TaskCreateDraft"],
      ["task.update.status", "#/$defs/TaskStatusUpdateAction"],
      ["github.issue.create", "#/$defs/GithubIssueCreateAction"],
      ["meeting.report.generate", "#/$defs/MeetingReportGenerateAction"],
      ["review.analysis.generate", "#/$defs/ReviewAnalysisGenerateAction"],
      ["planning.approve", "#/$defs/PlanningApproveAction"],
    ]);

    assert.deepEqual(schema.$defs.AgentActionCommon.properties.type.enum.toSorted(), [...expectedPayloadRefs.keys()].sort());
    for (const [actionType, expectedRef] of expectedPayloadRefs) {
      assert.equal(payloadRefFor(actionType), expectedRef);
    }
    assert.equal(agentAction.oneOf.length, expectedPayloadRefs.size);
    assert.deepEqual(schema.$defs.AgentActionCommon.required, [
      "id",
      "runId",
      "type",
      "source",
      "requiresConfirmation",
      "payload",
      "status",
      "confirmedByMemberId",
      "confirmedAt",
      "executedAt",
    ]);
    assert.equal(schema.$defs.AgentActionCommon.additionalProperties, false);
  });

  it("github contract exposes pull request changed file source for review consumers", () => {
    const schema = JSON.parse(read(schemaPath));
    const githubContract = read("docs/contracts/github.md");
    const reviewContract = read("docs/contracts/review.md");
    const juhyungBrief = read("docs/agents/juhyung-task-github-progress.md");
    const changedFileSummary = schema.$defs.PullRequestChangedFileSummary;
    const breakingChangePolicy = githubContract.slice(githubContract.indexOf("## Breaking Change Policy"));

    assert.ok(changedFileSummary);
    for (const field of [
      "pullRequestId",
      "path",
      "status",
      "additions",
      "deletions",
      "changes",
      "patch",
      "sha",
      "sourceSyncedAt",
    ]) {
      assert.ok(changedFileSummary.required.includes(field));
    }
    assert.equal(changedFileSummary.additionalProperties, false);
    assert.equal(changedFileSummary.properties.path.type, "string");
    assert.equal(changedFileSummary.properties.path.minLength, 1);
    assert.equal(changedFileSummary.properties.sha.type, "string");
    assert.equal(changedFileSummary.properties.sha.minLength, 1);
    assert.match(githubContract, /PullRequestChangedFileSummary/);
    assert.match(githubContract, /\/pull-requests\/:pullRequestId\/changed-files/);
    assert.match(githubContract, /patch/);
    assert.match(githubContract, /state\/nonce/);
    assert.match(githubContract, /installationId -> workspaceId/);
    assert.match(githubContract, /409 Conflict/);
    assert.match(githubContract, /active GitHub App connection/);
    assert.match(githubContract, /changed_functions/);
    assert.match(githubContract, /non-null `patch`/);
    assert.match(githubContract, /patch: null/);
    assert.match(githubContract, /pullRequestId \+ path \+ sha/);
    assert.match(githubContract, /## Provided Read Models/);
    assert.match(githubContract, /## Consumed By/);
    assert.match(githubContract, /## Breaking Change Policy/);
    assert.match(githubContract, /additive optional rollout fields/);
    assert.match(githubContract, /Making them required requires a separate breaking contract PR/);
    const mockRuleStart = githubContract.indexOf("## Mock Rule");
    assert.notEqual(
      mockRuleStart,
      -1,
      "github contract must keep a ## Mock Rule section",
    );
    assert.doesNotMatch(
      githubContract.slice(mockRuleStart),
      /github-repositories\.fixture\.json/,
    );
    for (const model of [
      "GithubConnectionSummary",
      "GithubRepositorySummary",
      "PullRequestSummary",
      "PullRequestChangedFileSummary",
    ]) {
      assert.match(breakingChangePolicy, new RegExp(model));
    }
    assert.match(reviewContract, /PullRequestChangedFileSummary/);
    assert.match(reviewContract, /non-null `patch`/);
    assert.match(juhyungBrief, /PullRequestChangedFileSummary/);
  });

  it("schema defines MeetingActionItem task draft conversion fields", () => {
    const schema = readJson(schemaPath);
    const meetingActionItem = schema.$defs.MeetingActionItem;
    assert.deepEqual(meetingActionItem.properties.status.enum, ["draft", "approved", "converted", "rejected"]);
    assert.ok(meetingActionItem.properties.assigneeSuggestionMemberId);
    assert.ok(meetingActionItem.properties.dueDateSuggestion);
    assert.ok(meetingActionItem.properties.convertedTaskId);
  });

  it("validates AgentRun request, status, and detail contracts", () => {
    const schema = readJson(schemaPath);
    const uuid = "00000000-0000-4000-8000-000000000001";
    const runId = "00000000-0000-4000-8000-000000000002";
    const workflowId = "00000000-0000-4000-8000-000000000003";
    const stepId = "00000000-0000-4000-8000-000000000004";
    const traceId = "00000000-0000-4000-8000-000000000005";
    const dateTime = "2026-06-27T10:00:00.000Z";
    const tokenUsage = {
      inputTokens: 120,
      outputTokens: 40,
      totalTokens: 160,
      model: "local-runner",
    };
    const createRequest = {
      workspaceId: uuid,
      workflowType: "meeting.report.generate",
      workflowVersion: "v1",
      input: { meetingId: uuid },
      contextRefs: [{ type: "meeting", id: uuid }],
    };
    const statusResponse = {
      id: runId,
      workspaceId: uuid,
      workflowType: "meeting.report.generate",
      workflowVersion: "v1",
      status: "running",
      actionRequired: false,
      pendingActionCount: 0,
      startedAt: dateTime,
      finishedAt: null,
      updatedAt: dateTime,
      error: null,
    };
    const step = {
      id: stepId,
      runId,
      stepName: "summarize",
      status: "succeeded",
      input: {},
      output: {},
      error: null,
      tokenUsage,
      startedAt: dateTime,
      finishedAt: dateTime,
      createdAt: dateTime,
    };
    const detail = {
      id: runId,
      workflowId,
      workflowType: "meeting.report.generate",
      workflowVersion: "v1",
      workspaceId: uuid,
      actorMemberId: uuid,
      status: "requires_confirmation",
      actionRequired: true,
      pendingActionCount: 1,
      input: { meetingId: uuid },
      output: {},
      error: null,
      tokenUsage,
      steps: [step],
      actions: [],
      trace: [
        {
          id: traceId,
          runId,
          stepId,
          message: "workflow step completed",
          metadata: {},
          createdAt: dateTime,
        },
      ],
      startedAt: dateTime,
      finishedAt: null,
      createdAt: dateTime,
      updatedAt: dateTime,
    };

    assert.equal(validateJsonSchema(schema.$defs.AgentRunCreateRequest, createRequest, schema).valid, true);
    assert.equal(
      validateJsonSchema(
        schema.$defs.AgentRunCreateRequest,
        {
          ...createRequest,
          workflowType: "meeting.action-item.to-task-draft",
          input: { meetingId: uuid, actionItemId: uuid },
          contextRefs: [{ type: "meeting_action_item", id: uuid }],
        },
        schema,
      ).valid,
      true,
    );
    assert.equal(validateJsonSchema(schema.$defs.AgentRunStatusResponse, statusResponse, schema).valid, true);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunStatusResponse, { ...statusResponse, status: "failed", error: { message: "workflow failed" } }, schema).valid, true);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunStatusResponse, { ...statusResponse, status: "requires_confirmation", actionRequired: true, pendingActionCount: 1 }, schema).valid, true);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunDetail, detail, schema).valid, true);

    assert.equal(validateJsonSchema(schema.$defs.AgentRunCreateRequest, { ...createRequest, workflowType: "unknown.workflow" }, schema).valid, false);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunStatusResponse, { ...statusResponse, status: "running", startedAt: "2026-13-27T10:00:00.000Z" }, schema).valid, false);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunStatusResponse, { ...statusResponse, status: "running", startedAt: "2026-06-27T25:00:00.000Z" }, schema).valid, false);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunStatusResponse, { ...statusResponse, status: "failed", error: null }, schema).valid, false);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunStatusResponse, { ...statusResponse, status: "succeeded", error: { message: "unexpected" } }, schema).valid, false);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunStatusResponse, { ...statusResponse, status: "requires_confirmation", actionRequired: false, pendingActionCount: 1 }, schema).valid, false);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunStatusResponse, { ...statusResponse, status: "requires_confirmation", actionRequired: true, pendingActionCount: 0 }, schema).valid, false);
    assert.equal(validateJsonSchema(schema.$defs.AgentRunDetail, { ...detail, status: "failed", error: null }, schema).valid, false);
  });

  it("validates AgentAction type-specific payloads", () => {
    const schema = readJson(schemaPath);
    const agentAction = schema.$defs.AgentAction;
    const uuid = "00000000-0000-4000-8000-000000000001";
    const baseAction = (type, payload) => ({
      id: uuid,
      runId: "00000000-0000-4000-8000-000000000002",
      type,
      source: "orchestrator",
      requiresConfirmation: true,
      payload,
      status: "draft",
      confirmedByMemberId: null,
      confirmedAt: null,
      executedAt: null,
    });
    const cases = [
      ["task.create.draft", { workspaceId: uuid, title: "OAuth callback 처리" }],
      ["task.update.status", { workspaceId: uuid, taskId: uuid, status: "in_progress" }],
      ["github.issue.create", { workspaceId: uuid, taskId: uuid, repositoryId: uuid, title: "OAuth callback 처리" }],
      ["meeting.report.generate", { workspaceId: uuid, meetingId: uuid }],
      ["review.analysis.generate", { workspaceId: uuid, pullRequestId: uuid }],
      ["planning.approve", { workspaceId: uuid, draftId: uuid }],
    ];

    for (const [type, payload] of cases) {
      const result = validateJsonSchema(agentAction, baseAction(type, payload), schema);
      assert.equal(result.valid, true, `${type} should validate: ${result.errors.join(", ")}`);
    }
  });

  it("validates AgentAction allowed confirmation state combinations", () => {
    const schema = readJson(schemaPath);
    const agentAction = schema.$defs.AgentAction;
    const uuid = "00000000-0000-4000-8000-000000000001";
    const dateTime = "2026-06-27T10:00:00.000Z";
    const baseAction = {
      id: uuid,
      runId: "00000000-0000-4000-8000-000000000002",
      type: "task.create.draft",
      source: "orchestrator",
      requiresConfirmation: true,
      payload: { workspaceId: uuid, title: "OAuth callback 처리" },
      status: "draft",
      confirmedByMemberId: null,
      confirmedAt: null,
      executedAt: null,
    };
    const cases = [
      {
        name: "automatic draft",
        value: {
          ...baseAction,
          requiresConfirmation: false,
          status: "draft",
          confirmedByMemberId: null,
          confirmedAt: null,
          executedAt: null,
        },
      },
      {
        name: "automatic executed",
        value: {
          ...baseAction,
          requiresConfirmation: false,
          status: "executed",
          confirmedByMemberId: null,
          confirmedAt: null,
          executedAt: dateTime,
        },
      },
      {
        name: "confirmed executed",
        value: {
          ...baseAction,
          requiresConfirmation: true,
          status: "executed",
          confirmedByMemberId: uuid,
          confirmedAt: dateTime,
          executedAt: dateTime,
        },
      },
      {
        name: "waiting confirmation",
        value: {
          ...baseAction,
          requiresConfirmation: true,
          status: "waiting_confirmation",
          confirmedByMemberId: null,
          confirmedAt: null,
          executedAt: null,
        },
      },
      {
        name: "confirmed",
        value: {
          ...baseAction,
          requiresConfirmation: true,
          status: "confirmed",
          confirmedByMemberId: uuid,
          confirmedAt: dateTime,
          executedAt: null,
        },
      },
      {
        name: "rejected",
        value: {
          ...baseAction,
          requiresConfirmation: true,
          status: "rejected",
          confirmedByMemberId: null,
          confirmedAt: null,
          executedAt: null,
        },
      },
      {
        name: "failed",
        value: {
          ...baseAction,
          requiresConfirmation: true,
          status: "failed",
          confirmedByMemberId: uuid,
          confirmedAt: dateTime,
          executedAt: null,
        },
      },
    ];

    for (const { name, value } of cases) {
      const result = validateJsonSchema(agentAction, value, schema);
      assert.equal(result.valid, true, `${name} should validate: ${result.errors.join(", ")}`);
    }
  });

  it("rejects invalid AgentAction type and state combinations", () => {
    const schema = readJson(schemaPath);
    const agentAction = schema.$defs.AgentAction;
    const uuid = "00000000-0000-4000-8000-000000000001";
    const dateTime = "2026-06-27T10:00:00.000Z";
    const baseAction = {
      id: uuid,
      runId: "00000000-0000-4000-8000-000000000002",
      type: "task.create.draft",
      source: "orchestrator",
      requiresConfirmation: true,
      payload: { workspaceId: uuid, title: "OAuth callback 처리" },
      status: "draft",
      confirmedByMemberId: null,
      confirmedAt: null,
      executedAt: null,
    };
    const invalidCases = [
      {
        name: "type/payload mismatch",
        value: {
          ...baseAction,
          type: "task.update.status",
        },
      },
      {
        name: "requiresConfirmation=false with failed",
        value: {
          ...baseAction,
          requiresConfirmation: false,
          status: "failed",
          confirmedByMemberId: null,
          confirmedAt: null,
        },
      },
      {
        name: "executed with executedAt=null",
        value: {
          ...baseAction,
          status: "executed",
          confirmedByMemberId: uuid,
          confirmedAt: dateTime,
          executedAt: null,
        },
      },
      {
        name: "waiting_confirmation with confirmedAt",
        value: {
          ...baseAction,
          status: "waiting_confirmation",
          confirmedAt: dateTime,
        },
      },
    ];

    for (const { name, value } of invalidCases) {
      const result = validateJsonSchema(agentAction, value, schema);
      assert.equal(result.valid, false, `${name} should fail schema validation`);
    }
  });

  it("validates AgentResultMessage status and error coupling", () => {
    const schema = readJson(schemaPath);
    const agentResult = schema.$defs.AgentResultMessage;
    const baseResult = {
      jobId: "00000000-0000-4000-8000-000000000001",
      runId: "00000000-0000-4000-8000-000000000002",
      status: "succeeded",
      output: {},
      actions: [],
      trace: [{ message: "workflow finished" }],
      error: null,
      finishedAt: "2026-06-27T10:01:00.000Z",
    };

    assert.equal(validateJsonSchema(agentResult, baseResult, schema).valid, true);
    assert.equal(validateJsonSchema(agentResult, { ...baseResult, status: "failed", error: { message: "workflow failed" } }, schema).valid, true);
    assert.equal(validateJsonSchema(agentResult, { ...baseResult, status: "failed", error: { code: null, message: "workflow failed" } }, schema).valid, true);
    assert.equal(validateJsonSchema(agentResult, { ...baseResult, error: { message: "unexpected error" } }, schema).valid, false);
    assert.equal(validateJsonSchema(agentResult, { ...baseResult, status: "failed", error: null }, schema).valid, false);
    assert.equal(validateJsonSchema(agentResult, { ...baseResult, status: "failed", error: { code: "WORKFLOW_FAILED" } }, schema).valid, false);
  });
});

describe("contract fixtures", () => {
  it("workspace dashboard fixture exists and parses as JSON", () => {
    const schema = readJson("docs/contracts/schemas/pilo-public-contracts.schema.json");
    const fixture = JSON.parse(read("docs/contracts/fixtures/workspace-dashboard.fixture.json"));
    const result = validateJsonSchema(schema.$defs.WorkspaceDashboardReadModel, fixture, schema);

    assert.equal(result.valid, true, result.errors.join(", "));
    assert.ok(fixture.workspace);
    assert.ok(Array.isArray(fixture.tasks));
    assert.ok(Array.isArray(fixture.canvasEntities));
    assert.ok(Array.isArray(fixture.agentActions));
    assert.ok(Array.isArray(fixture.meetingReports));
    assert.ok(Array.isArray(fixture.meetingActionItems));
    assert.ok(Array.isArray(fixture.pullRequestChangedFiles));
    assert.equal(fixture.pullRequestChangedFiles.length, fixture.pullRequests[0].changedFilesCount);
    assert.ok(fixture.pullRequestChangedFiles.every((file) => file.pullRequestId === fixture.pullRequests[0].id));
    assert.ok(fixture.pullRequestChangedFiles.every((file) => typeof file.sha === "string" && file.sha.length > 0));
    assert.ok(fixture.meetingReports.length > 0);
    assert.ok(fixture.meetingActionItems.length > 0);
    assert.equal(fixture.meetingActionItems[0].reportId, fixture.meetingReports[0].id);
    assert.equal(fixture.meetingActionItems[0].status, "draft");
  });

  it("agent SQS fixtures exist and parse as JSON", () => {
    const job = JSON.parse(read("docs/contracts/fixtures/agent-job.fixture.json"));
    const result = JSON.parse(read("docs/contracts/fixtures/agent-result.fixture.json"));
    assert.equal(job.runId, result.runId);
    assert.equal(job.jobId, result.jobId);
    assert.ok(Array.isArray(result.actions));
  });

  it("review room fixture matches review room public schema", () => {
    const schema = JSON.parse(read("docs/contracts/schemas/pilo-public-contracts.schema.json"));
    const fixture = JSON.parse(read("docs/contracts/fixtures/review-room.fixture.json"));

    assertMatchesDefinition(schema.$defs, "CodeReviewRoomSummary", fixture.codeReviewRoom);
  });

  it("review analysis fixture matches review public schemas", () => {
    const schema = readJson("docs/contracts/schemas/pilo-public-contracts.schema.json");
    const fixture = readJson("docs/contracts/fixtures/review-analysis.fixture.json");

    assert.equal(validateJsonSchema(schema.$defs.PRAnalysisSummary, fixture.prAnalysis, schema).valid, true);
    assert.equal(validateJsonSchema(schema.$defs.ReviewCanvasSummary, fixture.reviewCanvas, schema).valid, true);
    for (const detail of fixture.nodeDetails) {
      const result = validateJsonSchema(schema.$defs.ReviewNodeDetail, detail, schema);
      assert.equal(result.valid, true, result.errors.join(", "));
    }
    for (const risk of fixture.reviewRisks) {
      const result = validateJsonSchema(schema.$defs.ReviewRiskSummary, risk, schema);
      assert.equal(result.valid, true, result.errors.join(", "));
    }
  });

  it("review changes fixture exists and parses as JSON", () => {
    const fixture = JSON.parse(read("docs/contracts/fixtures/review-changes.fixture.json"));

    assert.ok(fixture.analysisId);
    assert.ok(Array.isArray(fixture.changedFiles));
    assert.ok(Array.isArray(fixture.changedFiles[0].functions));
  });

  it("planning detail fixture matches planning public schemas", () => {
    const schema = readJson("docs/contracts/schemas/pilo-public-contracts.schema.json");
    const fixture = readJson("docs/contracts/fixtures/planning-detail.fixture.json");
    const summaryResult = validateJsonSchema(schema.$defs.ProjectPlanDraftSummary, fixture.summary, schema);
    const detailResult = validateJsonSchema(schema.$defs.ProjectPlanDraftDetail, fixture.detail, schema);
    const ownerApiResults = fixture.detail.approval.ownerApiResults;

    assert.equal(summaryResult.valid, true, summaryResult.errors.join(", "));
    assert.equal(detailResult.valid, true, detailResult.errors.join(", "));
    assert.equal(fixture.summary.id, fixture.detail.id);
    assert.equal(fixture.detail.approval.status, "executed");
    assert.ok(fixture.detail.featureDrafts.length > 0);
    assert.ok(fixture.detail.milestoneDrafts.length > 0);
    assert.ok(fixture.detail.firstAgendaDraft);
    assert.ok(ownerApiResults.some((result) => result.operation === "task.create" && result.status === "succeeded" && result.targetEntityId));
    assert.ok(ownerApiResults.some((result) => result.operation === "milestone.create" && result.status === "succeeded" && result.targetEntityId));
  });

  it("agent run detail fixture validates against the public schema", () => {
    const schema = readJson("docs/contracts/schemas/pilo-public-contracts.schema.json");
    const fixture = readJson("docs/contracts/fixtures/agent-run-detail.fixture.json");
    const result = validateJsonSchema(schema.$defs.AgentRunDetail, fixture, schema);
    const waitingAction = fixture.actions.find((action) => action.status === "waiting_confirmation");

    assert.equal(result.valid, true, result.errors.join(", "));
    assert.equal(fixture.status, "requires_confirmation");
    assert.equal(fixture.actionRequired, true);
    assert.ok(fixture.pendingActionCount > 0);
    assert.ok(waitingAction);
    assert.equal(waitingAction.requiresConfirmation, true);
  });

  it("fixture rules are documented and linked from bootstrap docs", () => {
    assert.ok(exists("docs/contracts/fixtures/README.md"));
    assert.match(read("agent.md"), /docs\/contracts\/fixtures/);
    assert.match(read("docs/contracts/README.md"), /docs\/contracts\/fixtures/);
  });
});

describe("github collaboration templates", () => {
  it("pull request template requires contract, mock, and DB sections", () => {
    const content = read(".github/PULL_REQUEST_TEMPLATE.md");
    for (const heading of ["Contract Impact", "Cross-Domain Access", "Mock / Stub", "DB / Migration", "Validation"]) {
      assert.match(content, new RegExp(`## ${heading.replace("/", "\\/")}`));
    }
    for (const guideField of ["Contract Used", "Owner", "Internal-only change", "No external consumer", "Consumers", "Mock/Real"]) {
      assert.match(content, new RegExp(guideField));
    }
  });

  it("issue templates exist for domain task and contract change", () => {
    assert.ok(exists(".github/ISSUE_TEMPLATE/domain-task.md"));
    assert.ok(exists(".github/ISSUE_TEMPLATE/contract-change.md"));
  });
});

describe("local development baseline", () => {
  it("docker compose wires Postgres schema and LocalStack init scripts", () => {
    const compose = read("docker-compose.dev.yml");
    assert.match(compose, /docs\/db\/pilo_erd_schema\.sql/);
    assert.match(
      compose,
      /docs\/db\/migrations\/202606281200_donghyun_auth_workspace_canvas_init\.sql/,
    );
    assert.match(
      compose,
      /docs\/db\/migrations\/202606300500_mvp_task_drafts_rebaseline\.sql/,
    );
    assert.match(
      compose,
      /docs\/db\/seeds\/001_donghyun_auth_workspace_canvas_seed\.sql/,
    );
    assert.match(compose, /localstack\/init\/ready\.d/);
  });

  it("local DB apply script loads the owner migration and seed", () => {
    const script = read("infra/scripts/apply-local-db-sql.ps1");
    assert.match(
      script,
      /202606281200_donghyun_auth_workspace_canvas_init\.sql/,
    );
    assert.match(script, /202606300500_mvp_task_drafts_rebaseline\.sql/);
    assert.match(script, /001_donghyun_auth_workspace_canvas_seed\.sql/);
    assert.match(script, /psql -v ON_ERROR_STOP=1/);
  });

  it("local SQS bootstrap creates the expected queues", () => {
    const script = read("localstack/init/ready.d/01-create-sqs.sh");
    const localSetup = read("docs/dev-local-setup.md");

    assert.match(script, /^#!\/bin\/sh/);
    assert.match(script, /pilo-agent-jobs/);
    assert.match(script, /pilo-agent-results/);
    assert.match(localSetup, /100755/);
    const psScript = read("infra/scripts/create-local-sqs-queues.ps1");
    assert.match(psScript, /pilo-agent-jobs/);
    assert.match(psScript, /pilo-agent-results/);
  });

  it("local env example contains LocalStack credentials and queue URLs", () => {
    const env = read(".env.example");
    assert.match(env, /AWS_ACCESS_KEY_ID=test/);
    assert.match(env, /SQS_AGENT_JOBS_QUEUE_URL/);
    assert.match(env, /SQS_AGENT_RESULTS_QUEUE_URL/);
  });

  it("local setup documents existing volume and AI Worker dev dependency hygiene", () => {
    const localSetup = read("docs/dev-local-setup.md");
    const appsReadme = read("apps/README.md");

    assert.match(localSetup, /task_drafts/);
    assert.match(localSetup, /apply-local-db-sql\.ps1/);
    assert.match(localSetup, /down -v/);
    assert.match(localSetup, /requirements-dev\.txt/);
    assert.match(localSetup, /black --check/);
    assert.match(localSetup, /ruff check/);
    assert.match(localSetup, /pytest/);
    assert.match(localSetup, /Mock\/In-memory/);
    assert.match(localSetup, /local-only UI storage/);
    assert.match(appsReadme, /mock or in-memory/);
    assert.match(appsReadme, /fully DB-backed/);
  });
});

describe("db schema contract alignment", () => {
  it("final SQL schema has unique table names and no broken referenced tables", () => {
    const sql = read("docs/db/pilo_erd_schema.sql");
    const tables = [...sql.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((m) => m[1]);
    const uniqueTables = new Set(tables);
    assert.equal(tables.length, uniqueTables.size, "table names must be unique");
    assert.equal(tables.length, 70, "MVP implementation baseline schema should have 70 tables");

    const refs = [...sql.matchAll(/REFERENCES\s+([a-z_]+)\(/g)].map((m) => m[1]);
    for (const ref of refs) {
      assert.ok(uniqueTables.has(ref), `referenced table must exist: ${ref}`);
    }
  });

  it("Prisma mapped tables exist in the SQL baseline", () => {
    const prisma = read("apps/app-server/prisma/schema.prisma");
    const sql = read("docs/db/pilo_erd_schema.sql");
    const tables = new Set([...sql.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((m) => m[1]));
    const mappedTables = [...prisma.matchAll(/@@map\("([a-z_]+)"\)/g)].map((m) => m[1]);

    assert.ok(mappedTables.length > 0, "Prisma schema must map DB-backed models to tables");
    for (const table of mappedTables) {
      assert.ok(tables.has(table), `Prisma mapped table must exist in SQL baseline: ${table}`);
    }
  });

  it("Canvas enum vocabulary is aligned across schema and SQL baseline", () => {
    const schema = readJson("docs/contracts/schemas/pilo-public-contracts.schema.json");
    const sql = read("docs/db/pilo_erd_schema.sql");
    const migration = read(
      "docs/db/migrations/202606281200_donghyun_auth_workspace_canvas_init.sql",
    );
    const expectedBoardTypes = ["project_map", "meeting", "review", "custom"];
    const expectedConnectionTypes = [
      "related_to",
      "created_from",
      "blocks",
      "references",
      "implements",
      "reviews",
    ];

    assert.deepEqual(schema.$defs.CanvasBoardType.enum, expectedBoardTypes);
    assert.deepEqual(
      schema.$defs.CanvasConnectionType.enum,
      expectedConnectionTypes,
    );
    assert.equal(
      schema.$defs.CanvasConnectionRequest.properties.connectionType.$ref,
      "#/$defs/CanvasConnectionType",
    );
    for (const content of [sql, migration]) {
      assert.match(content, /board_type VARCHAR\(80\) NOT NULL DEFAULT 'project_map'/);
      assert.match(
        content,
        /canvas_boards_type_check CHECK \(board_type IN \('project_map', 'meeting', 'review', 'custom'\)\)/,
      );
      assert.match(
        content,
        /canvas_connections_type_check CHECK \(connection_type IN \('related_to', 'created_from', 'blocks', 'references', 'implements', 'reviews'\)\)/,
      );
      assert.doesNotMatch(content, /implemented_by|DEFAULT 'workspace'/);
    }
  });

  it("auth DB fields are aligned with the implemented session and OAuth records", () => {
    const sql = read("docs/db/pilo_erd_schema.sql");
    assert.match(
      sql,
      /CREATE TABLE oauth_accounts[\s\S]*token_type VARCHAR\(80\)/,
    );
    assert.match(
      sql,
      /CREATE TABLE auth_sessions[\s\S]*token_hash_algorithm VARCHAR\(40\)/,
    );
    assert.match(
      sql,
      /CREATE TABLE auth_sessions[\s\S]*secret_version VARCHAR\(80\)/,
    );

    const ownerDoc = read("docs/db/db-schema-by-owner.md");
    assert.match(ownerDoc, /token_type/);
    assert.match(ownerDoc, /token_hash_algorithm/);
    assert.match(ownerDoc, /secret_version/);
  });

  it("db indexes can be replayed during local migration bootstrap", () => {
    const sql = read("docs/db/pilo_erd_schema.sql");
    const indexStatements = [...sql.matchAll(/^CREATE (?:UNIQUE )?INDEX .+$/gm)].map(
      (match) => match[0],
    );

    assert.ok(indexStatements.length > 0, "schema should define indexes");

    for (const statement of indexStatements) {
      assert.match(statement, /IF NOT EXISTS/);
    }
  });

  it("donghyun DB migration and seed stay inside the owned data boundary", () => {
    const migrationPath =
      "docs/db/migrations/202606281200_donghyun_auth_workspace_canvas_init.sql";
    const seedPath =
      "docs/db/seeds/001_donghyun_auth_workspace_canvas_seed.sql";

    assert.ok(exists(migrationPath), `${migrationPath} must exist`);
    assert.ok(exists(seedPath), `${seedPath} must exist`);

    const migration = read(migrationPath);
    for (const table of [
      "users",
      "oauth_accounts",
      "auth_sessions",
      "workspaces",
      "workspace_members",
      "workspace_invites",
      "dashboard_preferences",
      "canvas_boards",
      "canvas_shapes",
      "canvas_connections",
      "canvas_node_positions",
      "canvas_view_settings",
      "canvas_filter_settings",
    ]) {
      assert.match(
        migration,
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
      );
    }

    const seed = read(seedPath);
    assert.match(seed, /INSERT INTO users/);
    assert.match(seed, /INSERT INTO canvas_shapes/);
    assert.doesNotMatch(
      seed,
      /INSERT INTO (tasks|github_issues|pull_requests|meetings|meeting_reports|code_review_rooms|agent_runs)\b/,
    );
  });

  it("MVP task draft rebaseline migration aligns SQL with Prisma", () => {
    const migrationPath =
      "docs/db/migrations/202606300500_mvp_task_drafts_rebaseline.sql";

    assert.ok(exists(migrationPath), `${migrationPath} must exist`);

    const migration = read(migrationPath);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS task_drafts/);
    assert.match(migration, /workspace_id UUID NOT NULL REFERENCES workspaces\(id\)/);
    assert.match(migration, /task_id UUID REFERENCES tasks\(id\) ON DELETE SET NULL/);
    assert.match(migration, /idx_task_drafts_workspace_status/);
    assert.match(read("apps/app-server/prisma/schema.prisma"), /@@map\("task_drafts"\)/);
    assert.match(read("docs/db/db-schema-by-owner.md"), /`task_drafts`/);
  });

  it("db owner document uses real owner names", () => {
    const content = read("docs/db/db-schema-by-owner.md");
    for (const heading of ["## 동현", "## 주형", "## 진호", "## 은재", "## 세인"]) {
      assert.match(content, new RegExp(heading));
    }
  });
});

describe("review bot context", () => {
  it("CodeRabbit knowledge base includes the contract index and interface guide", () => {
    const content = read(".coderabbit.yaml");
    assert.match(content, /docs\/agents\/README\.md/);
    assert.match(content, /docs\/contracts\/README\.md/);
    assert.match(content, /docs\/contracts\/interface-contract-guide\.md/);
    assert.match(content, /docs\/contracts\/schemas\/pilo-public-contracts\.schema\.json/);
    assert.match(content, /docs\/contracts\/fixtures\/README\.md/);
  });
});
