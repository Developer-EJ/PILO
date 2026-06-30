import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  createMockWorkspaceClient,
  createWorkspaceApiClient,
  mockWorkspaces,
} from "../lib/workspace/workspaceClient.mjs";
import {
  createCanvasApiClient,
  createMockCanvasBoardDetail,
  createMockCanvasClient,
} from "../lib/workspace/canvasClient.mjs";
import { canvasStorageKey } from "../lib/workspace/canvasStorage.mjs";
import {
  resolveWorkspaceEntryDestination,
  workspaceCanvasBoardHref,
  workspaceCanvasHref,
  workspaceDashboardHref,
  workspaceEntryHref,
  workspaceOnboardingHref,
} from "../lib/workspace/currentWorkspace.mjs";
import {
  createWorkspaceDashboardApiClient,
  createWorkspaceDashboardFixture,
} from "../lib/workspace/dashboardClient.mjs";
import {
  PLANNING_ONBOARDING_LAST_SEED_STORAGE_KEY,
  buildWorkspacePlanningOnboardingSeed,
  workspacePlanningOnboardingSeedStorageKey,
  writeWorkspacePlanningOnboardingSeed,
} from "../lib/workspace/workspaceOnboardingSeed.mjs";
import { resolveWorkspaceLoginNextPath } from "../app/login/loginRedirects.mjs";

