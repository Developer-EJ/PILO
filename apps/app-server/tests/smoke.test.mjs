import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(APP_ROOT, relPath), "utf-8");
}

function exists(relPath) {
  return fs.existsSync(path.join(APP_ROOT, relPath));
}

describe("app-server package", () => {
  it("keeps the PILO app-server package name", () => {
    assert.equal(packageJson.name, "@pilo/app-server");
  });

  it("declares direct runtime contract validation dependencies", () => {
    assert.equal(packageJson.dependencies.ajv, "8.20.0");
    assert.equal(packageJson.dependencies["ajv-formats"], "3.0.1");
  });
});

describe("app-server domain scaffold", () => {
  const domains = [
    ["auth", "AuthModule"],
    ["workspace", "WorkspaceModule"],
    ["canvas", "CanvasModule"],
    ["task", "TaskModule"],
    ["github", "GithubModule"],
    ["progress", "ProgressModule"],
    ["meeting", "MeetingModule"],
    ["report", "ReportModule"],
    ["review", "ReviewModule"],
    ["agent", "AgentModule"],
    ["planning", "PlanningModule"],
    ["common-system", "CommonSystemModule"],
  ];

  for (const [domain] of domains) {
    it(`${domain} owns the expected NestJS scaffold files`, () => {
      for (const relPath of [
        `src/modules/${domain}/${domain}.module.ts`,
        `src/modules/${domain}/${domain}.controller.ts`,
        `src/modules/${domain}/${domain}.service.ts`,
        `src/modules/${domain}/${domain}.repository.ts`,
        `src/modules/${domain}/dto/${domain}.dto.ts`,
        `src/modules/${domain}/public/${domain}-public.contract.ts`,
      ]) {
        assert.ok(exists(relPath), `${relPath} must exist`);
      }
    });
  }

  it("imports every domain module once from app.module.ts", () => {
    const appModule = read("src/app.module.ts");

    for (const [, moduleName] of domains) {
      assert.match(appModule, new RegExp(`\\b${moduleName}\\b`));
    }
  });

  it("keeps shared contract and database ports outside owner modules", () => {
    assert.ok(exists("src/common/contracts/public-contracts.ts"));
    assert.ok(exists("src/common/database/database.module.ts"));
    assert.ok(exists("src/common/database/database.port.ts"));
    assert.ok(exists("src/common/validation/contract-validation.module.ts"));
    assert.ok(exists("src/common/validation/contract-validation.service.ts"));
    assert.ok(
      exists("src/common/validation/contract-validation.interceptor.ts"),
    );
    assert.ok(
      exists("src/common/validation/contract-validation.decorators.ts"),
    );
  });

  it("registers contract validation globally before domain handlers run", () => {
    const appModule = read("src/app.module.ts");
    const validationModule = read(
      "src/common/validation/contract-validation.module.ts",
    );

    assert.match(appModule, /ContractValidationModule/);
    assert.match(validationModule, /APP_INTERCEPTOR/);
    assert.match(validationModule, /ContractValidationInterceptor/);
  });

  it("pre-stubs the workspace permission resolver contract", () => {
    const authContract = read(
      "src/modules/auth/public/auth-public.contract.ts",
    );
    const authModule = read("src/modules/auth/auth.module.ts");
    const permissionController = read(
      "src/modules/auth/workspace-permission.controller.ts",
    );
    const authService = read("src/modules/auth/auth.service.ts");

    assert.match(authContract, /resolveWorkspacePermission/);
    assert.match(authContract, /WorkspacePermissionResolveRequest/);
    assert.match(authModule, /WorkspacePermissionController/);
    assert.match(
      permissionController,
      /@Controller\("workspaces\/:workspaceId\/permissions"\)/,
    );
    assert.match(permissionController, /@Post\("resolve"\)/);
    assert.match(authService, /AuthPublicContract\.resolveWorkspacePermission/);
  });

  it("locks controller request, query, and response schemas to public contracts", () => {
    const expectedSchemas = [
      [
        "src/modules/auth/auth.controller.ts",
        "ContractResponseSchema",
        "CurrentUser",
      ],
      [
        "src/modules/auth/workspace-permission.controller.ts",
        "ContractBodySchema",
        "WorkspacePermissionResolveRequest",
      ],
      [
        "src/modules/auth/workspace-permission.controller.ts",
        "ContractResponseSchema",
        "WorkspacePermissionDecision",
      ],
      [
        "src/modules/task/task.controller.ts",
        "ContractBodySchema",
        "TaskCreateDraftRequest",
      ],
      [
        "src/modules/task/task.controller.ts",
        "ContractResponseSchema",
        "TaskSummary",
      ],
      [
        "src/modules/agent/agent.controller.ts",
        "ContractQuerySchema",
        "PaginationQuery",
      ],
      [
        "src/modules/agent/agent.controller.ts",
        "ContractResponseSchema",
        "AgentActionPage",
      ],
      [
        "src/modules/github/github.controller.ts",
        "ContractQuerySchema",
        "PaginationQuery",
      ],
      [
        "src/modules/github/github.controller.ts",
        "ContractResponseSchema",
        "GithubIssueSummaryPage",
      ],
      [
        "src/modules/github/github.controller.ts",
        "ContractResponseSchema",
        "PullRequestSummaryPage",
      ],
      [
        "src/modules/planning/planning.controller.ts",
        "ContractQuerySchema",
        "PaginationQuery",
      ],
      [
        "src/modules/planning/planning.controller.ts",
        "ContractResponseSchema",
        "ProjectPlanDraftSummaryPage",
      ],
    ];

    for (const [relPath, decoratorName, schemaName] of expectedSchemas) {
      const content = read(relPath);
      assert.match(content, new RegExp(`\\b${decoratorName}\\b`));
      assert.match(content, new RegExp(`"${schemaName}"`));
    }
  });

  it("returns intentional 501 responses from reserved contract stubs", () => {
    const contracts = read("src/common/contracts/public-contracts.ts");
    assert.match(contracts, /NotImplementedException/);
    assert.match(
      contracts,
      /class NotImplementedError extends NotImplementedException/,
    );
  });

  it("pre-stubs controller handlers for the public OpenAPI operation ids", () => {
    const expectedHandlers = [
      ["src/modules/auth/auth.controller.ts", "@Get", "getCurrentUser"],
      [
        "src/modules/workspace/workspace.controller.ts",
        "@Get",
        "listWorkspaceSummaries",
      ],
      [
        "src/modules/workspace/workspace.controller.ts",
        "@Get",
        "listWorkspaceMembers",
      ],
      ["src/modules/canvas/canvas.controller.ts", "@Get", "listCanvasBoards"],
      ["src/modules/task/task.controller.ts", "@Get", "listTaskSummaries"],
      ["src/modules/task/task.controller.ts", "@Post", "createTaskDraft"],
      [
        "src/modules/github/github.controller.ts",
        "@Get",
        "listGithubRepositories",
      ],
      [
        "src/modules/github/github.controller.ts",
        "@Get",
        "listGithubIssueSummaries",
      ],
      [
        "src/modules/github/github.controller.ts",
        "@Get",
        "listPullRequestSummaries",
      ],
      [
        "src/modules/progress/progress.controller.ts",
        "@Get",
        "getProgressSummary",
      ],
      [
        "src/modules/meeting/meeting.controller.ts",
        "@Get",
        "listMeetingReportSummaries",
      ],
      [
        "src/modules/review/review.controller.ts",
        "@Get",
        "listPrAnalysisSummaries",
      ],
      ["src/modules/agent/agent.controller.ts", "@Get", "listAgentActions"],
      [
        "src/modules/planning/planning.controller.ts",
        "@Get",
        "listPlanningDrafts",
      ],
      [
        "src/modules/common-system/common-system.controller.ts",
        "@Post",
        "createNotification",
      ],
    ];

    for (const [relPath, decorator, methodName] of expectedHandlers) {
      const content = read(relPath);
      assert.ok(
        content.includes(decorator),
        `${relPath} must use ${decorator}`,
      );
      assert.match(content, new RegExp(`\\b${methodName}\\b`));
    }
  });
});
