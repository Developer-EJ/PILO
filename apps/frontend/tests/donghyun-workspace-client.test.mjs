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
  createCanvasMemo,
  createMockCanvasBoardDetail,
  createMockCanvasClient,
} from "../lib/workspace/canvasClient.mjs";
import {
  CANVAS_FREEFORM_SHAPES_STORAGE_SCOPE,
  canvasStorageKey,
  normalizeCanvasFreeformShapes,
} from "../lib/workspace/canvasStorage.mjs";
import {
  applyTaskAction,
  createTaskGithubProgressClient,
} from "../lib/task/taskGithubProgressClient.mjs";
import {
  resolveWorkspaceEntryDestination,
  workspaceCanvasBoardHref,
  workspaceCanvasHref,
  workspaceDashboardHref,
  workspaceEntryHref,
  workspaceOnboardingHref,
} from "../lib/workspace/currentWorkspace.mjs";
import {
  dailyBriefingUserMessageFromError,
  defaultWorkspaceDailyBriefingMode,
  createWorkspaceDailyBriefingClient,
  createMockWorkspaceDailyBriefingClient,
  createWorkspaceDailyBriefingApiClient,
  createWorkspaceDashboardApiClient,
  createWorkspaceDailyBriefingFixture,
  createWorkspaceDashboardFixture,
  normalizeWorkspaceDailyBriefing,
  WorkspaceDailyBriefingApiError,
} from "../lib/workspace/dashboardClient.mjs";
import {
  PLANNING_ONBOARDING_LAST_SEED_STORAGE_KEY,
  WORKSPACE_ONBOARDING_LAST_PAYLOAD_STORAGE_KEY,
  buildWorkspaceOnboardingPayloadSnapshot,
  buildWorkspacePlanningOnboardingSeed,
  workspaceOnboardingPayloadStorageKey,
  workspacePlanningOnboardingSeedStorageKey,
  writeWorkspaceOnboardingPayload,
  writeWorkspacePlanningOnboardingSeed,
} from "../lib/workspace/workspaceOnboardingSeed.mjs";
import {
  buildLocalCanvasMemoProposal,
  buildLocalTaskDraftProposal,
  buildWorkspaceAiChatAssistantText,
  buildWorkspaceAiChatFallbackAnswer,
  buildWorkspaceAiChatRequest,
  defaultWorkspaceAiChatAgentMode,
  extractWorkspaceAiChatRuntimeInfo,
  findCanvasMemoProposal,
  findWorkspaceTaskActionProposal,
  hasCanvasMemoMutationIntent,
  hasTaskDraftMutationIntent,
  resolveWorkspaceAiChatAgentMode,
  workspaceAiChatUserMessageFromError,
} from "../lib/workspace/workspaceAiChat.mjs";
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

  it("stores Agent onboarding candidates with the created workspace id", () => {
    const workspaceId = "workspace-onboarding-candidates";
    const storage = new Map();
    const storageLike = {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    };
    const payload = {
      name: "Candidate Workspace",
      description: "Candidate workspace goal",
      type: "side_project",
      onboarding: {
        workspaceTitle: "Candidate Workspace",
        goal: "Ship MVP",
        problem: "No shared plan",
        targetUser: "Project team",
        duration: "4 weeks",
        teamSize: 5,
        experienceLevel: "beginner",
        outputGoal: "Demoable MVP",
      },
      planningSeed: {
        workspaceTitle: "Candidate Workspace",
        goal: "Ship MVP",
        problem: "No shared plan",
        targetUser: "Project team",
        duration: "4 weeks",
        teamSize: 5,
        experienceLevel: "beginner",
        outputGoal: "Demoable MVP",
      },
      taskCandidates: [
        {
          workspaceId: null,
          sourceType: "planning_feature",
          sourceId: "task-1",
          title: "Define scope",
        },
      ],
      milestoneCandidates: [
        {
          title: "MVP direction",
          status: "planned",
        },
      ],
    };

    const snapshot = writeWorkspaceOnboardingPayload({
      workspaceId,
      payload,
      storage: storageLike,
    });
    const scopedSnapshot = JSON.parse(
      storageLike.getItem(workspaceOnboardingPayloadStorageKey(workspaceId)),
    );
    const lastSnapshot = JSON.parse(
      storageLike.getItem(WORKSPACE_ONBOARDING_LAST_PAYLOAD_STORAGE_KEY),
    );

    assert.deepEqual(snapshot.taskCandidates[0], {
      workspaceId,
      sourceType: "planning_feature",
      sourceId: "task-1",
      title: "Define scope",
    });
    assert.equal(snapshot.planningSeed.workspaceId, workspaceId);
    assert.equal(scopedSnapshot.taskCandidates[0].workspaceId, workspaceId);
    assert.deepEqual(lastSnapshot, scopedSnapshot);
    assert.equal(
      buildWorkspaceOnboardingPayloadSnapshot({
        workspaceId,
        payload,
      }).milestoneCandidates[0].workspaceId,
      workspaceId,
    );
  });

  it("keeps Planning and Agent out of the workspace sidebar contract", () => {
    const workspaceShellSource = readFileSync(
      new URL("../components/workspace/WorkspaceShell.tsx", import.meta.url),
      "utf8",
    );

    assert.equal(workspaceShellSource.includes('label: "기획"'), false);
    assert.equal(workspaceShellSource.includes("Agent 실행"), false);
    assert.equal(
      workspaceShellSource.includes('workspacePath(workspaceId, "meetings/voice")'),
      true,
    );
    assert.equal(
      workspaceShellSource.includes('workspacePath(workspaceId, "meetings/reports")'),
      true,
    );
    assert.equal(workspaceShellSource.includes('new URLSearchParams({ view'), false);
    assert.equal(workspaceShellSource.includes("TopbarRecordingControl"), true);
    assert.equal(
      workspaceShellSource.includes('workspacePath(workspaceId, "reviews")'),
      true,
    );
    assert.equal(
      workspaceShellSource.includes("NEXT_PUBLIC_PILO_REVIEW_ROOM_URL"),
      false,
    );
  });

  it("keeps workspace Code Review navigation inside the 3000 shell route", () => {
    const workspaceShellSource = readFileSync(
      new URL("../components/workspace/WorkspaceShell.tsx", import.meta.url),
      "utf8",
    );

    assert.equal(
      workspaceShellSource.includes('href: workspacePath(workspaceId, "reviews")'),
      true,
    );
    assert.equal(workspaceShellSource.includes("localhost:3001"), false);
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

  it("builds Workspace AI chat requests with user and member context", () => {
    const workspaceId = mockWorkspaces[0].id;
    const request = buildWorkspaceAiChatRequest({
      workspaceId,
      boardId: "board-ai-chat",
      message: "캔버스에 오늘 리스크를 메모로 남겨줘",
      currentUser: {
        id: "user-1",
        name: "동현",
        email: "donghyun@example.com",
      },
      currentMember: {
        memberId: "member-1",
        userId: "user-1",
        name: "동현",
        role: "owner",
      },
    });
    const proposal = findCanvasMemoProposal(
      {
        run: {
          actions: [
            {
              id: "action-canvas-memo",
              type: "canvas.memo.create",
              status: "waiting_confirmation",
              payload: {
                workspaceId,
                boardId: "board-ai-chat",
                text: "오늘 리스크를 회의 전에 확인",
                position: { x: 120, y: 180 },
              },
            },
          ],
        },
      },
      {
        workspaceId,
        boardId: "board-ai-chat",
        message: "캔버스에 오늘 리스크를 메모로 남겨줘",
      },
    );
    const localProposal = buildLocalCanvasMemoProposal({
      workspaceId,
      boardId: "board-ai-chat",
      message: "캔버스에 오늘 리스크를 메모로 남겨줘",
      currentMember: {
        memberId: "member-1",
        name: "동현",
      },
    });

    assert.equal(request.workflowType, "orchestrator.run");
    assert.deepEqual(request.contextRefs, [
      { type: "workspace", id: workspaceId },
      { type: "canvas_board", id: "board-ai-chat" },
    ]);
    assert.equal(request.currentUserContext.id, "user-1");
    assert.equal(request.currentMemberContext.memberId, "member-1");
    assert.equal(proposal.type, "canvas.memo.create");
    assert.equal(proposal.source, "api");
    assert.equal(proposal.payload.text, "오늘 리스크를 회의 전에 확인");
    assert.equal(localProposal.source, "local_fallback");
    assert.equal(localProposal.payload.authorName, "동현");
  });

  it("normalizes Workspace AI chat API metadata and root Canvas actions", () => {
    const workspaceId = mockWorkspaces[0].id;
    const result = {
      assistantMessage: {
        role: "assistant",
        body: "서버가 만든 AI 답변입니다.",
      },
      response: {
        shortConclusion: "오늘은 캔버스에 리스크를 남기는 것이 좋습니다.",
        priorityTasks: ["리스크 확인", "담당자 공유"],
        recommendedNextActions: ["메모 승인 여부를 결정하세요."],
        fallback: false,
        usedModel: "gpt-4.1-mini",
        runtime: {
          generatedAt: "2026-07-01T09:00:00.000Z",
          sourceStatus: {
            meetings: "provided",
            tasks: "provided",
          },
        },
      },
      actions: [
        {
          id: "action-root-canvas-memo",
          type: "canvas.memo.create",
          status: "waiting_confirmation",
          summary: "캔버스에 리스크 메모를 추가합니다.",
          payload: {
            workspaceId,
            boardId: "board-root-action",
            title: "오늘 리스크",
            text: "오늘 리스크를 먼저 확인",
            position: { x: 180, y: 220 },
          },
        },
      ],
      run: {
        tokenUsage: {
          model: "fallback-model",
        },
      },
    };

    const proposal = findCanvasMemoProposal(result, {
      workspaceId,
      boardId: "board-root-action",
      message: "캔버스에 오늘 리스크를 메모로 남겨줘",
    });
    const assistantText = buildWorkspaceAiChatAssistantText(result);
    const runtimeInfo = extractWorkspaceAiChatRuntimeInfo(result, {
      mode: "api",
    });

    assert.equal(proposal.actionId, "action-root-canvas-memo");
    assert.equal(proposal.source, "api");
    assert.equal(proposal.payload.text, "오늘 리스크를 먼저 확인");
    assert.equal(assistantText.includes("우선 처리할 일"), true);
    assert.equal(assistantText.includes("승인 대기 제안 1개"), true);
    assert.equal(runtimeInfo.fallback, false);
    assert.equal(runtimeInfo.usedModel, "gpt-4.1-mini");
    assert.equal(runtimeInfo.generatedAt, "2026-07-01T09:00:00.000Z");
    assert.equal(runtimeInfo.sourceStatus.meetings, "provided");
  });

  it("does not treat read-only Workspace AI chat questions as Canvas memo mutations", () => {
    const readOnlyQuestions = [
      "어제 회의록 내용 기준으로 무엇을 먼저 처리하면 좋을까?",
      "오늘 내가 먼저 봐야 할 작업 알려줘",
      "회의 결정사항 기준으로 막힌 일 정리해줘",
    ];

    for (const question of readOnlyQuestions) {
      assert.equal(hasCanvasMemoMutationIntent(question), false);
    }

    const proposal = findCanvasMemoProposal(
      {
        run: {
          actions: [
            {
              id: "action-task-draft",
              type: "task.create.draft",
              status: "waiting_confirmation",
              payload: {
                title: "Prioritize meeting follow-up",
              },
            },
          ],
        },
      },
      {
        workspaceId: mockWorkspaces[0].id,
        message: readOnlyQuestions[0],
      },
    );
    const fallbackAnswer = buildWorkspaceAiChatFallbackAnswer({
      message: readOnlyQuestions[0],
      reason: "현재 워크스페이스 AI 채팅은 로컬 모드로 동작 중입니다.",
    });

    assert.equal(proposal, null);
    assert.equal(fallbackAnswer.includes("우선순위 제안"), true);
    assert.equal(fallbackAnswer.includes("canvas.memo.create"), false);
  });

  it("surfaces Task proposals only for explicit task creation intent", () => {
    const workspaceId = mockWorkspaces[0].id;
    const result = {
      run: {
        actions: [
          {
            id: "action-task-draft",
            type: "task.create.draft",
            status: "waiting_confirmation",
            summary: "요청을 Task 초안으로 제안합니다.",
            payload: {
              workspaceId,
              title: "회의 결정사항 follow-up 만들기",
              description: "회의 결정사항을 작업으로 정리합니다.",
              priority: "medium",
            },
          },
        ],
      },
    };

    assert.equal(
      findWorkspaceTaskActionProposal(result, {
        workspaceId,
        message: "어제 회의록 내용 기준으로 무엇을 먼저 처리하면 좋을까?",
      }),
      null,
    );
    assert.equal(hasTaskDraftMutationIntent("작업 하나 만들어줘"), true);

    const proposal = findWorkspaceTaskActionProposal(result, {
      workspaceId,
      message: "회의 결정사항으로 작업 하나 만들어줘",
    });

    assert.equal(proposal.type, "task.create.draft");
    assert.equal(proposal.executable, true);
    assert.equal(proposal.payload.title, "회의 결정사항 follow-up 만들기");
    assert.equal(proposal.contractNote.includes("작업 초안"), true);
  });

  it("builds local Task proposals and applies them through the Task client", async () => {
    const workspaceId = "workspace-ai-task-proposal";
    const message =
      "AI 검수 작업 1782842175757 작업 하나 만들어줘. 설명은 AI 액션 검수용이고 담당자는 Juhyung으로 해줘.";
    const members = [
      {
        memberId: "member-juhyung",
        name: "Juhyung",
      },
    ];
    const proposal = buildLocalTaskDraftProposal({
      workspaceId,
      message,
      members,
    });

    assert.equal(hasTaskDraftMutationIntent(message), true);
    assert.equal(proposal.type, "task.create.draft");
    assert.equal(proposal.source, "local_fallback");
    assert.equal(proposal.executable, true);
    assert.equal(proposal.payload.title, "AI 검수 작업 1782842175757");
    assert.equal(proposal.payload.description, "AI 액션 검수용");
    assert.equal(proposal.payload.assigneeMemberId, "member-juhyung");

    const client = createTaskGithubProgressClient({ workspaceId, mode: "mock" });
    const draft = await applyTaskAction(
      client,
      {
        type: proposal.type,
        payload: proposal.payload,
      },
      { workspaceId },
    );
    const approved = await client.approveTaskDraft(draft.id);
    const tasks = await client.listTasks(workspaceId);
    const createdTask = tasks.find((task) => task.id === approved.taskId);

    assert.equal(draft.description, "AI 액션 검수용");
    assert.equal(approved.status, "approved");
    assert.equal(createdTask.title, "AI 검수 작업 1782842175757");
    assert.equal(createdTask.assignee.memberId, "member-juhyung");
  });

  it("builds local Canvas memo proposals only for explicit memo mutation intent", () => {
    const workspaceId = mockWorkspaces[0].id;
    const readOnlyQuestion = "캔버스에서 오늘 우선순위를 알려줘";
    const mutationRequest = "캔버스에 오늘 리스크를 메모로 남겨줘";

    assert.equal(hasCanvasMemoMutationIntent(readOnlyQuestion), false);
    assert.equal(hasCanvasMemoMutationIntent(mutationRequest), true);

    const proposal = buildLocalCanvasMemoProposal({
      workspaceId,
      boardId: "board-ai-chat",
      message: mutationRequest,
      currentMember: {
        memberId: "member-1",
        name: "동현",
      },
    });

    assert.equal(proposal.type, "canvas.memo.create");
    assert.equal(proposal.source, "local_fallback");
    assert.equal(proposal.payload.text, mutationRequest);
    assert.equal(proposal.payload.authorName, "동현");

    const quotedProposal = buildLocalCanvasMemoProposal({
      workspaceId,
      boardId: "board-ai-chat",
      message:
        "프로젝트 맵 캔버스에 메모 컴포넌트로 '동현: 오늘 회의 늦을 것 같습니다'라고 남겨줘",
    });

    assert.equal(
      quotedProposal.payload.text,
      "동현: 오늘 회의 늦을 것 같습니다",
    );
    assert.equal(
      quotedProposal.payload.title,
      "동현: 오늘 회의 늦을 것 같습니다",
    );
  });

  it("keeps read-only Workspace AI chat API failures as fallback answers without action proposals", () => {
    const question = "회의 결정사항 기준으로 막힌 일 정리해줘";
    const userMessage = workspaceAiChatUserMessageFromError({ status: 401 });
    const fallbackAnswer = buildWorkspaceAiChatFallbackAnswer({
      message: question,
      reason: userMessage,
    });

    assert.equal(hasCanvasMemoMutationIntent(question), false);
    assert.equal(
      userMessage,
      "AI 채팅을 사용하려면 로그인/세션이 필요합니다.",
    );
    assert.equal(fallbackAnswer.includes("우선순위 제안"), true);
    assert.equal(fallbackAnswer.includes("메모 만들기"), false);
    assert.equal(fallbackAnswer.includes("canvas.memo.create"), false);
  });

  it("defaults Workspace AI chat to API mode when an app-server URL is configured", () => {
    const previousAppServerUrl = process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL;
    const previousLegacyAppServerUrl = process.env.NEXT_PUBLIC_APP_SERVER_URL;
    const previousWorkspaceAiChatMode =
      process.env.NEXT_PUBLIC_PILO_WORKSPACE_AI_CHAT_MODE;
    const previousAgentMode = process.env.NEXT_PUBLIC_PILO_AGENT_MODE;
    const previousWorkspaceMode = process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE;

    try {
      process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL = "http://localhost:4000";
      delete process.env.NEXT_PUBLIC_APP_SERVER_URL;
      delete process.env.NEXT_PUBLIC_PILO_WORKSPACE_AI_CHAT_MODE;
      delete process.env.NEXT_PUBLIC_PILO_AGENT_MODE;
      delete process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE;

      assert.equal(defaultWorkspaceAiChatAgentMode(), "api");
      assert.equal(resolveWorkspaceAiChatAgentMode(), "api");

      process.env.NEXT_PUBLIC_PILO_AGENT_MODE = "mock";
      assert.equal(defaultWorkspaceAiChatAgentMode(), "mock");
      assert.equal(resolveWorkspaceAiChatAgentMode(), "mock");

      process.env.NEXT_PUBLIC_PILO_WORKSPACE_AI_CHAT_MODE = "api";
      assert.equal(defaultWorkspaceAiChatAgentMode(), "api");
      assert.equal(resolveWorkspaceAiChatAgentMode(), "api");
    } finally {
      if (previousAppServerUrl === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL;
      } else {
        process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL = previousAppServerUrl;
      }

      if (previousLegacyAppServerUrl === undefined) {
        delete process.env.NEXT_PUBLIC_APP_SERVER_URL;
      } else {
        process.env.NEXT_PUBLIC_APP_SERVER_URL = previousLegacyAppServerUrl;
      }

      if (previousWorkspaceAiChatMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_WORKSPACE_AI_CHAT_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_WORKSPACE_AI_CHAT_MODE =
          previousWorkspaceAiChatMode;
      }

      if (previousAgentMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_AGENT_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_AGENT_MODE = previousAgentMode;
      }

      if (previousWorkspaceMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE = previousWorkspaceMode;
      }
    }
  });

  it("creates and persists Canvas memo shapes after AI action confirmation", async () => {
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
      const workspaceId = "workspace-ai-canvas-memo";
      const client = createMockCanvasClient();
      const defaultBoardId = createMockCanvasBoardDetail(workspaceId).id;

      globalThis.localStorage.setItem(
        canvasStorageKey(defaultBoardId, "filter-setting"),
        JSON.stringify({
          enabledEntityTypes: ["task"],
          assigneeMemberId: null,
          showDelayedOnly: true,
          showRiskOnly: true,
          filters: {},
        }),
      );
      globalThis.localStorage.setItem(
        canvasStorageKey(defaultBoardId, "view-setting"),
        JSON.stringify({
          zoom: 2,
          viewportX: 2000,
          viewportY: 2000,
        }),
      );

      const result = await createCanvasMemo(
        {
          workspaceId,
          text: "AI가 승인 후 만든 캔버스 메모",
          authorId: "member-ai",
          authorName: "동현",
          createdAt: "2026-06-30T09:00:00.000Z",
          position: { x: 240, y: 320 },
        },
        { client },
      );
      const board = await client.getBoardDetail(result.boardId, {
        workspaceId,
      });
      const memoShape = board.shapes.find(
        (shape) => shape.id === result.shape.id,
      );

      assert.equal(result.href, workspaceCanvasBoardHref(workspaceId, result.boardId));
      assert.equal(memoShape.entityType, "memo");
      assert.equal(memoShape.shapeType, "memo");
      assert.equal(memoShape.body, "AI가 승인 후 만든 캔버스 메모");
      assert.equal(memoShape.authorName, "동현");
      assert.equal(memoShape.createdAt, "2026-06-30T09:00:00.000Z");
      assert.deepEqual(memoShape.position, { x: 240, y: 320 });
      assert.equal(
        board.filterSetting.enabledEntityTypes.includes("memo"),
        true,
      );
      const storedFilterSetting = JSON.parse(
        storage.get(canvasStorageKey(result.boardId, "filter-setting")),
      );

      assert.equal(
        storedFilterSetting.enabledEntityTypes.includes("memo"),
        true,
      );
      assert.equal(storedFilterSetting.showDelayedOnly, false);
      assert.equal(storedFilterSetting.showRiskOnly, false);
      assert.equal(
        storage.has(canvasStorageKey(result.boardId, "view-setting")),
        false,
      );

      storage.set(
        canvasStorageKey(workspaceId, "mock-board-list"),
        JSON.stringify([createMockCanvasBoardDetail(workspaceId)]),
      );

      const reloadedBoard = await createMockCanvasClient().getBoardDetail(
        result.boardId,
        { workspaceId },
      );
      const reloadedMemoShape = reloadedBoard.shapes.find(
        (shape) => shape.id === result.shape.id,
      );

      assert.equal(
        reloadedMemoShape.body,
        "AI가 승인 후 만든 캔버스 메모",
      );
      assert.equal(reloadedMemoShape.entityType, "memo");
    } finally {
      if (previousLocalStorage === undefined) {
        delete globalThis.localStorage;
      } else {
        globalThis.localStorage = previousLocalStorage;
      }
    }
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

  it("calls Daily Briefing GET and regenerate endpoints with runtime metadata", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const requests = [];
    const firstBriefing = {
      ...createWorkspaceDailyBriefingFixture(workspaceId),
      generatedAt: "2026-06-30T01:00:00.000Z",
      usedModel: "gpt-4.1-mini",
      fallback: false,
      projectBriefing: {
        headline: "프로젝트 브리핑",
        summary: "런타임 프로젝트 요약",
        highlights: ["작업 흐름이 갱신됨"],
        risks: ["리뷰 대기 확인 필요"],
        recommendedActions: ["작업 보드를 확인하세요"],
      },
      personalBriefing: {
        headline: "나의 브리핑",
        summary: "개인 작업 요약",
        myTasks: ["오늘 할 일 확인"],
        needsAttention: ["막힌 작업 확인"],
        recommendedActions: ["우선순위 갱신"],
      },
      sourceDetails: [{ source: "github", status: "deferred" }],
      warnings: ["github_deferred"],
    };
    const regeneratedBriefing = {
      ...firstBriefing,
      generatedAt: "2026-06-30T02:00:00.000Z",
      projectBriefing: {
        ...firstBriefing.projectBriefing,
        headline: "재생성된 프로젝트 브리핑",
      },
    };
    const client = createWorkspaceDailyBriefingApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher: async (url, init = {}) => {
        requests.push({ url, init });

        return Response.json(
          init.method === "POST" ? regeneratedBriefing : firstBriefing,
        );
      },
    });

    const current = await client.getDailyBriefing(workspaceId);
    const regenerated = await client.regenerateDailyBriefing(workspaceId);

    assert.equal(
      requests[0].url,
      `https://api.pilo.dev/api/workspaces/${workspaceId}/daily-briefing`,
    );
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.method ?? "GET", "GET");
    assert.equal(
      requests[1].url,
      `https://api.pilo.dev/api/workspaces/${workspaceId}/daily-briefing/regenerate`,
    );
    assert.equal(requests[1].init.method, "POST");
    assert.equal(current.usedModel, "gpt-4.1-mini");
    assert.equal(current.fallback, false);
    assert.equal(current.generatedAt, "2026-06-30T01:00:00.000Z");
    assert.equal(current.sourceDetails[0].status, "deferred");
    assert.equal(regenerated.generatedAt, "2026-06-30T02:00:00.000Z");
    assert.equal(
      regenerated.projectBriefing.headline,
      "재생성된 프로젝트 브리핑",
    );
  });

  it("keeps Daily Briefing mock fallback explicit", async () => {
    const workspaceId = "workspace-daily-briefing-fallback";
    const client = createMockWorkspaceDailyBriefingClient();

    const briefing = await client.getDailyBriefing(workspaceId);

    assert.equal(briefing.workspaceId, workspaceId);
    assert.equal(briefing.fallback, true);
    assert.equal(briefing.usedModel, null);
    assert.ok(briefing.generatedAt);
    assert.ok(briefing.projectBriefing.headline);
    assert.ok(briefing.personalBriefing.headline);
    assert.deepEqual(briefing.sources, {
      dashboard: true,
      tasks: true,
      progress: true,
      meetings: true,
      reviews: true,
    });
    assert.ok(briefing.warnings.includes("daily_briefing_fixture_fallback"));
  });

  it("keeps Daily Briefing in mock mode when the dashboard is mock", async () => {
    const workspaceId = "workspace-daily-briefing-mock-dashboard";
    const previousAuthMode = process.env.NEXT_PUBLIC_PILO_AUTH_MODE;
    const previousDashboardMode = process.env.NEXT_PUBLIC_PILO_DASHBOARD_MODE;
    const previousWorkspaceMode = process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE;
    const previousDailyBriefingMode =
      process.env.NEXT_PUBLIC_PILO_DAILY_BRIEFING_MODE;
    let apiCalled = false;

    try {
      process.env.NEXT_PUBLIC_PILO_AUTH_MODE = "api";
      delete process.env.NEXT_PUBLIC_PILO_DASHBOARD_MODE;
      delete process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE;
      delete process.env.NEXT_PUBLIC_PILO_DAILY_BRIEFING_MODE;

      const client = createWorkspaceDailyBriefingClient({
        fetcher: async () => {
          apiCalled = true;
          return new Response(null, { status: 401 });
        },
      });
      const briefing = await client.getDailyBriefing(workspaceId);

      assert.equal(defaultWorkspaceDailyBriefingMode(), "mock");
      assert.equal(apiCalled, false);
      assert.equal(briefing.workspaceId, workspaceId);
      assert.equal(briefing.fallback, true);
    } finally {
      if (previousAuthMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_AUTH_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_AUTH_MODE = previousAuthMode;
      }

      if (previousDashboardMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_DASHBOARD_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_DASHBOARD_MODE = previousDashboardMode;
      }

      if (previousWorkspaceMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE = previousWorkspaceMode;
      }

      if (previousDailyBriefingMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_DAILY_BRIEFING_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_DAILY_BRIEFING_MODE =
          previousDailyBriefingMode;
      }
    }
  });

  it("keeps Daily Briefing API mode explicit and maps unauthenticated errors", async () => {
    const workspaceId = "workspace-daily-briefing-api-guest";
    const requests = [];
    const previousDashboardMode = process.env.NEXT_PUBLIC_PILO_DASHBOARD_MODE;
    const previousDailyBriefingMode =
      process.env.NEXT_PUBLIC_PILO_DAILY_BRIEFING_MODE;

    try {
      process.env.NEXT_PUBLIC_PILO_DASHBOARD_MODE = "mock";
      process.env.NEXT_PUBLIC_PILO_DAILY_BRIEFING_MODE = "api";

      const client = createWorkspaceDailyBriefingClient({
        baseUrl: "https://api.pilo.dev",
        fetcher: async (url, init = {}) => {
          requests.push({ url, init });
          return new Response(null, { status: 401 });
        },
      });

      await assert.rejects(
        () => client.regenerateDailyBriefing(workspaceId),
        (error) => {
          const userMessage = dailyBriefingUserMessageFromError(error);

          assert.equal(error.status, 401);
          assert.equal(
            userMessage,
            "AI 브리핑을 불러오려면 로그인/세션이 필요합니다.",
          );
          assert.equal(userMessage.includes("Failed"), false);
          return true;
        },
      );

      assert.equal(defaultWorkspaceDailyBriefingMode(), "api");
      assert.equal(requests[0].init.credentials, "include");
      assert.equal(requests[0].init.method, "POST");
    } finally {
      if (previousDashboardMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_DASHBOARD_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_DASHBOARD_MODE = previousDashboardMode;
      }

      if (previousDailyBriefingMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_DAILY_BRIEFING_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_DAILY_BRIEFING_MODE =
          previousDailyBriefingMode;
      }
    }
  });

  it("uses user-friendly Daily Briefing messages for auth failures", () => {
    assert.equal(
      dailyBriefingUserMessageFromError(
        new WorkspaceDailyBriefingApiError("Failed to load daily briefing", {
          status: 401,
        }),
      ),
      "AI 브리핑을 불러오려면 로그인/세션이 필요합니다.",
    );
    assert.equal(
      dailyBriefingUserMessageFromError(new Error("Failed to load daily briefing")),
      "데일리 브리핑을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  });

  it("preserves app-server Daily Briefing source maps and normalizes details", () => {
    const workspaceId = "workspace-daily-briefing-source-details";
    const briefing = normalizeWorkspaceDailyBriefing(
      {
        workspaceId,
        generatedAt: "2026-06-30T03:00:00.000Z",
        usedModel: "gpt-4.1-mini",
        fallback: false,
        projectBriefing: {
          headline: "프로젝트 브리핑",
          summary: "실제 출처 기반 요약",
          highlights: [],
          risks: [],
          recommendedActions: [],
        },
        personalBriefing: {
          headline: "나의 브리핑",
          summary: "현재 멤버 기준 요약",
          myTasks: [],
          needsAttention: [],
          recommendedActions: [],
        },
        sources: {
          dashboard: true,
          tasks: true,
          progress: true,
          meetings: true,
          reviews: true,
        },
        sourceDetails: {
          dashboard: "fixture",
          tasks: "dashboard_read_model",
          progress: "dashboard_read_model",
          meetings: "empty",
          reviews: "empty",
          github: "deferred",
          personalization: "current_member",
        },
        warnings: ["github_deferred"],
      },
      { workspaceId },
    );

    assert.deepEqual(briefing.sources, {
      dashboard: true,
      tasks: true,
      progress: true,
      meetings: true,
      reviews: true,
    });
    assert.equal(
      briefing.sourceDetails.find((detail) => detail.source === "github")
        ?.status,
      "deferred",
    );
    assert.equal(
      briefing.sourceDetails.find((detail) => detail.source === "github")?.label,
      "워크스페이스 기준 참고 신호",
    );
    assert.equal(
      briefing.sourceDetails.find(
        (detail) => detail.source === "personalization",
      )?.label,
      "현재 멤버 기준",
    );
    assert.equal(
      briefing.sourceDetails.find((detail) => detail.source === "tasks")
        ?.status,
      "dashboard_read_model",
    );
    assert.equal(
      briefing.sourceDetails.find((detail) => detail.source === "meetings")
        ?.label,
      "데이터 없음",
    );
  });

  it("keeps Daily Briefing array sourceDetails compatible", () => {
    const workspaceId = "workspace-daily-briefing-array-details";
    const briefing = normalizeWorkspaceDailyBriefing(
      {
        ...createWorkspaceDailyBriefingFixture(workspaceId),
        sources: ["dashboard", "tasks"],
        sourceDetails: [
          {
            source: "dashboard",
            status: "fixture",
            label: "워크스페이스 기준 참고 신호",
          },
        ],
      },
      { workspaceId },
    );

    assert.deepEqual(briefing.sources, ["dashboard", "tasks"]);
    assert.deepEqual(briefing.sourceDetails[0], {
      source: "dashboard",
      status: "fixture",
      label: "워크스페이스 기준 참고 신호",
    });
  });
});
