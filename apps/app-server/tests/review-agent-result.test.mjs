import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  InMemoryPullRequestAnalysisRepository,
} = require("../src/modules/review/analysis/in-memory-pull-request-analysis.repository.ts");
const {
  PullRequestAnalysisService,
} = require("../src/modules/review/analysis/pull-request-analysis.service.ts");
const {
  InMemoryReviewArtifactsRepository,
} = require("../src/modules/review/artifacts/in-memory-review-artifacts.repository.ts");
const {
  ReviewArtifactsService,
} = require("../src/modules/review/artifacts/review-artifacts.service.ts");
const {
  ChangedFilesService,
} = require("../src/modules/review/changes/changed-files.service.ts");
const {
  InMemoryChangedFilesRepository,
} = require("../src/modules/review/changes/in-memory-changed-files.repository.ts");
const {
  InMemoryReviewGraphRepository,
} = require("../src/modules/review/graph/in-memory-review-graph.repository.ts");
const {
  ReviewGraphService,
} = require("../src/modules/review/graph/review-graph.service.ts");
const {
  PullRequestSummaryRegistry,
} = require("../src/modules/review/room/pull-request-summary.registry.ts");
const {
  AgentChangedFilesResultService,
} = require("../src/modules/review/result/agent-changed-files-result.service.ts");
const {
  AgentGraphResultService,
} = require("../src/modules/review/result/agent-graph-result.service.ts");
const {
  AgentReviewArtifactsResultService,
} = require("../src/modules/review/result/agent-review-artifacts-result.service.ts");
const {
  AgentResultConsumerService,
} = require("../src/modules/review/result/agent-result-consumer.service.ts");

const DEFAULT_PULL_REQUEST_ID = "66666666-6666-4666-8666-666666666661";

