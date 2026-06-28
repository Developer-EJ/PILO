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
      "TaskCreateDraft",
      "ProgressSummary",
      "GithubIssueSummary",
      "PullRequestSummary",
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
      "AgentAction",
      "AgentJobMessage",
      "AgentResultMessage",
      "NotificationCreateRequest",
      "SharedFileRef",
    ]) {
      assert.ok(defs[name], `schema must define ${name}`);
    }
  });

  it("schema defines MeetingActionItem task draft conversion fields", () => {
    const schema = JSON.parse(read(schemaPath));
    const meetingActionItem = schema.$defs.MeetingActionItem;
    assert.deepEqual(meetingActionItem.properties.status.enum, ["draft", "approved", "converted", "rejected"]);
    assert.ok(meetingActionItem.properties.assigneeSuggestionMemberId);
    assert.ok(meetingActionItem.properties.dueDateSuggestion);
    assert.ok(meetingActionItem.properties.convertedTaskId);
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
    const schema = JSON.parse(read("docs/contracts/schemas/pilo-public-contracts.schema.json"));
    const fixture = JSON.parse(read("docs/contracts/fixtures/review-analysis.fixture.json"));

    assertMatchesDefinition(schema.$defs, "PRAnalysisSummary", fixture.prAnalysis);
    assertMatchesDefinition(schema.$defs, "ReviewCanvasSummary", fixture.reviewCanvas);
    for (const detail of fixture.nodeDetails) {
      assertMatchesDefinition(schema.$defs, "ReviewNodeDetail", detail);
    }
    for (const risk of fixture.reviewRisks) {
      assertMatchesDefinition(schema.$defs, "ReviewRiskSummary", risk);
    }
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