describe("donghyun workspace client", () => {
  it("routes empty and workspace login next paths through the workspace entrypoint", () => {
    const storedWorkspaceId = mockWorkspaces[1].id;

    assert.equal(
      resolveWorkspaceLoginNextPath(null, storedWorkspaceId),
      workspaceEntryHref(),
    );
    assert.equal(
      resolveWorkspaceLoginNextPath("/", storedWorkspaceId),
      workspaceEntryHref(),
    );
    assert.equal(
      resolveWorkspaceLoginNextPath("/workspace", null),
      workspaceEntryHref(),
    );
    assert.equal(
      resolveWorkspaceLoginNextPath("/workspaces/demo", storedWorkspaceId),
      "/workspaces/demo",
    );
  });

  it("branches workspace entry to onboarding only when no workspace exists", () => {
    const emptyDestination = resolveWorkspaceEntryDestination({
      workspaces: [],
      storedWorkspaceId: mockWorkspaces[1].id,
    });

    assert.equal(emptyDestination.kind, "onboarding");
    assert.equal(emptyDestination.href, workspaceOnboardingHref());

    const workspaceDestination = resolveWorkspaceEntryDestination({
      workspaces: mockWorkspaces,
      storedWorkspaceId: mockWorkspaces[1].id,
    });

    assert.equal(workspaceDestination.kind, "workspace");
    assert.equal(workspaceDestination.workspace.id, mockWorkspaces[1].id);
    assert.equal(
      workspaceDestination.href,
      workspaceDashboardHref(mockWorkspaces[1].id),
    );
  });

  it("calls current Workspace runtime APIs with credentials and JSON bodies", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith("/api/workspaces") && init.method === "POST") {
        return Response.json({
          ...mockWorkspaces[0],
          ...JSON.parse(init.body),
        });
      }

      if (url.endsWith(`/api/workspaces/${workspaceId}`)) {
        return Response.json(mockWorkspaces[0]);
      }

      if (url.endsWith(`/api/workspaces/${workspaceId}/members`)) {
        return Response.json([]);
      }

      if (url.endsWith(`/api/workspaces/${workspaceId}/invites`)) {
        return Response.json({
          id: "invite-1",
          token: "token-1",
          ...JSON.parse(init.body),
        });
      }

      if (url.endsWith("/api/workspace-invites/invite-1/accept")) {
        return Response.json({ ok: true, workspaceId });
      }

      return Response.json(mockWorkspaces);
    };
    const client = createWorkspaceApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    await client.createWorkspace({
      name: "New Workspace",
      description: "API backed",
      type: "side_project",
    });
    await client.getWorkspace(workspaceId);
    await client.listWorkspaceMembers(workspaceId);
    await client.createWorkspaceInvite(workspaceId, {
      email: "member@example.com",
      role: "member",
      ttlHours: 168,
    });
    await client.acceptWorkspaceInvite("invite-1", { token: "token-1" });

    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      ["POST", "GET", "GET", "POST", "POST"],
    );
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.headers["Content-Type"], "application/json");
    assert.equal(
      requests[4].url,
      "https://api.pilo.dev/api/workspace-invites/invite-1/accept",
    );
  });

  it("keeps mock Workspace create, invite, and accept flows stateful", async () => {
    const storage = new Map();
    const previousWindow = globalThis.window;

    globalThis.window = {
      localStorage: {
        getItem(key) {
          return storage.get(key) ?? null;
        },
        setItem(key, value) {
          storage.set(key, value);
        },
      },
    };

    try {
      const client = createMockWorkspaceClient({ workspaces: [] });
      const onboarding = {
        title: "Local Workspace",
        goal: "MVP 완성",
        problem: "팀 작업 흐름이 흩어져 있음",
        targetUsers: "사이드 프로젝트 팀",
        duration: "4주",
        teamSize: "5명",
        experienceLevel: "혼합 팀",
        finalDeliverable: "사용 가능한 MVP",
      };
      const workspace = await client.createWorkspace({
        name: "Local Workspace",
        onboarding,
      });
      const invite = await client.createWorkspaceInvite(workspace.id, {
        email: "member@example.com",
      });
      const accepted = await client.acceptWorkspaceInvite(invite.id, {
        token: invite.token,
      });

      assert.equal((await client.listWorkspaces())[0].id, workspace.id);
      assert.deepEqual(workspace.onboarding, onboarding);
      assert.equal(
        createWorkspaceDashboardFixture(workspace.id).workspace.name,
        "Local Workspace",
      );
      assert.equal(accepted.workspaceId, workspace.id);
      assert.equal((await client.listWorkspaceMembers(workspace.id)).length, 1);
    } finally {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
    }
  });

  it("stores workspace onboarding as the Planning seed contract", () => {
    const workspaceId = "workspace-seed-target";
    const storage = new Map();
    const storageLike = {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    };
    const onboarding = {
      title: "팀 운영 도우미",
      goal: "첫 주 실행 계획 만들기",
      problem: "작업 분해가 느림",
      targetUsers: "부트캠프 팀",
      duration: "3 weeks",
      teamSize: "5명",
      experienceLevel: "초급",
      finalDeliverable: "데모 가능한 MVP",
    };

    const seed = writeWorkspacePlanningOnboardingSeed({
      workspaceId,
      values: onboarding,
      storage: storageLike,
    });
    const scopedSeed = JSON.parse(
      storageLike.getItem(workspacePlanningOnboardingSeedStorageKey(workspaceId)),
    );
    const lastSeed = JSON.parse(
      storageLike.getItem(PLANNING_ONBOARDING_LAST_SEED_STORAGE_KEY),
    );

    assert.deepEqual(seed, {
      workspaceId,
      workspaceTitle: "팀 운영 도우미",
      goal: "첫 주 실행 계획 만들기",
      problem: "작업 분해가 느림",
      targetUser: "부트캠프 팀",
      duration: "3 weeks",
      teamSize: 5,
      experienceLevel: "beginner",
      outputGoal: "데모 가능한 MVP",
    });
    assert.deepEqual(scopedSeed, seed);
    assert.deepEqual(lastSeed, seed);
    assert.equal(
      buildWorkspacePlanningOnboardingSeed(
        { ...onboarding, experienceLevel: "중급" },
        workspaceId,
      ).experienceLevel,
      "intermediate",
    );
  });

  it("accepts the Agent onboarding payload shape for workspace seed storage", async () => {
    const workspaceId = "workspace-agent-onboarding";
    const agentOnboarding = {
      workspaceTitle: "AI 온보딩 워크스페이스",
      goal: "대화로 프로젝트 맥락 정리",
      problem: "초기 기획 정보가 흩어짐",
      targetUser: "MVP 팀",
      duration: "4 weeks",
      teamSize: 4,
      experienceLevel: "beginner",
      outputGoal: "시연 가능한 MVP",
    };
    const seed = buildWorkspacePlanningOnboardingSeed(
      agentOnboarding,
      workspaceId,
    );
    const client = createMockWorkspaceClient({ workspaces: [] });
    const workspace = await client.createWorkspace({
      name: agentOnboarding.workspaceTitle,
      onboarding: agentOnboarding,
    });

    assert.deepEqual(seed, {
      workspaceId,
      workspaceTitle: agentOnboarding.workspaceTitle,
      goal: agentOnboarding.goal,
      problem: agentOnboarding.problem,
      targetUser: agentOnboarding.targetUser,
      duration: agentOnboarding.duration,
      teamSize: 4,
      experienceLevel: "beginner",
      outputGoal: agentOnboarding.outputGoal,
    });
    assert.equal(workspace.onboarding.title, agentOnboarding.workspaceTitle);
    assert.equal(workspace.onboarding.targetUsers, agentOnboarding.targetUser);
    assert.equal(workspace.onboarding.teamSize, "4");
    assert.equal(
      workspace.onboarding.finalDeliverable,
      agentOnboarding.outputGoal,
    );
  });

  it("keeps Planning and Agent out of the workspace sidebar contract", () => {
    const workspaceShellSource = readFileSync(
      new URL("../components/workspace/WorkspaceShell.tsx", import.meta.url),
      "utf8",
    );

    assert.equal(workspaceShellSource.includes('label: "기획"'), false);
    assert.equal(workspaceShellSource.includes("Agent 실행"), false);
    assert.equal(workspaceShellSource.includes('"reports"'), false);
    assert.equal(workspaceShellSource.includes('"report"'), true);
    assert.equal(
      workspaceShellSource.includes('workspacePath(workspaceId, "reviews")'),
      true,
    );
  });

  it("opens runtime-created Canvas boards through the static canvas route", () => {
    const workspaceId = mockWorkspaces[0].id;
    const boardId = "local-canvas-board-1";

    assert.equal(
      workspaceCanvasBoardHref(workspaceId, boardId),
      `${workspaceCanvasHref(workspaceId)}?boardId=${boardId}`,
    );
  });

  it("deletes Canvas boards through the API client", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const board = createMockCanvasBoardDetail(workspaceId);
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith(`/api/canvas-boards/${board.id}`)) {
        return Response.json({ id: board.id, deleted: true });
      }

      return Response.json([]);
    };
    const client = createCanvasApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    const result = await client.deleteBoard(board.id);

    assert.deepEqual(result, { id: board.id, deleted: true });
    assert.equal(
      requests[0].url,
      `https://api.pilo.dev/api/canvas-boards/${board.id}`,
    );
    assert.equal(requests[0].init.method, "DELETE");
    assert.equal(requests[0].init.credentials, "include");
  });

  it("hides deleted mock Canvas boards and clears local board state", async () => {
    const storage = new Map();
    const previousLocalStorage = globalThis.localStorage;

    globalThis.localStorage = {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
      removeItem(key) {
        storage.delete(key);
      },
    };

    try {
      const workspaceId = mockWorkspaces[0].id;
      const client = createMockCanvasClient();
      const board = await client.createBoard(workspaceId, {
        title: "삭제 테스트",
      });
      const shapeStateKey = canvasStorageKey(board.id, "shape-state");

      storage.set(shapeStateKey, JSON.stringify({ shape: { x: 1, y: 2 } }));
      assert.equal(
        (await client.listBoards(workspaceId)).some(
          (candidate) => candidate.id === board.id,
        ),
        true,
      );

      await client.deleteBoard(board.id, { workspaceId });

      assert.equal(
        (await client.listBoards(workspaceId)).some(
          (candidate) => candidate.id === board.id,
        ),
        false,
      );
      await assert.rejects(
        () => client.getBoardDetail(board.id, { workspaceId }),
        /Canvas board not found/,
      );
      assert.equal(storage.has(shapeStateKey), false);
    } finally {
      if (previousLocalStorage === undefined) {
        delete globalThis.localStorage;
      } else {
        globalThis.localStorage = previousLocalStorage;
      }
    }
  });

  it("keeps dashboard API responses live instead of pinning fixture counts", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const dashboard = {
      ...createWorkspaceDashboardFixture(workspaceId),
      source: "runtime",
      tasks: [
        {
          id: "runtime-task-1",
          workspaceId,
          title: "런타임 작업",
          status: "in_progress",
        },
      ],
      pullRequests: [],
      meetingReports: [],
      progress: {
        workspaceId,
        totalTasks: 1,
        doneTasks: 0,
        blockedTasks: 0,
        reviewTasks: 0,
        delayedTasks: 0,
        progressRate: 0,
        capturedAt: new Date().toISOString(),
      },
    };
    const client = createWorkspaceDashboardApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher: async () => Response.json(dashboard),
    });

    const result = await client.getDashboard(workspaceId);

    assert.equal(result.dashboard.source, "runtime");
    assert.equal(result.dashboard.tasks.length, 1);
    assert.equal(result.dashboard.tasks[0].title, "런타임 작업");
    assert.equal(result.dashboard.pullRequests.length, 0);
    assert.equal(result.dashboard.progress.progressRate, 0);
  });
});
