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

  it("agent docs are linked from the bootstrap and collaboration docs", () => {
    assert.match(read("agent.md"), /docs\/agents\/README\.md/);
    assert.match(read("docs/agent-collaboration-guide.md"), /docs\/agents\/README\.md/);
    assert.match(read("docs/contracts/README.md"), /docs\/agents\/README\.md/);
  });

  it("collaboration guide does not point to deprecated domain paths or missing contract docs", () => {
    const content = read("docs/agent-collaboration-guide.md");
    assert.doesNotMatch(content, /docs\/contracts\/agent\.md/);
    assert.doesNotMatch(content, /apps\/frontend\/src\/domains/);
    assert.doesNotMatch(content, /apps\/app-server\/src\/domains/);
    assert.doesNotMatch(content, /apps\/ai-worker\/app\/domains/);
  });

  it("division detail docs do not use legacy A/B/C/D/E owner aliases", () => {
    for (const file of ["docs/PILO_5인_분업_상세_명세.md", "docs/PILO_5인_분업_상세_명세.html"]) {
      const content = read(file);
      assert.doesNotMatch(content, /A에게|B에게|C에게|D에게|E에게|A가|B가|C가|D가|E가|A는|B는|C는|D는|E는/);
    }
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
      "MeetingReportSummary",
      "MeetingActionItem",
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
    assert.doesNotMatch(githubContract.slice(githubContract.indexOf("## Mock Rule")), /github-repositories\.fixture\.json/);
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
    const fixture = JSON.parse(read("docs/contracts/fixtures/workspace-dashboard.fixture.json"));
    assert.ok(fixture.currentUser);
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
    assert.match(compose, /localstack\/init\/ready\.d/);
  });

  it("local SQS bootstrap creates the expected queues", () => {
    const script = read("localstack/init/ready.d/01-create-sqs.sh");
    assert.match(script, /pilo-agent-jobs/);
    assert.match(script, /pilo-agent-results/);
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
});

describe("db schema contract alignment", () => {
  it("final SQL schema has unique table names and no broken referenced tables", () => {
    const sql = read("docs/db/pilo_erd_schema.sql");
    const tables = [...sql.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((m) => m[1]);
    const uniqueTables = new Set(tables);
    assert.equal(tables.length, uniqueTables.size, "table names must be unique");
    assert.equal(tables.length, 69, "final hybrid schema should have 69 tables");

    const refs = [...sql.matchAll(/REFERENCES\s+([a-z_]+)\(/g)].map((m) => m[1]);
    for (const ref of refs) {
      assert.ok(uniqueTables.has(ref), `referenced table must exist: ${ref}`);
    }
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
