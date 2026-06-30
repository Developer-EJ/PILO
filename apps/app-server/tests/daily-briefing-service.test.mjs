import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  DailyBriefingService,
} = require("../src/modules/agent/daily-briefing.service");

const dashboard = {
  workspace: {
    id: "workspace-daily",
    name: "PILO MVP",
    description: "AI project collaboration",
    type: "side_project",
    status: "active",
    myRole: "owner",
    memberCount: 2,
    createdAt: "2026-06-20T00:00:00.000Z",
  },
  currentMember: {
    workspaceId: "workspace-daily",
    memberId: "member-owner",
    userId: "user-owner",
    role: "owner",
    displayName: "Owner",
  },
  preferences: {
    workspaceId: "workspace-daily",
    memberId: "member-owner",
    layout: {},
    hiddenSections: [],
    updatedAt: null,
  },
  members: [],
  tasks: [
    {
      id: "task-1",
      workspaceId: "workspace-daily",
      title: "Auth callback finish",
      status: "in_progress",
      priority: "high",
      assignee: { memberId: "member-owner" },
      dueDate: "2026-07-03",
      isDelayed: false,
    },
    {
      id: "task-2",
      workspaceId: "workspace-daily",
      title: "Review blocked flow",
      status: "blocked",
      priority: "urgent",
      assignee: { memberId: "member-review" },
      dueDate: "2026-07-01",
      isDelayed: true,
    },
  ],
  progress: {
    workspaceId: "workspace-daily",
    totalTasks: 12,
    doneTasks: 3,
    blockedTasks: 1,
    reviewTasks: 2,
    delayedTasks: 1,
    progressRate: 25,
    capturedAt: "2026-06-27T10:00:00.000Z",
  },
  githubIssues: [{ title: "OAuth callback route" }],
  pullRequests: [
    {
      title: "Add OAuth callback shell",
      state: "review_requested",
      changedFilesCount: 4,
    },
  ],
  meetingReports: [
    {
      title: "MVP scope sync",
      summary: "Contracts and first runtime slice were aligned.",
      decisionCount: 2,
      actionItemCount: 3,
      riskCount: 1,
    },
  ],
  prAnalyses: [
    {
      purposeSummary: "Auth callback shell",
      riskLevel: "medium",
      analysisStatus: "succeeded",
      riskCount: 1,
      conclusion: "Review before merge",
    },
  ],
  agentActions: [],
  canvasEntities: [],
  source: "fixture",
  generatedAt: "2026-06-27T10:00:00.000Z",
};

function createService() {
  const calls = [];
  const workspaceService = {
    async getWorkspaceDashboard(input) {
      calls.push(input);
      return dashboard;
    },
  };

  return {
    calls,
    service: new DailyBriefingService(workspaceService),
  };
}

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

