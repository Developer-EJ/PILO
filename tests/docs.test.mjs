import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const requireFromAppServer = createRequire(path.join(ROOT, "apps/app-server/package.json"));

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function assertFileContains(relPath, pattern, message) {
  assert.match(read(relPath), pattern, message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DOMAIN_FRAGMENTS = [
  {
    domain: "auth",
    owner: "@ndh5178",
    operations: ["getCurrentUser", "resolveWorkspacePermission"],
    defs: [
      "CurrentUser",
      "WorkspacePermissionAction",
      "WorkspacePermissionResolveRequest",
      "WorkspacePermissionDecision",
    ],
  },
  {
    domain: "workspace",
    owner: "@ndh5178",
    operations: ["listWorkspaceSummaries", "listWorkspaceMembers"],
    defs: ["WorkspaceSummary", "WorkspaceMemberSummary"],
  },
  {
    domain: "canvas",
    owner: "@ndh5178",
    operations: ["listCanvasBoards"],
    defs: ["CanvasBoardSummary", "CanvasBoardDetail", "CanvasShapeRequest", "CanvasConnectionRequest"],
  },
  {
    domain: "task",
    owner: "@rlawngud0428",
    operations: ["listTaskSummaries", "createTaskDraft"],
    defs: ["TaskSummary", "TaskCreateDraft", "TaskCreateDraftRequest", "TaskStatusUpdateAction", "TaskAssignAction"],
  },
  {
    domain: "github",
    owner: "@rlawngud0428",
    operations: ["listGithubRepositories", "listGithubIssueSummaries", "listPullRequestSummaries"],
    defs: [
      "GithubRepositorySummary",
      "GithubIssueSummary",
      "GithubIssueSummaryPage",
      "GithubIssueCreateAction",
      "PullRequestSummary",
      "PullRequestSummaryPage",
    ],
  },
  {
    domain: "progress",
    owner: "@rlawngud0428",
    operations: ["getProgressSummary"],
    defs: ["ProgressSummary"],
  },
  {
    domain: "meeting",
    owner: "@jinhokingofworld",
    operations: ["listMeetingReportSummaries"],
    defs: ["MeetingReportSummary", "MeetingActionItem", "MeetingDecisionSummary", "MeetingReportGenerateAction"],
  },
  {
    domain: "review",
    owner: "@Developer-EJ",
    operations: ["listPrAnalysisSummaries"],
    defs: ["PRAnalysisSummary", "ReviewNodeSummary", "ReviewRiskSummary", "ReviewAnalysisGenerateAction"],
  },
  {
    domain: "agent",
    owner: "@Sein0104",
    operations: ["listAgentActions"],
    defs: ["AgentAction", "AgentActionPage", "AgentRecommendation", "AgentJobMessage", "AgentResultMessage"],
  },
  {
    domain: "planning",
    owner: "@Sein0104",
    operations: ["listPlanningDrafts"],
    defs: ["ProjectPlanDraftSummary", "ProjectPlanDraftSummaryPage", "PlanningApproveAction"],
  },
  {
    domain: "common-system",
    owner: "@Sein0104",
    operations: ["createNotification"],
    defs: [
      "ApiErrorCode",
      "ValidationErrorDetail",
      "ApiErrorResponse",
      "PaginationSort",
      "PaginationQuery",
      "PageInfo",
      "NotificationType",
      "NotificationCreateRequest",
      "SharedFileRef",
    ],
  },
];

const CENTRAL_FILES = [
  "docs/contracts/openapi/pilo-public-api.yaml",
  "docs/contracts/schemas/pilo-public-contracts.schema.json",
  "apps/app-server/src/common/contracts/public-contracts.ts",
  "apps/frontend/lib/types/public-contracts.ts",
  "apps/ai-worker/app/common/schemas/public_contracts.py",
  "docs/db/pilo_erd_schema.sql",
  "apps/app-server/prisma/schema.prisma",
  "apps/app-server/prisma/migrations/**",
  "docs/contracts/fixtures/workspace-dashboard.fixture.json",
  "apps/frontend/app/page.tsx",
];

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
    "docs/contracts/integration-guardrails.md",
    "docs/contracts/openapi/README.md",
    "docs/contracts/openapi/pilo-public-api.yaml",
  ];

  for (const file of requiredContracts) {
    it(`${file} exists`, () => {
      assert.ok(exists(file), `${file} must exist`);
      assert.ok(read(file).length > 0, `${file} must not be empty`);
    });
  }

  it("contract index maps every owner to their contract files", () => {
    const content = read("docs/contracts/README.md");
    for (const token of [
      "동현",
      "주형",
      "진호",
      "은재",
      "세인",
      "workspace.md",
      "canvas.md",
      "task.md",
      "review.md",
      "agent-actions.md",
      "openapi/pilo-public-api.yaml",
    ]) {
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

describe("domain-owned contract fragments", () => {
  it("public contract fragments are split by domain owner", () => {
    const codeowners = read(".github/CODEOWNERS");

    for (const { domain, owner } of DOMAIN_FRAGMENTS) {
      const openApiFragment = `docs/contracts/openapi/domains/${domain}.paths.yaml`;
      const schemaFragment = `docs/contracts/schemas/domains/${domain}.schema.json`;
      assert.ok(exists(openApiFragment), `${openApiFragment} must exist`);
      assert.ok(exists(schemaFragment), `${schemaFragment} must exist`);
      assert.match(
        codeowners,
        new RegExp(`/docs/contracts/openapi/domains/${escapeRegExp(domain)}\\.paths\\.yaml\\s+${escapeRegExp(owner)}`),
      );
      assert.match(
        codeowners,
        new RegExp(`/docs/contracts/schemas/domains/${escapeRegExp(domain)}\\.schema\\.json\\s+${escapeRegExp(owner)}`),
      );
    }
  });

  it("domain OpenAPI fragments cover the bundled operation ids", () => {
    for (const { domain, operations } of DOMAIN_FRAGMENTS) {
      const fragment = read(`docs/contracts/openapi/domains/${domain}.paths.yaml`);
      for (const operationId of operations) {
        assert.match(fragment, new RegExp(`operationId:\\s*${operationId}\\b`));
      }
    }
  });

  it("domain schema fragments declare their owned bundled definitions", () => {
    for (const { domain, owner, defs } of DOMAIN_FRAGMENTS) {
      const fragment = JSON.parse(read(`docs/contracts/schemas/domains/${domain}.schema.json`));
      assert.equal(fragment["x-owner"], owner);
      assert.equal(fragment["x-bundle"], "../pilo-public-contracts.schema.json");
      for (const defName of defs) {
        assert.ok(fragment["x-ownedDefs"].includes(defName), `${domain} must own ${defName}`);
      }
    }
  });
});

describe("public API contract", () => {
  const openApiPath = "docs/contracts/openapi/pilo-public-api.yaml";

  it("declares the cross-domain API surface in OpenAPI", () => {
    const content = read(openApiPath);
    assert.match(content, /openapi: 3\.1\.0/);
    assert.match(content, /title: PILO Public API Contract/);

    for (const pathToken of [
      "/auth/me:",
      "/workspaces/{workspaceId}/permissions/resolve:",
      "/workspaces:",
      "/workspaces/{workspaceId}/members:",
      "/workspaces/{workspaceId}/canvas/boards:",
      "/workspaces/{workspaceId}/tasks/summary:",
      "/workspaces/{workspaceId}/tasks/drafts:",
      "/workspaces/{workspaceId}/github/repositories:",
      "/workspaces/{workspaceId}/github/issues:",
      "/workspaces/{workspaceId}/progress/summary:",
      "/workspaces/{workspaceId}/meetings/reports/summary:",
      "/workspaces/{workspaceId}/review/pr-analyses/summary:",
      "/workspaces/{workspaceId}/agent/actions:",
      "/workspaces/{workspaceId}/planning/drafts:",
      "/notifications:",
    ]) {
      assert.match(content, new RegExp(pathToken.replace(/[{}]/g, "\\$&")));
    }
  });

  it("keeps OpenAPI operation ids unique and schema names aligned", () => {
    const content = read(openApiPath);
    const operationIds = [...content.matchAll(/operationId:\s*([A-Za-z0-9_]+)/g)].map(
      (match) => match[1],
    );
    assert.ok(operationIds.length >= 13, "OpenAPI contract should name core operations");
    assert.equal(operationIds.length, new Set(operationIds).size);

    for (const schemaName of [
      "CurrentUser",
      "WorkspacePermissionResolveRequest",
      "WorkspaceSummary",
      "WorkspaceMemberSummary",
      "CanvasBoardSummary",
      "CanvasBoardDetail",
      "TaskSummary",
      "TaskCreateDraft",
      "TaskCreateDraftRequest",
      "GithubRepositorySummary",
      "GithubIssueSummary",
      "GithubIssueSummaryPage",
      "ProgressSummary",
      "PullRequestSummary",
      "PullRequestSummaryPage",
      "MeetingReportSummary",
      "MeetingActionItem",
      "PRAnalysisSummary",
      "ReviewNodeSummary",
      "AgentAction",
      "AgentActionPage",
      "AgentJobMessage",
      "AgentResultMessage",
      "ProjectPlanDraftSummary",
      "ProjectPlanDraftSummaryPage",
      "NotificationCreateRequest",
      "ApiErrorResponse",
      "ValidationErrorDetail",
      "PaginationQuery",
      "PageInfo",
      "WorkspacePermissionDecision",
    ]) {
      assert.match(content, new RegExp(schemaName));
    }
  });

  it("resolves OpenAPI refs, path parameters, and default error responses", () => {
    const yaml = requireFromAppServer("js-yaml");
    const openapi = yaml.load(read(openApiPath));
    const schema = JSON.parse(read("docs/contracts/schemas/pilo-public-contracts.schema.json"));
    const schemaDefs = new Set(Object.keys(schema.$defs));
    const errors = [];
    const operationIds = [];

    function resolveLocalRef(ref) {
      if (!ref.startsWith("#/")) {
        return undefined;
      }

      return ref
        .slice(2)
        .split("/")
        .reduce((current, part) => {
          const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
          return current && typeof current === "object" ? current[key] : undefined;
        }, openapi);
    }

    function deref(node) {
      if (node && typeof node === "object" && "$ref" in node) {
        return resolveLocalRef(node.$ref) ?? node;
      }
      return node;
    }

    for (const [apiPath, pathItem] of Object.entries(openapi.paths)) {
      const pathParams = [...apiPath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method.startsWith("x-")) {
          continue;
        }

        const location = `${method.toUpperCase()} ${apiPath}`;
        if (!operation.operationId) {
          errors.push(`${location}: missing operationId`);
        } else {
          operationIds.push(operation.operationId);
        }

        const declaredPathParams = new Set(
          (operation.parameters ?? [])
            .map(deref)
            .filter((parameter) => parameter?.in === "path")
            .map((parameter) => parameter.name),
        );
        for (const pathParam of pathParams) {
          if (!declaredPathParams.has(pathParam)) {
            errors.push(`${location}: missing path parameter ${pathParam}`);
          }
        }

        if (!operation.responses?.default) {
          errors.push(`${location}: missing default ApiError response`);
        }
      }
    }

    function walkRefs(node, visit) {
      if (Array.isArray(node)) {
        for (const item of node) {
          walkRefs(item, visit);
        }
        return;
      }
      if (!node || typeof node !== "object") {
        return;
      }
      if (typeof node.$ref === "string") {
        visit(node.$ref);
      }
      for (const value of Object.values(node)) {
        walkRefs(value, visit);
      }
    }

    walkRefs(openapi, (ref) => {
      if (ref.startsWith("../schemas/pilo-public-contracts.schema.json#/$defs/")) {
        const defName = ref.split("/").at(-1);
        if (!schemaDefs.has(defName)) {
          errors.push(`missing JSON Schema definition ${defName}`);
        }
        return;
      }

      if (ref.startsWith("#/")) {
        if (!resolveLocalRef(ref)) {
          errors.push(`missing OpenAPI component ${ref}`);
        }
        return;
      }

      errors.push(`unsupported OpenAPI ref ${ref}`);
    });

    const duplicateOperationIds = [
      ...new Set(operationIds.filter((id, index) => operationIds.indexOf(id) !== index)),
    ];
    for (const operationId of duplicateOperationIds) {
      errors.push(`duplicate operationId ${operationId}`);
    }

    assert.deepEqual(errors, []);
    assert.equal(
      openapi.paths["/workspaces/{workspaceId}/permissions/resolve"].post.requestBody.content[
        "application/json"
      ].schema.$ref,
      "../schemas/pilo-public-contracts.schema.json#/$defs/WorkspacePermissionResolveRequest",
    );
    assert.equal(
      openapi.paths["/workspaces/{workspaceId}/planning/drafts"].get.responses["200"].content[
        "application/json"
      ].schema.$ref,
      "../schemas/pilo-public-contracts.schema.json#/$defs/ProjectPlanDraftSummaryPage",
    );
  });

  it("does not leave anonymous response item objects in OpenAPI", () => {
    const content = read(openApiPath);
    assert.doesNotMatch(
      content,
      /items:\s*\r?\n\s+type:\s+object/,
      "array response items must reference named schema definitions",
    );
  });

  it("keeps domain docs and agent briefs on canonical public routes", () => {
    const files = [
      "docs/contracts/canvas.md",
      "docs/contracts/task.md",
      "docs/contracts/meeting.md",
      "docs/contracts/review.md",
      "docs/contracts/agent-actions.md",
      "docs/contracts/planning.md",
      "docs/agents/donghyun-auth-workspace-canvas.md",
      "docs/agents/juhyung-task-github-progress.md",
      "docs/agents/jinho-meeting-report.md",
      "docs/agents/eunjae-pr-review.md",
      "docs/agents/sein-agent-planning.md",
    ];
    const combined = files.map((file) => read(file)).join("\n");

    for (const deprecatedRoute of [
      "`/workspaces/:workspaceId/tasks`",
      "/workspaces/:workspaceId/task-drafts",
      "/workspaces/:workspaceId/canvas-boards",
      "/canvas-boards/:boardId",
      "/workspaces/:workspaceId/meeting-reports/recent",
      "/workspaces/:workspaceId/agent-actions",
      "/workspaces/:workspaceId/project-plan-drafts",
    ]) {
      assert.doesNotMatch(combined, new RegExp(deprecatedRoute.replace(/[/:]/g, "\\$&")));
    }

    for (const canonicalRoute of [
      "/workspaces/:workspaceId/canvas/boards",
      "/workspaces/:workspaceId/tasks/summary",
      "/workspaces/:workspaceId/tasks/drafts",
      "/workspaces/:workspaceId/github/issues",
      "/workspaces/:workspaceId/github/pull-requests",
      "/workspaces/:workspaceId/meetings/reports/summary",
      "/workspaces/:workspaceId/review/pr-analyses/summary",
      "/workspaces/:workspaceId/agent/actions",
      "/workspaces/:workspaceId/planning/drafts",
    ]) {
      assert.match(combined, new RegExp(canonicalRoute.replace(/[/:]/g, "\\$&")));
    }
  });

  it("documents OpenAPI as a machine-readable contract", () => {
    assert.match(read("docs/contracts/README.md"), /openapi\/pilo-public-api\.yaml/);
    assert.match(
      read("docs/contracts/contract-change-rules.md"),
      /docs\/contracts\/openapi\/pilo-public-api\.yaml/,
    );
  });

  it("OpenAPI README requires fragment-first updates and serialized bundle integration", () => {
    const readme = read("docs/contracts/openapi/README.md");
    assert.match(readme, /Feature PRs edit only domain OpenAPI fragments/);
    assert.match(readme, /Contract integration PRs serialize bundle updates/);
    assert.doesNotMatch(readme, /same PR[\s\S]{0,120}pilo-public-api\.yaml/);
  });

  it("uses ApiErrorResponse for operation failures", () => {
    const content = read(openApiPath);
    const operationCount = [...content.matchAll(/operationId:\s*([A-Za-z0-9_]+)/g)].length;
    const defaultErrorCount = [
      ...content.matchAll(/default:\s*\r?\n\s+\$ref:\s+"#\/components\/responses\/ApiError"/g),
    ].length;

    assert.match(content, /responses:\s*\r?\n\s+ApiError:/);
    assert.match(content, /ApiErrorResponse/);
    assert.equal(defaultErrorCount, operationCount);
  });

  it("paginates growing list APIs instead of returning raw arrays", () => {
    const content = read(openApiPath);

    for (const pageSchema of [
      "AgentActionPage",
      "ProjectPlanDraftSummaryPage",
      "GithubIssueSummaryPage",
      "PullRequestSummaryPage",
    ]) {
      assert.match(content, new RegExp(`#\\/\\$defs\\/${pageSchema}`));
      assert.match(read("docs/contracts/schemas/pilo-public-contracts.schema.json"), new RegExp(`"${pageSchema}"`));
      assert.match(read("apps/app-server/src/common/contracts/public-contracts.ts"), new RegExp(`(?:interface|type) ${pageSchema}`));
      assert.match(read("apps/frontend/lib/types/public-contracts.ts"), new RegExp(`(?:interface|type) ${pageSchema}`));
      assert.match(read("apps/ai-worker/app/common/schemas/public_contracts.py"), new RegExp(`class ${pageSchema}\\(TypedDict\\)`));
    }

    for (const operationId of [
      "listAgentActions",
      "listPlanningDrafts",
      "listGithubIssueSummaries",
      "listPullRequestSummaries",
    ]) {
      const operationStart = content.indexOf(`operationId: ${operationId}`);
      const operationResponses = content.indexOf("responses:", operationStart);
      const operationBlock = content.slice(operationStart, operationResponses);
      assert.match(operationBlock, /#\/components\/parameters\/cursor/);
      assert.match(operationBlock, /#\/components\/parameters\/limit/);
      assert.match(operationBlock, /#\/components\/parameters\/sort/);
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

  it("shared rules define current public API and allowed fill points", () => {
    const rules = read("docs/agents/shared-implementation-rules.md");
    assert.match(rules, /Only OpenAPI paths are current cross-domain public APIs/);
    assert.match(rules, /Allowed Fill Points/);
    assert.match(rules, /apps\/app-server\/src\/modules\/<domain>\/<domain>\.service\.ts/);
    assert.match(rules, /contract PR first/);
  });

  it("shared rules forbid direct central file edits in feature PRs", () => {
    const rules = read("docs/agents/shared-implementation-rules.md");
    assert.match(rules, /Central Files Are Read-Only in Feature PRs/);
    assert.match(rules, /Feature PRs must not directly edit central files/);
    assert.match(rules, /Feature PRs that do not touch central files may proceed normally/);
    assert.match(rules, /reclassify the PR as a Contract Integration PR/);
    assert.match(rules, /Do not merge central-file changes as a normal feature PR/);
    for (const centralFile of CENTRAL_FILES) {
      assert.match(rules, new RegExp(escapeRegExp(centralFile)));
    }
    for (const ownerLocalPath of [
      "docs/contracts/openapi/domains/<domain>.paths.yaml",
      "docs/contracts/schemas/domains/<domain>.schema.json",
      "docs/db/domains/<domain>.tables.sql",
      "apps/app-server/prisma/domains/<domain>.prisma",
    ]) {
      assert.match(rules, new RegExp(escapeRegExp(ownerLocalPath)));
    }
  });

  it("collaboration guide does not point to deprecated domain paths or missing contract docs", () => {
    const content = read("docs/agent-collaboration-guide.md");
    assert.doesNotMatch(content, /docs\/contracts\/agent\.md/);
    assert.doesNotMatch(content, /apps\/frontend\/src\/domains/);
    assert.doesNotMatch(content, /apps\/app-server\/src\/domains/);
    assert.doesNotMatch(content, /apps\/ai-worker\/app\/domains/);
  });

  it("agent README sends workers to owner-local fragments before central read-only files", () => {
    const content = read("docs/agents/README.md");
    assert.match(content, /본인 domain OpenAPI\/Schema fragment를 먼저 확인한다/);
    assert.match(content, /본인 domain DB\/Prisma shard를 먼저 확인한다/);
    assert.match(content, /중앙 bundle\/schema\/fixture\/DB 파일은 읽기 전용으로 확인한다/);
    assert.match(content, /Contract Integration PR로 분리한다/);
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
      "CanvasBoardSummary",
      "CanvasBoardDetail",
      "CanvasShapeRequest",
      "CanvasConnectionRequest",
      "TaskSummary",
      "TaskCreateDraft",
      "TaskCreateDraftRequest",
      "GithubRepositorySummary",
      "ProgressSummary",
      "GithubIssueSummary",
      "PullRequestSummary",
      "MeetingReportSummary",
      "MeetingActionItem",
      "MeetingDecisionSummary",
      "PRAnalysisSummary",
      "ReviewNodeSummary",
      "ReviewRiskSummary",
      "ReviewRiskType",
      "CanvasEntityRef",
      "ContractOwner",
      "CrossDomainEntityType",
      "ApiErrorCode",
      "ValidationErrorDetail",
      "ApiErrorResponse",
      "PaginationSort",
      "PaginationQuery",
      "PageInfo",
      "WorkspacePermissionAction",
      "WorkspacePermissionResolveRequest",
      "WorkspacePermissionDecision",
      "AgentAction",
      "AgentActionPage",
      "AgentRecommendation",
      "AgentWorkflowType",
      "AgentContextRef",
      "MeetingReportWorkflowInput",
      "ReviewAnalysisWorkflowInput",
      "PlanningWorkflowInput",
      "TaskDraftWorkflowInput",
      "GithubIssueDraftWorkflowInput",
      "OrchestratorRunWorkflowInput",
      "TaskAssignAction",
      "TaskStatusUpdateAction",
      "GithubIssueCreateAction",
      "MeetingReportGenerateAction",
      "ReviewAnalysisGenerateAction",
      "PlanningApproveAction",
      "ProjectPlanDraftSummary",
      "AgentJobMessage",
      "AgentTraceMetadata",
      "AgentTraceEntry",
      "MeetingReportWorkflowOutput",
      "ReviewAnalysisWorkflowOutput",
      "PlanningWorkflowOutput",
      "TaskDraftWorkflowOutput",
      "GithubIssueDraftWorkflowOutput",
      "OrchestratorRunWorkflowOutput",
      "AgentResultMessage",
      "NotificationType",
      "NotificationCreateRequest",
      "SharedFileRef",
      "GithubIssueSummaryPage",
      "PullRequestSummaryPage",
      "ProjectPlanDraftSummaryPage",
    ]) {
      assert.ok(defs[name], `schema must define ${name}`);
    }
  });

  it("HTTP task draft body does not duplicate path workspaceId", () => {
    const schema = JSON.parse(read(schemaPath));
    const draftRequest = schema.$defs.TaskCreateDraftRequest;
    assert.ok(draftRequest, "schema must define TaskCreateDraftRequest for HTTP body");
    assert.deepEqual(draftRequest.required, ["title"]);
    assert.ok(!draftRequest.properties.workspaceId);

    assertFileContains(
      "docs/contracts/openapi/pilo-public-api.yaml",
      /TaskCreateDraftRequest/,
      "OpenAPI must use the request-body-only draft schema",
    );
  });

  it("TypeScript mirrors define every advertised cross-domain read model", () => {
    const appServer = read("apps/app-server/src/common/contracts/public-contracts.ts");
    const frontend = read("apps/frontend/lib/types/public-contracts.ts");

    for (const name of [
      "CanvasEntityRef",
      "ContractOwner",
      "CrossDomainEntityType",
      "ApiErrorCode",
      "ValidationErrorDetail",
      "ApiErrorResponse",
      "PaginationSort",
      "PaginationQuery",
      "PageInfo",
      "WorkspacePermissionAction",
      "WorkspacePermissionResolveRequest",
      "WorkspacePermissionDecision",
      "CanvasShapeRequest",
      "CanvasConnectionRequest",
      "CanvasBoardDetail",
      "GithubIssueSummary",
      "GithubIssueSummaryPage",
      "PullRequestSummaryPage",
      "MeetingActionItem",
      "MeetingDecisionSummary",
      "ReviewNodeSummary",
      "ReviewRiskSummary",
      "ReviewRiskType",
      "AgentRecommendation",
      "AgentActionPage",
      "TaskAssignAction",
      "MeetingReportWorkflowInput",
      "ReviewAnalysisWorkflowInput",
      "PlanningWorkflowInput",
      "TaskDraftWorkflowInput",
      "GithubIssueDraftWorkflowInput",
      "OrchestratorRunWorkflowInput",
      "AgentJobMessage",
      "AgentTraceMetadata",
      "MeetingReportWorkflowOutput",
      "ReviewAnalysisWorkflowOutput",
      "PlanningWorkflowOutput",
      "TaskDraftWorkflowOutput",
      "GithubIssueDraftWorkflowOutput",
      "OrchestratorRunWorkflowOutput",
      "AgentResultMessage",
      "ProjectPlanDraftSummary",
      "ProjectPlanDraftSummaryPage",
      "NotificationType",
      "SharedFileRef",
    ]) {
      assert.match(appServer, new RegExp(`export (?:interface|type) ${name}\\b`));
      assert.match(frontend, new RegExp(`export (?:interface|type) ${name}\\b`));
    }
  });

  it("frontend mirror keeps key fields aligned with the backend TS contract", () => {
    const frontend = read("apps/frontend/lib/types/public-contracts.ts");

    for (const [interfaceName, fields] of [
      ["WorkspaceSummary", ["type", "createdAt"]],
      ["AgentActionBase", ["confirmedByMemberId", "confirmedAt", "executedAt"]],
      ["CanvasEntityRef", ["sourceOwner", "sourceTable"]],
    ]) {
      for (const field of fields) {
        assert.match(
          frontend,
          new RegExp(`export (?:interface|type) ${interfaceName}[\\s\\S]*\\b${field}\\??:`),
          `${interfaceName} must include ${field} in the frontend mirror`,
        );
      }
    }
  });

  it("agent action payloads are discriminated by action type", () => {
    const schema = JSON.parse(read(schemaPath));
    const agentAction = schema.$defs.AgentAction;
    assert.ok(Array.isArray(agentAction.oneOf), "AgentAction must use oneOf");

    const expected = {
      "task.create.draft": "TaskCreateDraft",
      "task.update.status": "TaskStatusUpdateAction",
      "task.assign": "TaskAssignAction",
      "github.issue.create": "GithubIssueCreateAction",
      "meeting.report.generate": "MeetingReportGenerateAction",
      "review.analysis.generate": "ReviewAnalysisGenerateAction",
      "planning.approve": "PlanningApproveAction",
    };

    for (const [type, schemaName] of Object.entries(expected)) {
      const variant = agentAction.oneOf.find(
        (entry) => entry.properties?.type?.const === type,
      );
      assert.ok(variant, `AgentAction must define a ${type} variant`);
      assert.equal(variant.properties.payload.$ref, `#/$defs/${schemaName}`);
    }
  });

  it("agent queue input and output schemas are discriminated by workflow type", () => {
    const schema = JSON.parse(read(schemaPath));
    const defs = schema.$defs;

    for (const [messageName, expectedRefs] of [
      [
        "AgentJobMessage",
        [
          "MeetingReportAgentJobMessage",
          "ReviewAnalysisAgentJobMessage",
          "PlanningAgentJobMessage",
          "TaskDraftAgentJobMessage",
          "GithubIssueDraftAgentJobMessage",
          "OrchestratorRunAgentJobMessage",
        ],
      ],
      [
        "AgentResultMessage",
        [
          "MeetingReportAgentResultMessage",
          "ReviewAnalysisAgentResultMessage",
          "PlanningAgentResultMessage",
          "TaskDraftAgentResultMessage",
          "GithubIssueDraftAgentResultMessage",
          "OrchestratorRunAgentResultMessage",
        ],
      ],
    ]) {
      assert.ok(Array.isArray(defs[messageName].oneOf), `${messageName} must use oneOf`);
      for (const refName of expectedRefs) {
        assert.ok(
          defs[messageName].oneOf.some((entry) => entry.$ref === `#/$defs/${refName}`),
          `${messageName} must include ${refName}`,
        );
        assert.ok(defs[refName], `schema must define ${refName}`);
      }
    }

    assert.equal(
      defs.MeetingReportAgentJobMessage.properties.input.$ref,
      "#/$defs/MeetingReportWorkflowInput",
    );
    assert.equal(
      defs.AgentResultMessageBase.properties.output.oneOf[0].$ref,
      "#/$defs/MeetingReportWorkflowOutput",
    );
  });

  it("public JSON Schema compiles with the project runtime validator settings", async () => {
    const Ajv2020 = requireFromAppServer("ajv/dist/2020");
    const addFormats = requireFromAppServer("ajv-formats");
    const schema = JSON.parse(read(schemaPath));
    const ajv = new Ajv2020({ strict: false, allErrors: true, coerceTypes: true });

    addFormats(ajv);
    ajv.addSchema(schema, "pilo-public-contracts.schema.json");

    for (const [defName, relPath] of [
      ["AgentJobMessage", "docs/contracts/fixtures/agent-job.fixture.json"],
      ["AgentResultMessage", "docs/contracts/fixtures/agent-result.fixture.json"],
    ]) {
      const validate = ajv.compile({ $ref: `pilo-public-contracts.schema.json#/$defs/${defName}` });
      const fixture = JSON.parse(read(relPath));
      assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
    }
  });

  it("does not leave unbounded object contracts in the public schema", () => {
    const schema = JSON.parse(read(schemaPath));
    const openObjects = [];

    function walk(node, pathParts) {
      if (!node || typeof node !== "object") {
        return;
      }

      if (
        node.type === "object" &&
        !node.properties &&
        !node.$ref &&
        !node.oneOf &&
        !node.anyOf &&
        !node.allOf &&
        node.additionalProperties === undefined
      ) {
        openObjects.push(pathParts.join("."));
      }

      for (const [key, value] of Object.entries(node)) {
        if (key === "enum" || key === "required") {
          continue;
        }
        if (Array.isArray(value)) {
          value.forEach((entry, index) => walk(entry, pathParts.concat(`${key}[${index}]`)));
        } else {
          walk(value, pathParts.concat(key));
        }
      }
    }

    walk(schema, ["$"]);
    assert.deepEqual(openObjects.filter((pathName) => pathName !== "$"), []);
  });

  it("task agent actions advertised in docs exist in every machine-readable mirror", () => {
    const taskDoc = read("docs/contracts/task.md");
    const schema = JSON.parse(read(schemaPath));
    const actionTypes = new Set(
      schema.$defs.AgentAction.oneOf.map((entry) => entry.properties.type.const),
    );
    const appServer = read("apps/app-server/src/common/contracts/public-contracts.ts");
    const frontend = read("apps/frontend/lib/types/public-contracts.ts");
    const worker = read("apps/ai-worker/app/common/schemas/public_contracts.py");

    const taskActionSection = taskDoc
      .split("## Agent Actions Consumed")[1]
      .split("\n## ")[0];

    for (const action of [...taskActionSection.matchAll(/`(task\.[a-z.]+)`/g)].map((match) => match[1])) {
      assert.ok(actionTypes.has(action), `${action} must be in JSON Schema AgentAction`);
      assert.match(appServer, new RegExp(action.replace(".", "\\.")));
      assert.match(frontend, new RegExp(action.replace(".", "\\.")));
      assert.match(worker, new RegExp(`"${action.replace(".", "\\.")}"`));
    }
  });

  it("GitHub issue summaries are exposed through public API stubs", () => {
    assertFileContains(
      "docs/contracts/openapi/pilo-public-api.yaml",
      /operationId: listGithubIssueSummaries/,
      "OpenAPI must expose the promised GitHub issue summary endpoint",
    );
    assertFileContains(
      "apps/app-server/src/modules/github/github.controller.ts",
      /\blistGithubIssueSummaries\b/,
      "app-server controller must pre-stub the GitHub issue summary handler",
    );
    assertFileContains(
      "apps/frontend/lib/api/github-api-contract.ts",
      /\blistGithubIssueSummaries\b/,
      "frontend API contract must expose the GitHub issue summary method",
    );
  });

  it("AI worker public mirror preserves required contract keys", () => {
    const worker = read("apps/ai-worker/app/common/schemas/public_contracts.py");
    for (const className of [
      "TaskCreateDraft",
      "TaskStatusUpdateAction",
      "TaskAssignAction",
      "GithubIssueCreateAction",
      "PlanningApproveAction",
      "AgentAction",
      "AgentJobMessage",
      "AgentResultMessage",
    ]) {
      assert.doesNotMatch(
        worker,
        new RegExp(`class ${className}\\(TypedDict, total=False\\)`),
        `${className} must not make required schema keys optional`,
      );
    }
    assert.match(worker, /NotRequired/);
  });

  it("public mirrors do not expose free-form cross-boundary payload objects", () => {
    const appServer = read("apps/app-server/src/common/contracts/public-contracts.ts");
    const frontend = read("apps/frontend/lib/types/public-contracts.ts");
    const worker = read("apps/ai-worker/app/common/schemas/public_contracts.py");
    const reportContract = read("apps/app-server/src/modules/report/public/report-public.contract.ts");

    assert.doesNotMatch(appServer, /Record<string, unknown>/);
    assert.doesNotMatch(frontend, /Record<string, unknown>/);
    assert.doesNotMatch(worker, /dict\[str, object\]/);
    assert.doesNotMatch(reportContract, /= object/);
  });

  it("shared error, pagination, and authorization contracts are mirrored in Python", () => {
    const worker = read("apps/ai-worker/app/common/schemas/public_contracts.py");

    for (const name of [
      "ApiErrorCode",
      "ValidationErrorDetail",
      "ApiErrorResponse",
      "PaginationSort",
      "PaginationQuery",
      "PageInfo",
      "WorkspacePermissionAction",
      "WorkspacePermissionDecision",
    ]) {
      assert.match(worker, new RegExp(`(?:class|${name}\\s*=) ${name}|${name}\\s*=`));
    }
  });

  it("workspace permission resolution derives actor identity outside the public body", () => {
    const schema = JSON.parse(read(schemaPath));
    const requestSchema = schema.$defs.WorkspacePermissionResolveRequest;
    const appServer = read("apps/app-server/src/common/contracts/public-contracts.ts");
    const frontend = read("apps/frontend/lib/types/public-contracts.ts");
    const worker = read("apps/ai-worker/app/common/schemas/public_contracts.py");
    const controller = read("apps/app-server/src/modules/auth/workspace-permission.controller.ts");
    const appRequest = appServer
      .split("export interface WorkspacePermissionResolveRequest {")[1]
      .split("}\n")[0];
    const frontendRequest = frontend
      .split("export interface WorkspacePermissionResolveRequest {")[1]
      .split("}\n")[0];
    const workerRequest = worker
      .split("class WorkspacePermissionResolveRequest(TypedDict):")[1]
      .split("\n\n")[0];

    assert.deepEqual(requestSchema.required, ["action"]);
    assert.equal(requestSchema.properties.actorMemberId, undefined);
    assert.doesNotMatch(appRequest, /actorMemberId/);
    assert.doesNotMatch(frontendRequest, /actorMemberId/);
    assert.doesNotMatch(workerRequest, /actorMemberId/);
    assert.match(controller, /@CurrentMember\(\) currentMember/);
    assert.match(controller, /currentMember\.memberId/);
  });

  it("planning draft summary has the same stable fields in schema and mirrors", () => {
    const schema = JSON.parse(read(schemaPath));
    const summary = schema.$defs.ProjectPlanDraftSummary;
    const appServer = read("apps/app-server/src/common/contracts/public-contracts.ts");
    const frontend = read("apps/frontend/lib/types/public-contracts.ts");
    const worker = read("apps/ai-worker/app/common/schemas/public_contracts.py");

    for (const field of [
      "featureDraftCount",
      "milestoneDraftCount",
      "riskCount",
      "createdAt",
      "updatedAt",
    ]) {
      assert.ok(summary.required.includes(field), `${field} must be required in JSON Schema`);
      assert.match(appServer, new RegExp(`${field}:`));
      assert.match(frontend, new RegExp(`${field}:`));
      assert.match(worker, new RegExp(`${field}:`));
    }
    assert.ok(summary.properties.targetUser, "targetUser must be explicitly defined");
    assert.match(appServer, /targetUser\?: string \| null/);
    assert.match(frontend, /targetUser\?: string \| null/);
    assert.match(worker, /targetUser: NotRequired\[str \| None\]/);
  });

  it("frontend and AI worker mirrors keep agent action enums narrow", () => {
    const frontend = read("apps/frontend/lib/types/public-contracts.ts");
    const worker = read("apps/ai-worker/app/common/schemas/public_contracts.py");

    assert.match(frontend, /export type AgentActionType =/);
    assert.match(frontend, /task\.update\.status/);
    assert.doesNotMatch(frontend, /type:\s*string;\s*\r?\n\s*source:\s*string;/);

    assert.match(worker, /AgentActionType = Literal\[/);
    assert.match(worker, /"task\.update\.status"/);
    assert.doesNotMatch(worker, /type:\s*str\s*\r?\n\s*source:\s*str/);
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

    for (const entity of fixture.canvasEntities) {
      assert.ok(entity.sourceOwner, "canvas fixture entities need sourceOwner");
      assert.ok(entity.sourceTable, "canvas fixture entities need sourceTable");
      assert.notEqual(entity.entityType, "pull_request");
      assert.notEqual(entity.shapeType, "pull_request");
    }
  });

  it("agent SQS fixtures exist and parse as JSON", () => {
    const job = JSON.parse(read("docs/contracts/fixtures/agent-job.fixture.json"));
    const result = JSON.parse(read("docs/contracts/fixtures/agent-result.fixture.json"));
    assert.equal(job.runId, result.runId);
    assert.equal(job.jobId, result.jobId);
    assert.equal(job.workflowType, result.workflowType);
    assert.ok(Number.isInteger(result.output.actionItemCount));
    assert.ok(Number.isInteger(result.output.decisionCount));
    assert.ok(Number.isInteger(result.output.riskCount));
    assert.ok(Array.isArray(result.actions));
  });

  it("fixture rules are documented and linked from bootstrap docs", () => {
    assert.ok(exists("docs/contracts/fixtures/README.md"));
    assert.match(read("agent.md"), /docs\/contracts\/fixtures/);
    assert.match(read("docs/contracts/README.md"), /docs\/contracts\/fixtures/);
  });

  it("shared fixtures have a single editing owner", () => {
    const codeowners = read(".github/CODEOWNERS");
    const readme = read("docs/contracts/fixtures/README.md");
    assert.match(
      codeowners,
      /\/docs\/contracts\/fixtures\/workspace-dashboard\.fixture\.json\s+@Developer-EJ/,
    );
    assert.match(readme, /Shared fixture owner: @Developer-EJ/);
    assert.match(readme, /Domain owners must not edit workspace-dashboard\.fixture\.json directly/);
  });
});

describe("github collaboration templates", () => {
  it("pull request template requires contract, mock, and DB sections", () => {
    const content = read(".github/PULL_REQUEST_TEMPLATE.md");
    for (const heading of [
      "PR Type",
      "Contract Impact",
      "Central File Restriction",
      "Integration Guardrails",
      "Runtime Validation",
      "Error / Pagination / Authorization",
      "Cross-Domain Access",
      "Mock / Stub",
      "DB / Migration",
      "Validation",
    ]) {
      assert.match(content, new RegExp(`## ${heading.replace("/", "\\/")}`));
    }
  });

  it("pull request template and contract rules block central file edits in feature PRs", () => {
    const template = read(".github/PULL_REQUEST_TEMPLATE.md");
    const rules = read("docs/contracts/contract-change-rules.md");

    assert.match(template, /This feature PR does not directly edit central files/);
    assert.match(template, /Feature PRs changed owner-local fragments\/shards instead of central files/);
    assert.match(template, /Feature PR - does not directly edit central files/);
    assert.match(template, /Contract Integration PR - serializes reviewed owner-local fragments\/shards into central files/);
    assert.match(template, /Do not merge central-file changes as a normal feature PR/);
    assert.match(template, /Runtime validation, error format, pagination, authorization, migration order, frontend assembly, and merge order/);
    assert.match(rules, /Feature PR Central File Restriction/);
    assert.match(rules, /Feature PRs must not directly edit central files/);
    assert.match(rules, /This does not block all PRs/);
    assert.match(rules, /Feature PR: no central files changed/);
    assert.match(rules, /Contract Integration PR: central files changed/);
    assert.match(rules, /split those changes out or reclassify the PR as a Contract Integration PR/);

    for (const centralFile of CENTRAL_FILES) {
      assert.match(template, new RegExp(escapeRegExp(centralFile)));
      assert.match(rules, new RegExp(escapeRegExp(centralFile)));
    }
  });

  it("issue templates exist for domain task and contract change", () => {
    assert.ok(exists(".github/ISSUE_TEMPLATE/domain-task.md"));
    assert.ok(exists(".github/ISSUE_TEMPLATE/contract-change.md"));
  });

  it("CI enforces central file restrictions and docs guardrails", () => {
    assert.ok(exists("scripts/check-central-file-edits.mjs"));
    const script = read("scripts/check-central-file-edits.mjs");
    assert.match(script, /Contract Integration PR/);
    assert.match(script, /docs\/contracts\/openapi\/domains\//);
    assert.match(script, /apps\/frontend\/app\/page\.tsx/);

    const workflow = read(".github/workflows/app-ci.yml");
    assert.match(workflow, /contract-guardrails/);
    assert.match(workflow, /scripts\/check-central-file-edits\.mjs/);
    assert.match(workflow, /actions\/setup-node@v4/);
    assert.match(workflow, /cache-dependency-path: apps\/app-server\/package-lock\.json/);
    assert.match(workflow, /npm ci --prefix apps\/app-server/);
    assert.match(workflow, /node --test tests\/docs\.test\.mjs/);
  });

  it("integration guardrails cover runtime validation and merge sequencing", () => {
    const guardrails = read("docs/contracts/integration-guardrails.md");
    for (const token of [
      "CI Central File Guard",
      "Runtime Validation",
      "ApiErrorResponse",
      "PaginationQuery",
      "WorkspacePermissionDecision",
      "Migration Integration PR",
      "Frontend Integration PR",
      "Merge Order",
    ]) {
      assert.match(guardrails, new RegExp(escapeRegExp(token)));
    }
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

  it("server Dockerfiles expose the documented default ports", () => {
    assert.match(read("apps/app-server/Dockerfile"), /EXPOSE 4000/);
    assert.match(read("apps/realtime-server/Dockerfile"), /EXPOSE 4001/);
  });

  it("runtime Docker images include the public contract schema", () => {
    const schemaPathPattern =
      /docs\/contracts\/schemas\/pilo-public-contracts\.schema\.json/;
    const dockerCi = read(".github/workflows/docker-ci.yml");
    const deployAppServer = read(".github/workflows/deploy-app-server.yml");
    const deployAiWorker = read(".github/workflows/deploy-ai-worker.yml");

    assert.match(read("apps/app-server/Dockerfile"), schemaPathPattern);
    assert.match(read("apps/ai-worker/Dockerfile"), schemaPathPattern);
    assert.match(dockerCi, /context: \./);
    assert.match(dockerCi, /file: apps\/app-server\/Dockerfile/);
    assert.match(dockerCi, /file: apps\/ai-worker\/Dockerfile/);
    assert.match(deployAppServer, /context: \./);
    assert.match(deployAppServer, /file: apps\/app-server\/Dockerfile/);
    assert.match(deployAiWorker, /context: \./);
    assert.match(deployAiWorker, /file: apps\/ai-worker\/Dockerfile/);
  });

  it("app-server exposes a physical Prisma migration anchor", () => {
    assert.ok(exists("apps/app-server/prisma/README.md"));
    assert.ok(exists("apps/app-server/prisma/schema.prisma"));
    assert.ok(exists("apps/app-server/prisma/migrations/README.md"));
    assert.match(read("docs/dev-local-setup.md"), /apps\/app-server\/prisma\/migrations/);
  });

  it("DB and Prisma changes have domain-owned shard anchors", () => {
    const codeowners = read(".github/CODEOWNERS");

    for (const { domain, owner } of DOMAIN_FRAGMENTS) {
      const sqlShard = `docs/db/domains/${domain}.tables.sql`;
      const prismaShard = `apps/app-server/prisma/domains/${domain}.prisma`;
      assert.ok(exists(sqlShard), `${sqlShard} must exist`);
      assert.ok(exists(prismaShard), `${prismaShard} must exist`);
      assert.match(
        codeowners,
        new RegExp(`/docs/db/domains/${escapeRegExp(domain)}\\.tables\\.sql\\s+${escapeRegExp(owner)}`),
      );
      assert.match(
        codeowners,
        new RegExp(`/apps/app-server/prisma/domains/${escapeRegExp(domain)}\\.prisma\\s+${escapeRegExp(owner)}`),
      );
    }
  });
});

describe("parallel runtime ownership anchors", () => {
  it("realtime server registers domain modules instead of concentrating handlers in the root gateway", () => {
    for (const relPath of [
      "apps/realtime-server/src/canvas/canvas.module.ts",
      "apps/realtime-server/src/canvas/canvas.gateway.ts",
      "apps/realtime-server/src/meeting/meeting.module.ts",
      "apps/realtime-server/src/meeting/meeting.gateway.ts",
      "apps/realtime-server/src/voice/voice.module.ts",
      "apps/realtime-server/src/voice/voice.gateway.ts",
    ]) {
      assert.ok(exists(relPath), `${relPath} must exist`);
    }

    const appModule = read("apps/realtime-server/src/app.module.ts");
    for (const moduleName of ["CanvasModule", "MeetingModule", "VoiceModule"]) {
      assert.match(appModule, new RegExp(`\\b${moduleName}\\b`));
    }
  });

  it("AI worker exposes runtime anchors outside workflow owner folders", () => {
    for (const relPath of [
      "apps/ai-worker/app/runtime/__init__.py",
      "apps/ai-worker/app/runtime/action_router.py",
      "apps/ai-worker/app/runtime/registry.py",
      "apps/ai-worker/app/runtime/runner.py",
    ]) {
      assert.ok(exists(relPath), `${relPath} must exist`);
    }
  });

  it("AI worker action owner routing is composed from workflow-owned fragments", () => {
    const router = read("apps/ai-worker/app/runtime/action_router.py");
    assert.doesNotMatch(router, /OWNER_BY_ACTION_TYPE\s*:/);
    assert.match(router, /ACTION_OWNER_MAPS/);

    for (const workflow of ["task", "meeting", "review", "planning", "github"]) {
      const relPath = `apps/ai-worker/app/workflows/${workflow}/actions.py`;
      assert.ok(exists(relPath), `${relPath} must exist`);
      assert.match(read(relPath), /ACTION_OWNER_BY_TYPE/);
    }
  });

  it("AI worker GitHub workflow and common-system contract docs have explicit owners", () => {
    const codeowners = read(".github/CODEOWNERS");
    assert.match(codeowners, /\/apps\/ai-worker\/app\/workflows\/github\/\s+@rlawngud0428/);
    assert.match(codeowners, /\/docs\/contracts\/common-system\.md\s+@Sein0104/);
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
