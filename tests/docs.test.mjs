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
      "TaskAssignAction",
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

  it("agent action schema binds every supported action type to a concrete payload schema", () => {
    const schema = JSON.parse(read(schemaPath));
    const agentAction = schema.$defs.AgentAction;

    function payloadRefFor(actionType) {
      const condition = agentAction.allOf.find((entry) => {
        return entry.if?.properties?.type?.const === actionType;
      });

      return condition?.then?.properties?.payload?.$ref;
    }

    const expectedPayloadRefs = new Map([
      ["task.create.draft", "#/$defs/TaskCreateDraft"],
      ["task.update.status", "#/$defs/TaskStatusUpdateAction"],
      ["task.assign", "#/$defs/TaskAssignAction"],
      ["github.issue.create", "#/$defs/GithubIssueCreateAction"],
      ["meeting.report.generate", "#/$defs/MeetingReportGenerateAction"],
      ["review.analysis.generate", "#/$defs/ReviewAnalysisGenerateAction"],
      ["planning.approve", "#/$defs/PlanningApproveAction"],
    ]);

    assert.deepEqual([...agentAction.properties.type.enum].sort(), [...expectedPayloadRefs.keys()].sort());
    for (const [actionType, expectedRef] of expectedPayloadRefs) {
      assert.equal(payloadRefFor(actionType), expectedRef);
    }
    assert.deepEqual(agentAction.required, ["type", "source", "requiresConfirmation", "payload", "status"]);
    assert.equal(agentAction.additionalProperties, false);
    assert.deepEqual(schema.$defs.TaskAssignAction.required, ["taskId", "assigneeMemberId"]);
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
    assert.match(githubContract, /changed_functions/);
    assert.match(githubContract, /non-null `patch`/);
    assert.match(githubContract, /patch: null/);
    assert.match(githubContract, /pullRequestId \+ path \+ sha/);
    assert.match(githubContract, /## Provided Read Models/);
    assert.match(githubContract, /## Consumed By/);
    assert.match(githubContract, /## Breaking Change Policy/);
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

describe("new task and milestone schema definitions", () => {
  const schemaPath = "docs/contracts/schemas/pilo-public-contracts.schema.json";

  it("TaskDraft schema has correct required fields and status enum", () => {
    const schema = JSON.parse(read(schemaPath));
    const taskDraft = schema.$defs.TaskDraft;
    assert.ok(taskDraft, "TaskDraft must be defined");
    assert.equal(taskDraft.additionalProperties, false);
    for (const field of ["id", "workspaceId", "title", "priority", "status", "createdAt"]) {
      assert.ok(taskDraft.required.includes(field), `TaskDraft must require ${field}`);
    }
    assert.deepEqual(
      [...taskDraft.properties.status.enum].sort(),
      ["approved", "draft", "rejected", "waiting_confirmation"]
    );
    assert.deepEqual(
      [...taskDraft.properties.priority.enum].sort(),
      ["high", "low", "medium", "urgent"]
    );
    assert.equal(taskDraft.properties.title.minLength, 1);
  });

  it("TaskDraft schema sourceType and sourceId are optional and nullable", () => {
    const schema = JSON.parse(read(schemaPath));
    const taskDraft = schema.$defs.TaskDraft;
    assert.ok(!taskDraft.required.includes("sourceType"), "sourceType must be optional");
    assert.ok(!taskDraft.required.includes("sourceId"), "sourceId must be optional");
    assert.ok(Array.isArray(taskDraft.properties.sourceType.type), "sourceType must accept null");
    assert.ok(taskDraft.properties.sourceType.type.includes("null"));
  });

  it("MilestoneSummary schema has correct required fields and enums", () => {
    const schema = JSON.parse(read(schemaPath));
    const milestone = schema.$defs.MilestoneSummary;
    assert.ok(milestone, "MilestoneSummary must be defined");
    assert.equal(milestone.additionalProperties, false);
    for (const field of ["id", "workspaceId", "title", "status", "taskCount", "doneTaskCount"]) {
      assert.ok(milestone.required.includes(field), `MilestoneSummary must require ${field}`);
    }
    assert.deepEqual([...milestone.properties.status.enum].sort(), ["done", "in_progress", "planned"]);
    assert.equal(milestone.properties.taskCount.minimum, 0);
    assert.equal(milestone.properties.doneTaskCount.minimum, 0);
  });

  it("MilestoneSummary startDate and endDate are optional and nullable", () => {
    const schema = JSON.parse(read(schemaPath));
    const milestone = schema.$defs.MilestoneSummary;
    assert.ok(!milestone.required.includes("startDate"));
    assert.ok(!milestone.required.includes("endDate"));
  });

  it("TaskStatusUpdateAction schema has correct required fields and status enum", () => {
    const schema = JSON.parse(read(schemaPath));
    const action = schema.$defs.TaskStatusUpdateAction;
    assert.ok(action, "TaskStatusUpdateAction must be defined");
    assert.equal(action.additionalProperties, false);
    assert.deepEqual([...action.required].sort(), ["status", "taskId"]);
    assert.deepEqual(
      [...action.properties.status.enum].sort(),
      ["blocked", "done", "in_progress", "in_review", "todo"]
    );
    assert.ok(!action.required.includes("reason"), "reason must be optional");
  });

  it("TaskAssignAction schema requires taskId and assigneeMemberId, allows null assignee", () => {
    const schema = JSON.parse(read(schemaPath));
    const action = schema.$defs.TaskAssignAction;
    assert.ok(action, "TaskAssignAction must be defined");
    assert.equal(action.additionalProperties, false);
    assert.deepEqual([...action.required].sort(), ["assigneeMemberId", "taskId"]);
    const assigneeRef = action.properties.assigneeMemberId;
    const hasNullOption = assigneeRef.anyOf?.some((o) => o.type === "null");
    assert.ok(hasNullOption, "assigneeMemberId must accept null (unassign)");
  });
});

describe("progress snapshot schema", () => {
  const schemaPath = "docs/contracts/schemas/pilo-public-contracts.schema.json";

  it("ProgressSnapshotSummary has required id and capturedAt unlike ProgressSummary", () => {
    const schema = JSON.parse(read(schemaPath));
    const snapshot = schema.$defs.ProgressSnapshotSummary;
    const summary = schema.$defs.ProgressSummary;
    assert.ok(snapshot, "ProgressSnapshotSummary must be defined");
    assert.equal(snapshot.additionalProperties, false);
    assert.ok(snapshot.required.includes("id"), "snapshot must require id");
    assert.ok(snapshot.required.includes("capturedAt"), "snapshot must require capturedAt");
    assert.ok(!summary.required.includes("id"), "ProgressSummary must not require id");
    for (const field of ["totalTasks", "doneTasks", "blockedTasks", "reviewTasks", "delayedTasks", "progressRate"]) {
      assert.ok(snapshot.required.includes(field), `snapshot must require ${field}`);
    }
    assert.equal(snapshot.properties.progressRate.minimum, 0);
    assert.equal(snapshot.properties.progressRate.maximum, 100);
  });

  it("ProgressSnapshotSummary milestoneId is optional and nullable", () => {
    const schema = JSON.parse(read(schemaPath));
    const snapshot = schema.$defs.ProgressSnapshotSummary;
    assert.ok(!snapshot.required.includes("milestoneId"));
    const milestoneIdDef = snapshot.properties.milestoneId;
    const hasNullOption = milestoneIdDef.anyOf?.some((o) => o.type === "null");
    assert.ok(hasNullOption, "milestoneId must accept null");
  });

  it("progress.md documents canonical summary path and history path", () => {
    const content = read("docs/contracts/progress.md");
    assert.match(content, /\/workspaces\/:workspaceId\/progress\/summary/);
    assert.match(content, /\/workspaces\/:workspaceId\/progress\/history/);
    assert.match(content, /Canonical public path/);
    assert.match(content, /ProgressSnapshotSummary/);
    assert.doesNotMatch(content, /consumer는 \/workspaces\/:workspaceId\/progress를 사용/);
  });
});

describe("github connection and repository schema definitions", () => {
  const schemaPath = "docs/contracts/schemas/pilo-public-contracts.schema.json";

  it("GithubConnectionSummary schema restricts provider to github_app only", () => {
    const schema = JSON.parse(read(schemaPath));
    const conn = schema.$defs.GithubConnectionSummary;
    assert.ok(conn, "GithubConnectionSummary must be defined");
    assert.equal(conn.additionalProperties, false);
    for (const field of ["id", "workspaceId", "provider", "connectedAt"]) {
      assert.ok(conn.required.includes(field), `GithubConnectionSummary must require ${field}`);
    }
    assert.deepEqual(conn.properties.provider.enum, ["github_app"]);
    assert.ok(!conn.required.includes("installationId"), "installationId is optional");
    assert.ok(!conn.required.includes("revokedAt"), "revokedAt is optional");
    const revokedAtDef = conn.properties.revokedAt;
    const hasNullOption = revokedAtDef.anyOf?.some((o) => o.type === "null");
    assert.ok(hasNullOption, "revokedAt must accept null");
  });

  it("GithubRepositorySummary schema has correct required fields", () => {
    const schema = JSON.parse(read(schemaPath));
    const repo = schema.$defs.GithubRepositorySummary;
    assert.ok(repo, "GithubRepositorySummary must be defined");
    assert.equal(repo.additionalProperties, false);
    for (const field of ["id", "workspaceId", "owner", "repoName", "url"]) {
      assert.ok(repo.required.includes(field), `GithubRepositorySummary must require ${field}`);
    }
    assert.ok(!repo.required.includes("defaultBranch"), "defaultBranch is optional");
    assert.ok(!repo.required.includes("syncedAt"), "syncedAt is optional");
  });

  it("GithubIssueCreateAction schema requires workspaceId, taskId, repositoryId, title", () => {
    const schema = JSON.parse(read(schemaPath));
    const action = schema.$defs.GithubIssueCreateAction;
    assert.ok(action, "GithubIssueCreateAction must be defined");
    assert.equal(action.additionalProperties, false);
    for (const field of ["workspaceId", "taskId", "repositoryId", "title"]) {
      assert.ok(action.required.includes(field), `GithubIssueCreateAction must require ${field}`);
    }
    assert.equal(action.properties.title.minLength, 1);
    assert.equal(action.properties.labels.type, "array");
    assert.equal(action.properties.assignees.type, "array");
    assert.ok(!action.required.includes("labels"), "labels is optional");
    assert.ok(!action.required.includes("assignees"), "assignees is optional");
  });

  it("github.md documents the GitHub App callback binding and new endpoints", () => {
    const content = read("docs/contracts/github.md");
    assert.match(content, /GitHub App 설치 callback/);
    assert.match(content, /\/github\/app\/callback/);
    assert.match(content, /GithubConnectionSummary/);
    assert.match(content, /GithubRepositorySummary/);
    assert.match(content, /github_app/);
    assert.match(content, /DELETE.*\/workspaces\/:workspaceId\/github\/connections\/:connectionId/);
    assert.match(content, /GET.*\/workspaces\/:workspaceId\/github\/connections/);
  });

  it("contracts README.md lists all new 주형-owned public types", () => {
    const content = read("docs/contracts/README.md");
    for (const typeName of [
      "TaskDraft",
      "MilestoneSummary",
      "GithubConnectionSummary",
      "GithubRepositorySummary",
      "GithubIssueSummary",
      "PullRequestChangedFileSummary",
    ]) {
      assert.match(content, new RegExp(typeName), `README must list ${typeName}`);
    }
  });
});

describe("cross-domain agent action payload schemas", () => {
  const schemaPath = "docs/contracts/schemas/pilo-public-contracts.schema.json";

  it("MeetingReportGenerateAction requires workspaceId and meetingId", () => {
    const schema = JSON.parse(read(schemaPath));
    const action = schema.$defs.MeetingReportGenerateAction;
    assert.ok(action, "MeetingReportGenerateAction must be defined");
    assert.equal(action.additionalProperties, false);
    assert.deepEqual([...action.required].sort(), ["meetingId", "workspaceId"]);
    assert.ok(!action.required.includes("requestedByMemberId"), "requestedByMemberId is optional");
    const reqByDef = action.properties.requestedByMemberId;
    const hasNullOption = reqByDef.anyOf?.some((o) => o.type === "null");
    assert.ok(hasNullOption, "requestedByMemberId must accept null");
  });

  it("ReviewAnalysisGenerateAction requires only pullRequestId", () => {
    const schema = JSON.parse(read(schemaPath));
    const action = schema.$defs.ReviewAnalysisGenerateAction;
    assert.ok(action, "ReviewAnalysisGenerateAction must be defined");
    assert.equal(action.additionalProperties, false);
    assert.deepEqual(action.required, ["pullRequestId"]);
    assert.ok(!action.required.includes("repositoryId"), "repositoryId is optional");
    assert.ok(!action.required.includes("requestedByMemberId"), "requestedByMemberId is optional");
  });

  it("PlanningApproveAction requires workspaceId and projectPlanDraftId", () => {
    const schema = JSON.parse(read(schemaPath));
    const action = schema.$defs.PlanningApproveAction;
    assert.ok(action, "PlanningApproveAction must be defined");
    assert.equal(action.additionalProperties, false);
    assert.deepEqual([...action.required].sort(), ["projectPlanDraftId", "workspaceId"]);
    assert.ok(!action.required.includes("approvedByMemberId"), "approvedByMemberId is optional");
  });

  it("agent-actions.md documents task.assign action and cross-domain payload shapes", () => {
    const content = read("docs/contracts/agent-actions.md");
    assert.match(content, /task\.assign/);
    assert.match(content, /TaskAssignAction/);
    assert.match(content, /## Cross-Domain Payload Shapes/);
    assert.match(content, /MeetingReportGenerateAction/);
    assert.match(content, /ReviewAnalysisGenerateAction/);
    assert.match(content, /PlanningApproveAction/);
  });
});

describe("PullRequestChangedFileSummary fixture integrity", () => {
  it("pullRequestChangedFiles entries have unique paths", () => {
    const fixture = JSON.parse(read("docs/contracts/fixtures/workspace-dashboard.fixture.json"));
    const paths = fixture.pullRequestChangedFiles.map((f) => f.path);
    const uniquePaths = new Set(paths);
    assert.equal(uniquePaths.size, paths.length, "each pullRequestChangedFile must have a unique path");
  });

  it("pullRequestChangedFiles changes equals additions plus deletions for each file", () => {
    const fixture = JSON.parse(read("docs/contracts/fixtures/workspace-dashboard.fixture.json"));
    for (const file of fixture.pullRequestChangedFiles) {
      assert.equal(
        file.changes,
        file.additions + file.deletions,
        `changes must equal additions + deletions for ${file.path}`
      );
    }
  });

  it("pullRequestChangedFiles status values are valid schema enum values", () => {
    const schema = JSON.parse(read("docs/contracts/schemas/pilo-public-contracts.schema.json"));
    const fixture = JSON.parse(read("docs/contracts/fixtures/workspace-dashboard.fixture.json"));
    const validStatuses = schema.$defs.PullRequestChangedFileSummary.properties.status.enum;
    for (const file of fixture.pullRequestChangedFiles) {
      assert.ok(
        validStatuses.includes(file.status),
        `file status '${file.status}' must be a valid PullRequestChangedFileSummary status`
      );
    }
  });

  it("PullRequestChangedFileSummary status enum covers all expected GitHub file change types", () => {
    const schema = JSON.parse(read("docs/contracts/schemas/pilo-public-contracts.schema.json"));
    const statusEnum = schema.$defs.PullRequestChangedFileSummary.properties.status.enum;
    for (const expected of ["added", "modified", "removed", "renamed", "copied", "changed", "unchanged"]) {
      assert.ok(statusEnum.includes(expected), `status enum must include '${expected}'`);
    }
  });

  it("pullRequestChangedFiles patch values are either non-empty strings or null", () => {
    const fixture = JSON.parse(read("docs/contracts/fixtures/workspace-dashboard.fixture.json"));
    for (const file of fixture.pullRequestChangedFiles) {
      if (file.patch !== null) {
        assert.equal(typeof file.patch, "string");
        assert.ok(file.patch.length > 0, `patch must be non-empty string when present in ${file.path}`);
      }
    }
  });
});

describe("env example and infra secrets alignment", () => {
  it(".env.example contains GITHUB_APP_SLUG in the GitHub repository integration section", () => {
    const env = read(".env.example");
    assert.match(env, /GITHUB_APP_SLUG=/);
    const lines = env.split("\n");
    const slugIndex = lines.findIndex((l) => l.startsWith("GITHUB_APP_SLUG="));
    const appIdIndex = lines.findIndex((l) => l.startsWith("GITHUB_APP_ID="));
    assert.ok(slugIndex !== -1, "GITHUB_APP_SLUG must exist");
    assert.ok(appIdIndex !== -1, "GITHUB_APP_ID must exist");
    assert.ok(Math.abs(slugIndex - appIdIndex) <= 3, "GITHUB_APP_SLUG must be near GITHUB_APP_ID");
  });

  it("secrets.md lists GITHUB_APP_SLUG as a plain ECS environment variable, not a secret", () => {
    const content = read("docs/infra/secrets.md");
    assert.match(content, /GITHUB_APP_SLUG/);
    const secretsSection = content.slice(content.indexOf("## 3. AWS Secrets Manager"), content.indexOf("## 4. ECS"));
    assert.doesNotMatch(secretsSection, /GITHUB_APP_SLUG/, "GITHUB_APP_SLUG must not be in Secrets Manager");
    const ecsSection = content.slice(content.indexOf("## 4. ECS"));
    assert.match(ecsSection, /GITHUB_APP_SLUG/, "GITHUB_APP_SLUG must be in ECS environment variables");
  });

  it("secrets.md keeps GitHub App private key and webhook secret as managed secrets, not env vars", () => {
    const content = read("docs/infra/secrets.md");
    const secretsSection = content.slice(content.indexOf("## 3. AWS Secrets Manager"), content.indexOf("## 4. ECS"));
    assert.match(secretsSection, /GITHUB_APP_PRIVATE_KEY/);
    assert.match(secretsSection, /GITHUB_WEBHOOK_SECRET/);
    assert.match(secretsSection, /GITHUB_APP_ID/);
  });
});

describe("task contract new endpoint documentation", () => {
  it("task.md documents task draft approve and reject endpoints", () => {
    const content = read("docs/contracts/task.md");
    assert.match(content, /\/task-drafts\/:draftId\/approve/);
    assert.match(content, /\/task-drafts\/:draftId\/reject/);
    assert.match(content, /\/workspaces\/:workspaceId\/task-drafts/);
  });

  it("task.md documents milestone CRUD endpoints", () => {
    const content = read("docs/contracts/task.md");
    assert.match(content, /\/workspaces\/:workspaceId\/milestones/);
    assert.match(content, /\/milestones\/:milestoneId/);
    assert.match(content, /MilestoneSummary/);
    assert.match(content, /TaskDraft/);
  });

  it("task.md documents DELETE task soft-delete endpoint", () => {
    const content = read("docs/contracts/task.md");
    assert.match(content, /DELETE.*\/tasks\/:taskId/);
    assert.match(content, /soft.?delete|soft delete/i);
  });

  it("task.md documents TaskStatusUpdateAction and TaskAssignAction read models", () => {
    const content = read("docs/contracts/task.md");
    assert.match(content, /TaskStatusUpdateAction/);
    assert.match(content, /TaskAssignAction/);
  });
});

describe("auth contract boundary naming", () => {
  it("auth.md uses real owner names instead of A/B placeholder aliases", () => {
    const content = read("docs/contracts/auth.md");
    assert.doesNotMatch(content, /\bA는\b|\bB는\b/);
    assert.match(content, /동현/);
    assert.match(content, /주형/);
  });

  it("auth.md boundary section clarifies GitHub App installation is owned by 주형", () => {
    const content = read("docs/contracts/auth.md");
    assert.match(content, /GitHub App/);
    assert.match(content, /주형.*GitHub|GitHub.*주형/s);
    assert.match(content, /Repository 선택|Issue\/PR|Webhook/);
  });
});

describe("schemas README lists new contract types", () => {
  it("schemas/README.md documents all new 주형 task/github/progress types", () => {
    const content = read("docs/contracts/schemas/README.md");
    for (const typeName of [
      "TaskDraft",
      "MilestoneSummary",
      "TaskStatusUpdateAction",
      "TaskAssignAction",
      "GithubConnectionSummary",
      "GithubRepositorySummary",
      "GithubIssueCreateAction",
      "PullRequestChangedFileSummary",
      "ProgressSnapshotSummary",
    ]) {
      assert.match(content, new RegExp(typeName), `schemas/README.md must list ${typeName}`);
    }
  });
});