function createPullRequestSummary(overrides = {}) {
  return {
    id: DEFAULT_PULL_REQUEST_ID,
    repositoryId: "55555555-5555-4555-8555-555555555501",
    number: 7,
    title: "Wire OAuth callback flow",
    authorLogin: "reviewer",
    state: "open",
    branch: "feature/auth-callback",
    baseBranch: "dev",
    url: "https://github.com/example/pilo/pull/7",
    changedFilesCount: 2,
    additions: 42,
    deletions: 8,
    linkedTaskIds: [],
    syncedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function createServices() {
  const repository = new InMemoryPullRequestAnalysisRepository();
  const pullRequestRegistry = new PullRequestSummaryRegistry();
  pullRequestRegistry.save(createPullRequestSummary());
  const graphRepository = new InMemoryReviewGraphRepository();
  const changedFilesService = new ChangedFilesService(
    new InMemoryChangedFilesRepository(),
  );
  const artifactsService = new ReviewArtifactsService(
    new InMemoryReviewArtifactsRepository(),
  );

  return {
    analysisService: new PullRequestAnalysisService(
      repository,
      {},
      pullRequestRegistry,
    ),
    artifactsService,
    changedFilesService,
    graphService: new ReviewGraphService(graphRepository),
    resultConsumer: new AgentResultConsumerService(
      repository,
      new AgentGraphResultService(graphRepository),
      new AgentChangedFilesResultService(changedFilesService),
      new AgentReviewArtifactsResultService(artifactsService),
    ),
  };
}

describe("agent result root analysis consumer", () => {
  it("applies succeeded result summary fields idempotently", () => {
    const { analysisService, resultConsumer } = createServices();
    analysisService.requestAnalysis("66666666-6666-4666-8666-666666666661");

    const message = {
      jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      runId: "99999999-9999-4999-8999-999999999901",
      status: "succeeded",
      finishedAt: "2026-06-27T10:01:00.000Z",
      output: {
        pullRequestId: "66666666-6666-4666-8666-666666666661",
        purposeSummary: "OAuth callback 화면 골격을 추가했다.",
        impactSummary: "Auth route와 session redirect flow에 영향이 있다.",
        testRecommendation: "회귀 smoke test와 실패 경로를 확인한다.",
        riskLevel: "medium",
        conclusion: "리뷰 후 merge 가능",
        graph: {
          nodes: [
            { status: "ok", riskLevel: "low" },
            { status: "discuss", riskLevel: "medium" },
          ],
        },
      },
    };

    const first = resultConsumer.applyResult(message);
    const second = resultConsumer.applyResult(message);

    assert.equal(first.analysisStatus, "succeeded");
    assert.equal(first.riskLevel, "medium");
    assert.equal(first.okCount, 1);
    assert.equal(first.discussCount, 1);
    assert.equal(first.riskCount, 1);
    assert.equal(second.updatedAt, first.updatedAt);
  });

  it("treats repeated jobId or runId as the same applied result", () => {
    const { analysisService, resultConsumer } = createServices();
    analysisService.requestAnalysis("66666666-6666-4666-8666-666666666661");

    const baseMessage = {
      jobId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      runId: "99999999-9999-4999-8999-999999999903",
      status: "succeeded",
      finishedAt: "2026-06-27T10:03:00.000Z",
      output: {
        pullRequestId: "66666666-6666-4666-8666-666666666661",
        purposeSummary: "First result",
      },
    };

    const first = resultConsumer.applyResult(baseMessage);
    const sameRun = resultConsumer.applyResult({
      ...baseMessage,
      jobId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      finishedAt: "2026-06-27T10:04:00.000Z",
      output: {
        pullRequestId: "66666666-6666-4666-8666-666666666661",
        purposeSummary: "Different run replay",
      },
    });
    const sameJob = resultConsumer.applyResult({
      ...baseMessage,
      runId: "99999999-9999-4999-8999-999999999904",
      finishedAt: "2026-06-27T10:05:00.000Z",
      output: {
        pullRequestId: "66666666-6666-4666-8666-666666666661",
        purposeSummary: "Different job replay",
      },
    });

    assert.equal(sameRun.updatedAt, first.updatedAt);
    assert.equal(sameJob.updatedAt, first.updatedAt);
    assert.equal(sameRun.purposeSummary, "First result");
    assert.equal(sameJob.purposeSummary, "First result");
  });

  it("applies failed result with error trace", () => {
    const { analysisService, resultConsumer } = createServices();
    analysisService.requestAnalysis("66666666-6666-4666-8666-666666666661");

    const failed = resultConsumer.applyResult({
      jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      runId: "99999999-9999-4999-8999-999999999902",
      status: "failed",
      finishedAt: "2026-06-27T10:02:00.000Z",
      output: {
        pullRequestId: "66666666-6666-4666-8666-666666666661",
      },
      error: { code: "WORKFLOW_FAILED", message: "review workflow failed" },
    });

    assert.equal(failed.analysisStatus, "failed");
    assert.deepEqual(failed.errorTrace, [
      "[WORKFLOW_FAILED] review workflow failed",
    ]);
  });

  it("applies graph, changed files, and review artifacts from one succeeded result", () => {
    const {
      analysisService,
      artifactsService,
      changedFilesService,
      graphService,
      resultConsumer,
    } = createServices();
    const pullRequestId = "66666666-6666-4666-8666-666666666661";
    const analysis = analysisService.requestAnalysis(pullRequestId);
    const message = {
      jobId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      runId: "99999999-9999-4999-8999-999999999905",
      status: "succeeded",
      finishedAt: "2026-06-27T10:06:00.000Z",
      output: {
        pullRequestId,
        purposeSummary: "Connect review result read models.",
        impactSummary: "Review room can render graph, files, and checklist.",
        testRecommendation: "Open the review room after result consumption.",
        riskLevel: "high",
        conclusion: "Review data is ready for the room.",
        graph: {
          summary: "review room data graph",
          intentSummary: "show generated review order",
          reviewStrategy: "start with the changed Review room component",
          nodes: [
            {
              id: "review-node-runtime-file",
              nodeType: "file",
              label: "apps/frontend/components/review/ReviewRoomWorkspace.tsx",
              filePath:
                "apps/frontend/components/review/ReviewRoomWorkspace.tsx",
              riskLevel: "high",
              status: "discuss",
              reviewOrder: 1,
              roleSummary: "renders review room data",
              reviewReason: "connects generated result data to UI",
              position: { x: 120, y: 80 },
            },
          ],
        },
        changedFiles: [
          {
            filePath:
              "apps/frontend/components/review/ReviewRoomWorkspace.tsx",
            changeType: "modified",
            additions: 24,
            deletions: 6,
            summary: "loads generated changed files",
            functions: [
              {
                name: "openPullRequest",
                changeType: "modified",
                summary: "hydrates the review session",
              },
            ],
          },
        ],
        questions: [
          {
            question: "Does the room show generated changed files?",
            priority: "high",
          },
        ],
        risks: [
          {
            title: "fixture fallback hides missing generated data",
            description: "The room could appear ready with stale fixture data.",
            riskLevel: "high",
            recommendation: "Prefer runtime changed-files API data.",
          },
        ],
        checklist: [
          {
            type: "review",
            title: "Open generated review room data before merge",
          },
        ],
      },
    };

    const updated = resultConsumer.applyResult(message);
    const replay = resultConsumer.applyResult(message);
    const graph = graphService.getGraph(analysis.id);
    const changedFiles = changedFilesService.listChangedFiles(analysis.id);
    const checklistItems = artifactsService.listChecklistItems(analysis.id);

    assert.equal(updated.analysisStatus, "succeeded");
    assert.equal(updated.riskLevel, "high");
    assert.equal(updated.riskCount, 1);
    assert.equal(replay.updatedAt, updated.updatedAt);
    assert.equal(graph.nodes[0].label, message.output.graph.nodes[0].label);
    assert.equal(graph.nodes[0].riskLevel, "high");
    assert.equal(changedFiles[0].filePath, message.output.changedFiles[0].filePath);
    assert.equal(changedFiles[0].functions[0].name, "openPullRequest");
    assert.equal(checklistItems.length, 1);
    assert.equal(checklistItems[0].title, message.output.checklist[0].title);
  });
});