describe("DailyBriefingService", () => {
  it("builds fallback daily briefing from the workspace dashboard read model", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const { calls, service } = createService();
      const result = await service.getDailyBriefing({
        workspaceId: "workspace-daily",
        currentUser: {
          id: "user-owner",
          name: "Owner",
          email: "owner@example.com",
          avatarUrl: null,
        },
      });

      assert.equal(result.workspaceId, "workspace-daily");
      assert.equal(result.fallback, true);
      assert.equal(result.usedModel, null);
      assert.equal(result.sources.dashboard, true);
      assert.equal(result.sources.tasks, true);
      assert.equal(result.sources.progress, true);
      assert.equal(result.sources.meetings, true);
      assert.equal(result.sources.reviews, true);
      assert.equal(result.sourceDetails.github, "fixture_deferred");
      assert.ok(result.projectBriefing.summary.includes("25%"));
      assert.ok(
        result.projectBriefing.headline.includes("오늘의 프로젝트 브리핑"),
      );
      assert.ok(
        result.projectBriefing.recommendedActions[0].includes(
          "높은 우선순위 작업",
        ),
      );
      assert.deepEqual(result.personalBriefing.myTasks, [
        "Auth callback finish",
      ]);
      const fallbackText = collectStrings(result).join("\n");
      for (const fragment of [
        "�",
        "吏",
        "留",
        "釉",
        "由",
        "꾩",
        "뺤",
        "ㅻ",
        "뚯",
        "묒",
        "??",
      ]) {
        assert.equal(
          fallbackText.includes(fragment),
          false,
          `fallback text contains mojibake fragment: ${fragment}`,
        );
      }
      assert.equal(calls[0].workspaceId, "workspace-daily");
      assert.equal(calls[0].currentUser.id, "user-owner");
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("returns OpenAI generated sections with fallback metadata preserved", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.PILO_DAILY_BRIEFING_MODEL;
    const originalFetch = globalThis.fetch;

    process.env.OPENAI_API_KEY = "test-key";
    process.env.PILO_DAILY_BRIEFING_MODEL = "gpt-test";
    globalThis.fetch = async () =>
      Response.json({
        output_text: JSON.stringify({
          projectBriefing: {
            headline: "AI project headline",
            summary: "AI project summary",
            highlights: ["AI highlight"],
            risks: ["AI risk"],
            recommendedActions: ["AI project action"],
          },
          personalBriefing: {
            headline: "AI personal headline",
            summary: "AI personal summary",
            myTasks: ["AI task"],
            needsAttention: ["AI attention"],
            recommendedActions: ["AI personal action"],
          },
        }),
      });

    try {
      const { service } = createService();
      const result = await service.regenerateDailyBriefing({
        workspaceId: "workspace-daily",
        currentUser: {
          id: "user-owner",
          name: "Owner",
          email: "owner@example.com",
          avatarUrl: null,
        },
      });

      assert.equal(result.fallback, false);
      assert.equal(result.usedModel, "gpt-test");
      assert.equal(result.projectBriefing.headline, "AI project headline");
      assert.equal(result.personalBriefing.myTasks[0], "AI task");
      assert.equal(result.sourceDetails.personalization, "current_member");
      assert.ok(
        result.warnings.some((warning) =>
          warning.includes("workspace-level fixture/deferred"),
        ),
      );
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      if (originalModel === undefined) {
        delete process.env.PILO_DAILY_BRIEFING_MODEL;
      } else {
        process.env.PILO_DAILY_BRIEFING_MODEL = originalModel;
      }
      globalThis.fetch = originalFetch;
    }
  });

  it("parses fenced JSON OpenAI responses without falling back", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.PILO_DAILY_BRIEFING_MODEL;
    const originalFetch = globalThis.fetch;

    process.env.OPENAI_API_KEY = "test-key";
    process.env.PILO_DAILY_BRIEFING_MODEL = "gpt-test";
    globalThis.fetch = async () =>
      Response.json({
        output_text:
          "```json\n" +
          JSON.stringify({
            projectBriefing: {
              headline: "펜스 프로젝트 헤드라인",
              summary: "펜스 프로젝트 요약",
              highlights: ["펜스 하이라이트"],
              risks: ["펜스 리스크"],
              recommendedActions: ["펜스 프로젝트 액션"],
            },
            personalBriefing: {
              headline: "펜스 개인 헤드라인",
              summary: "펜스 개인 요약",
              myTasks: ["펜스 작업"],
              needsAttention: ["펜스 확인"],
              recommendedActions: ["펜스 개인 액션"],
            },
          }) +
          "\n```",
      });

    try {
      const { service } = createService();
      const result = await service.regenerateDailyBriefing({
        workspaceId: "workspace-daily",
        currentUser: {
          id: "user-owner",
          name: "Owner",
          email: "owner@example.com",
          avatarUrl: null,
        },
      });

      assert.equal(result.fallback, false);
      assert.equal(result.usedModel, "gpt-test");
      assert.equal(result.projectBriefing.headline, "펜스 프로젝트 헤드라인");
      assert.equal(result.personalBriefing.myTasks[0], "펜스 작업");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      if (originalModel === undefined) {
        delete process.env.PILO_DAILY_BRIEFING_MODEL;
      } else {
        process.env.PILO_DAILY_BRIEFING_MODEL = originalModel;
      }
      globalThis.fetch = originalFetch;
    }
  });
});
