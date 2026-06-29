import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { BadRequestException, NotFoundException } = require("@nestjs/common");
const {
  JuhyungPublicAdapter,
} = require("../src/modules/juhyung/juhyung-public.adapter");
const {
  JuhyungTaskService,
} = require("../src/modules/juhyung/juhyung-task.service");
const {
  JuhyungTasksController,
} = require("../src/modules/juhyung/juhyung-tasks.controller");

const UUIDS = {
  workspace: "11111111-1111-4111-8111-111111111111",
  task: "22222222-2222-4222-8222-222222222222",
  comment: "88888888-8888-4888-8888-888888888888",
  activity: "99999999-9999-4999-8999-999999999999",
  checklistItem: "77777777-7777-4777-8777-777777777777",
  dependency: "12121212-1212-4121-8121-121212121212",
  dependsOnTask: "abababab-abab-4aba-8bab-abababababab",
  cycleTask: "cdcdcdcd-cdcd-4cdc-8dcd-cdcdcdcdcdcd",
  taskDraft: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  source: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  member: "33333333-3333-4333-8333-333333333333",
  assignee: "44444444-4444-4444-8444-444444444444",
  milestone: "66666666-6666-4666-8666-666666666666",
  user: "55555555-5555-4555-8555-555555555555",
};

const baseTask = {
  id: UUIDS.task,
  workspaceId: UUIDS.workspace,
  milestoneId: null,
  title: "Connect repository",
  description: null,
  assigneeMemberId: UUIDS.assignee,
  status: "todo",
  priority: "high",
  dueDate: new Date("2026-07-03T00:00:00.000Z"),
  createdByMemberId: UUIDS.member,
  createdAt: new Date("2026-06-27T11:00:00.000Z"),
  updatedAt: new Date("2026-06-27T12:00:00.000Z"),
  deletedAt: null,
};

const baseDependsOnTask = {
  ...baseTask,
  id: UUIDS.dependsOnTask,
  title: "Install GitHub App",
};

const baseTaskDraft = {
  id: UUIDS.taskDraft,
  workspaceId: UUIDS.workspace,
  sourceType: "meeting_action_item",
  sourceId: UUIDS.source,
  title: "Process OAuth callback",
  description: "Handle Google and GitHub callbacks.",
  assigneeMemberId: UUIDS.assignee,
  priority: "high",
  dueDate: new Date("2026-07-03T00:00:00.000Z"),
  status: "draft",
  taskId: null,
  createdByMemberId: UUIDS.member,
  approvedByMemberId: null,
  rejectedByMemberId: null,
  approvedAt: null,
  rejectedAt: null,
  createdAt: new Date("2026-06-28T10:00:00.000Z"),
  updatedAt: new Date("2026-06-28T10:00:00.000Z"),
};

const baseTaskDependency = {
  id: UUIDS.dependency,
  taskId: UUIDS.task,
  dependsOnTaskId: UUIDS.dependsOnTask,
  createdAt: new Date("2026-06-28T11:00:00.000Z"),
};

const baseMilestone = {
  id: UUIDS.milestone,
  workspaceId: UUIDS.workspace,
  title: "MVP Backend",
  status: "planned",
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-07-31T00:00:00.000Z"),
  createdAt: new Date("2026-06-27T10:00:00.000Z"),
  updatedAt: new Date("2026-06-27T12:00:00.000Z"),
};

const baseChecklistItem = {
  id: UUIDS.checklistItem,
  taskId: UUIDS.task,
  title: "Install GitHub App",
  status: "todo",
  sortOrder: 1,
  createdAt: new Date("2026-06-27T12:30:00.000Z"),
  updatedAt: new Date("2026-06-27T12:30:00.000Z"),
};

const baseTaskComment = {
  id: UUIDS.comment,
  taskId: UUIDS.task,
  authorMemberId: UUIDS.member,
  body: "Please connect the GitHub repository before review.",
  createdAt: new Date("2026-06-28T09:00:00.000Z"),
  updatedAt: new Date("2026-06-28T09:00:00.000Z"),
};

const baseTaskActivityLog = {
  id: UUIDS.activity,
  taskId: UUIDS.task,
  actorMemberId: UUIDS.member,
  action: "task.updated",
  beforeValue: {
    title: "Connect repository",
  },
  afterValue: {
    title: "Connect GitHub repository",
  },
  createdAt: new Date("2026-06-28T09:10:00.000Z"),
};

describe("JuhyungTaskService", () => {
  it("lists milestones after workspace membership is verified", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return actor.memberId === UUIDS.assignee
            ? assigneeMember()
            : currentMember();
        },
      },
      repository: {
        listMilestonesForWorkspace: async (workspaceId) => {
          calls.push(["listMilestones", workspaceId]);
          return [baseMilestone];
        },
      },
    });

    const result = await service.listMilestones(UUIDS.workspace, {
      memberId: UUIDS.member,
    });

    assert.deepEqual(result, [
      {
        id: UUIDS.milestone,
        workspaceId: UUIDS.workspace,
        title: "MVP Backend",
        status: "planned",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        updatedAt: "2026-06-27T12:00:00.000Z",
      },
    ]);
    assert.deepEqual(calls, [
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["listMilestones", UUIDS.workspace],
    ]);
  });

  it("creates milestones with normalized dates after checking workspace membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        createMilestone: async (input) => {
          calls.push(["createMilestone", input]);
          return {
            ...baseMilestone,
            ...input,
            updatedAt: new Date("2026-06-28T12:00:00.000Z"),
          };
        },
      },
    });

    const result = await service.createMilestone(
      UUIDS.workspace,
      {
        title: " MVP Backend ",
        status: "in_progress",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      },
      { userId: UUIDS.user },
    );

    assert.equal(result.title, "MVP Backend");
    assert.equal(result.status, "in_progress");
    assert.equal(result.startDate, "2026-07-01");
    assert.deepEqual(calls, [
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      [
        "createMilestone",
        {
          workspaceId: UUIDS.workspace,
          title: "MVP Backend",
          status: "in_progress",
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          endDate: new Date("2026-07-31T00:00:00.000Z"),
        },
      ],
    ]);
  });

  it("updates milestones after loading the milestone workspace", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getMilestoneById: async (milestoneId) => {
          calls.push(["getMilestone", milestoneId]);
          return baseMilestone;
        },
        updateMilestone: async (milestoneId, input) => {
          calls.push(["updateMilestone", milestoneId, input]);
          return {
            ...baseMilestone,
            id: milestoneId,
            ...input,
            updatedAt: new Date("2026-06-28T13:00:00.000Z"),
          };
        },
      },
    });

    const result = await service.updateMilestone(
      UUIDS.milestone,
      {
        title: "MVP Backend Updated",
        status: "done",
        endDate: null,
      },
      { memberId: UUIDS.member },
    );

    assert.equal(result.title, "MVP Backend Updated");
    assert.equal(result.status, "done");
    assert.equal(result.endDate, null);
    assert.deepEqual(calls, [
      ["getMilestone", UUIDS.milestone],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      [
        "updateMilestone",
        UUIDS.milestone,
        {
          title: "MVP Backend Updated",
          status: "done",
          endDate: null,
        },
      ],
    ]);
  });

  it("rejects invalid milestone date ranges before writing", async () => {
    const service = createService({
      repository: {
        createMilestone: async () => {
          throw new Error("invalid milestone should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.createMilestone(
          UUIDS.workspace,
          {
            title: "MVP Backend",
            startDate: "2026-08-01",
            endDate: "2026-07-31",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("links tasks only to milestones in the same workspace", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        getMilestoneById: async (milestoneId) => {
          calls.push(["getMilestone", milestoneId]);
          return { ...baseMilestone, workspaceId: "other-workspace" };
        },
        updateTask: async () => {
          throw new Error("cross-workspace milestone should not be linked");
        },
      },
    });

    await assert.rejects(
      () =>
        service.updateTask(
          UUIDS.task,
          {
            milestoneId: UUIDS.milestone,
          },
          { memberId: UUIDS.member },
        ),
      NotFoundException,
    );
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["getMilestone", UUIDS.milestone],
    ]);
  });

  it("links tasks to milestones in the same workspace", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return { ...baseTask, assigneeMemberId: null };
        },
        getMilestoneById: async (milestoneId) => {
          calls.push(["getMilestone", milestoneId]);
          return baseMilestone;
        },
        updateTask: async (taskId, input, actorMemberId, previousTask) => {
          calls.push(["update", taskId, input, actorMemberId, previousTask]);
          return {
            ...baseTask,
            assigneeMemberId: null,
            id: taskId,
            ...input,
            updatedAt: new Date("2026-06-28T12:00:00.000Z"),
          };
        },
      },
    });

    const result = await service.updateTask(
      UUIDS.task,
      {
        milestoneId: UUIDS.milestone,
      },
      { memberId: UUIDS.member },
    );

    assert.equal(result.milestoneId, UUIDS.milestone);
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["getMilestone", UUIDS.milestone],
      [
        "update",
        UUIDS.task,
        {
          milestoneId: UUIDS.milestone,
        },
        UUIDS.member,
        { ...baseTask, assigneeMemberId: null },
      ],
    ]);
  });

  it("returns an empty TaskSummary list after workspace membership is verified", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        listTasksForWorkspace: async (workspaceId, options) => {
          calls.push(["list", workspaceId, options]);
          return [];
        },
        listWorkspaceMembersByIds: async () => {
          throw new Error("empty task list should not load members");
        },
      },
    });

    const result = await service.listTasks(
      UUIDS.workspace,
      {},
      {
        userId: UUIDS.user,
      },
    );

    assert.deepEqual(result, []);
    assert.deepEqual(calls, [
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      [
        "list",
        UUIDS.workspace,
        {
          sortBy: "updatedAt",
          sortDirection: "desc",
          limit: 50,
          offset: 0,
        },
      ],
    ]);
  });

  it("passes normalized task list filters, sorting, and pagination to the repository", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        listTasksForWorkspace: async (workspaceId, options) => {
          calls.push(["list", workspaceId, options]);
          return [];
        },
      },
    });

    const result = await service.listTasks(
      UUIDS.workspace,
      {
        status: "todo,in_progress",
        assigneeMemberId: UUIDS.assignee,
        priority: ["high", "urgent"],
        dueDateFrom: "2026-07-01",
        dueDateTo: "2026-07-31",
        milestoneId: UUIDS.milestone,
        sortBy: "dueDate",
        sortDirection: "asc",
        limit: "25",
        offset: "50",
      },
      { memberId: UUIDS.member },
    );

    assert.deepEqual(result, []);
    assert.deepEqual(calls, [
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      [
        "list",
        UUIDS.workspace,
        {
          status: ["todo", "in_progress"],
          assigneeMemberId: UUIDS.assignee,
          priority: ["high", "urgent"],
          dueDateFrom: new Date("2026-07-01T00:00:00.000Z"),
          dueDateTo: new Date("2026-07-31T00:00:00.000Z"),
          milestoneId: UUIDS.milestone,
          sortBy: "dueDate",
          sortDirection: "asc",
          limit: 25,
          offset: 50,
        },
      ],
    ]);
  });

  it("rejects invalid task list query values before reading the repository", async () => {
    const service = createService({
      repository: {
        listTasksForWorkspace: async () => {
          throw new Error("invalid query should not read tasks");
        },
      },
    });

    await assert.rejects(
      () =>
        service.listTasks(
          UUIDS.workspace,
          {
            status: "archived",
            limit: "0",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("creates a task with status, priority, assignee, due date, and creator member", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return actor.memberId === UUIDS.assignee
            ? assigneeMember()
            : currentMember();
        },
      },
      repository: {
        createTask: async (input, createdByMemberId) => {
          calls.push(["create", input, createdByMemberId]);
          assert.ok(input.dueDate instanceof Date);
          return {
            ...baseTask,
            ...input,
            createdByMemberId,
            updatedAt: new Date("2026-06-27T12:00:00.000Z"),
          };
        },
      },
    });

    const result = await service.createTask(
      UUIDS.workspace,
      {
        title: "Connect repository",
        description: "Install GitHub App",
        status: "in_progress",
        priority: "high",
        assigneeMemberId: UUIDS.assignee,
        dueDate: "2026-07-03",
      },
      { userId: UUIDS.user },
    );

    assert.equal(result.status, "in_progress");
    assert.equal(result.priority, "high");
    assert.deepEqual(result.assignee, {
      memberId: UUIDS.assignee,
      userId: UUIDS.user,
      name: "Assignee",
    });
    assert.equal(result.dueDate, "2026-07-03");
    assert.deepEqual(calls, [
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      ["access", UUIDS.workspace, { memberId: UUIDS.assignee }],
      [
        "create",
        {
          workspaceId: UUIDS.workspace,
          title: "Connect repository",
          description: "Install GitHub App",
          status: "in_progress",
          priority: "high",
          assigneeMemberId: UUIDS.assignee,
          dueDate: new Date("2026-07-03T00:00:00.000Z"),
          milestoneId: null,
        },
        UUIDS.member,
      ],
    ]);
  });

  it("rejects invalid task create input before writing to the repository", async () => {
    const service = createService({
      repository: {
        createTask: async () => {
          throw new Error("invalid input should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.createTask(
          UUIDS.workspace,
          {
            title: " ",
            priority: "later",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("creates task drafts after checking workspace and assignee membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return actor.memberId === UUIDS.assignee
            ? assigneeMember()
            : currentMember();
        },
      },
      repository: {
        createTaskDraft: async (input, createdByMemberId) => {
          calls.push(["createDraft", input, createdByMemberId]);
          assert.ok(input.dueDate instanceof Date);
          return {
            ...baseTaskDraft,
            ...input,
            createdByMemberId,
          };
        },
      },
    });

    const result = await service.createTaskDraft(
      UUIDS.workspace,
      {
        workspaceId: UUIDS.workspace,
        sourceType: "meeting_action_item",
        sourceId: UUIDS.source,
        title: " Process OAuth callback ",
        description: "Handle Google and GitHub callbacks.",
        assigneeMemberId: UUIDS.assignee,
        priority: "high",
        dueDate: "2026-07-03",
      },
      { userId: UUIDS.user },
    );

    assert.deepEqual(result, {
      id: UUIDS.taskDraft,
      workspaceId: UUIDS.workspace,
      sourceType: "meeting_action_item",
      sourceId: UUIDS.source,
      title: "Process OAuth callback",
      description: "Handle Google and GitHub callbacks.",
      assigneeMemberId: UUIDS.assignee,
      priority: "high",
      dueDate: "2026-07-03",
      status: "draft",
      taskId: null,
      createdAt: "2026-06-28T10:00:00.000Z",
      updatedAt: "2026-06-28T10:00:00.000Z",
    });
    assert.deepEqual(calls, [
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      ["access", UUIDS.workspace, { memberId: UUIDS.assignee }],
      [
        "createDraft",
        {
          workspaceId: UUIDS.workspace,
          sourceType: "meeting_action_item",
          sourceId: UUIDS.source,
          title: "Process OAuth callback",
          description: "Handle Google and GitHub callbacks.",
          assigneeMemberId: UUIDS.assignee,
          priority: "high",
          dueDate: new Date("2026-07-03T00:00:00.000Z"),
        },
        UUIDS.member,
      ],
    ]);
  });

  it("approves task drafts by creating a task from the stored draft", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskDraftById: async (draftId) => {
          calls.push(["getDraft", draftId]);
          return baseTaskDraft;
        },
        approveTaskDraft: async (draftId, input, actorMemberId) => {
          calls.push(["approveDraft", draftId, input, actorMemberId]);
          assert.ok(input.dueDate instanceof Date);
          return {
            ...baseTaskDraft,
            status: "approved",
            taskId: UUIDS.task,
            approvedByMemberId: actorMemberId,
            approvedAt: new Date("2026-06-28T11:00:00.000Z"),
            updatedAt: new Date("2026-06-28T11:00:00.000Z"),
          };
        },
      },
    });

    const result = await service.approveTaskDraft(UUIDS.taskDraft, {
      memberId: UUIDS.member,
    });

    assert.equal(result.status, "approved");
    assert.equal(result.taskId, UUIDS.task);
    assert.deepEqual(calls, [
      ["getDraft", UUIDS.taskDraft],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["access", UUIDS.workspace, { memberId: UUIDS.assignee }],
      [
        "approveDraft",
        UUIDS.taskDraft,
        {
          workspaceId: UUIDS.workspace,
          title: "Process OAuth callback",
          description: "Handle Google and GitHub callbacks.",
          assigneeMemberId: UUIDS.assignee,
          status: "todo",
          priority: "high",
          dueDate: new Date("2026-07-03T00:00:00.000Z"),
          milestoneId: null,
        },
        UUIDS.member,
      ],
    ]);
  });

  it("rejects task drafts without creating tasks", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskDraftById: async (draftId) => {
          calls.push(["getDraft", draftId]);
          return baseTaskDraft;
        },
        approveTaskDraft: async () => {
          throw new Error("rejected draft should not create a task");
        },
        rejectTaskDraft: async (draftId, actorMemberId) => {
          calls.push(["rejectDraft", draftId, actorMemberId]);
          return {
            ...baseTaskDraft,
            status: "rejected",
            rejectedByMemberId: actorMemberId,
            rejectedAt: new Date("2026-06-28T11:05:00.000Z"),
            updatedAt: new Date("2026-06-28T11:05:00.000Z"),
          };
        },
      },
    });

    const result = await service.rejectTaskDraft(UUIDS.taskDraft, {
      memberId: UUIDS.member,
    });

    assert.equal(result.status, "rejected");
    assert.equal(result.taskId, null);
    assert.deepEqual(calls, [
      ["getDraft", UUIDS.taskDraft],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["rejectDraft", UUIDS.taskDraft, UUIDS.member],
    ]);
  });

  it("rejects approving terminal task drafts before writing", async () => {
    const service = createService({
      repository: {
        getTaskDraftById: async () => ({
          ...baseTaskDraft,
          status: "approved",
          taskId: UUIDS.task,
        }),
        approveTaskDraft: async () => {
          throw new Error("terminal draft should not be approved twice");
        },
      },
    });

    await assert.rejects(
      () =>
        service.approveTaskDraft(UUIDS.taskDraft, {
          memberId: UUIDS.member,
        }),
      BadRequestException,
    );
  });

  it("rejects task draft approvals when the repository cannot claim the draft", async () => {
    const service = createService({
      repository: {
        getTaskDraftById: async () => baseTaskDraft,
        approveTaskDraft: async () => null,
      },
    });

    await assert.rejects(
      () =>
        service.approveTaskDraft(UUIDS.taskDraft, {
          memberId: UUIDS.member,
        }),
      BadRequestException,
    );
  });

  it("returns task detail only after checking membership in the task workspace", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        listWorkspaceMembersByIds: async (workspaceId, memberIds) => {
          calls.push(["members", workspaceId, memberIds]);
          return [assigneeMember()];
        },
        listChecklistItemsForTask: async (taskId) => {
          calls.push(["checklist", taskId]);
          return [baseChecklistItem];
        },
      },
    });

    const result = await service.getTask(UUIDS.task, {
      memberId: UUIDS.member,
    });

    assert.equal(result.id, UUIDS.task);
    assert.equal(result.assignee?.name, "Assignee");
    assert.deepEqual(result.checklistItems, [
      {
        id: UUIDS.checklistItem,
        taskId: UUIDS.task,
        title: "Install GitHub App",
        status: "todo",
        sortOrder: 1,
        updatedAt: "2026-06-27T12:30:00.000Z",
      },
    ]);
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["members", UUIDS.workspace, [UUIDS.assignee]],
      ["checklist", UUIDS.task],
    ]);
  });

  it("throws NotFoundException when task detail does not exist", async () => {
    const service = createService({
      repository: {
        getTaskById: async () => null,
      },
    });

    await assert.rejects(
      () => service.getTask(UUIDS.task, { memberId: UUIDS.member }),
      NotFoundException,
    );
  });

  it("patches mutable task fields after checking workspace and assignee membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return actor.memberId === UUIDS.assignee
            ? assigneeMember()
            : currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return { ...baseTask, assigneeMemberId: null, dueDate: null };
        },
        updateTask: async (taskId, input, actorMemberId, previousTask) => {
          calls.push(["update", taskId, input, actorMemberId, previousTask]);
          return {
            ...baseTask,
            ...input,
            id: taskId,
            updatedAt: new Date("2026-06-28T12:00:00.000Z"),
          };
        },
      },
    });

    const result = await service.updateTask(
      UUIDS.task,
      {
        title: "Connect GitHub repository",
        description: "Install the GitHub App",
        assigneeMemberId: UUIDS.assignee,
        dueDate: "2026-07-04",
        milestoneId: null,
      },
      { memberId: UUIDS.member },
    );

    assert.equal(result.title, "Connect GitHub repository");
    assert.equal(result.dueDate, "2026-07-04");
    assert.deepEqual(result.assignee, {
      memberId: UUIDS.assignee,
      userId: UUIDS.user,
      name: "Assignee",
    });
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["access", UUIDS.workspace, { memberId: UUIDS.assignee }],
      [
        "update",
        UUIDS.task,
        {
          title: "Connect GitHub repository",
          description: "Install the GitHub App",
          assigneeMemberId: UUIDS.assignee,
          dueDate: new Date("2026-07-04T00:00:00.000Z"),
          milestoneId: null,
        },
        UUIDS.member,
        { ...baseTask, assigneeMemberId: null, dueDate: null },
      ],
    ]);
  });

  it("rejects invalid task patch input before updating the repository", async () => {
    const service = createService({
      repository: {
        updateTask: async () => {
          throw new Error("invalid patch should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.updateTask(
          UUIDS.task,
          {
            title: " ",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("changes task status and records an activity log actor", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        updateTaskStatus: async (
          taskId,
          status,
          actorMemberId,
          previousStatus,
        ) => {
          calls.push(["status", taskId, status, actorMemberId, previousStatus]);
          return {
            ...baseTask,
            id: taskId,
            status,
            updatedAt: new Date("2026-06-28T12:00:00.000Z"),
          };
        },
        listWorkspaceMembersByIds: async (workspaceId, memberIds) => {
          calls.push(["members", workspaceId, memberIds]);
          return [assigneeMember()];
        },
      },
    });

    const result = await service.updateTaskStatus(
      UUIDS.task,
      { status: "in_review" },
      { userId: UUIDS.user },
    );

    assert.equal(result.status, "in_review");
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      ["status", UUIDS.task, "in_review", UUIDS.member, "todo"],
      ["members", UUIDS.workspace, [UUIDS.assignee]],
    ]);
  });

  it("rejects invalid status transitions before writing the repository", async () => {
    const service = createService({
      repository: {
        updateTaskStatus: async () => {
          throw new Error("invalid status should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.updateTaskStatus(
          UUIDS.task,
          {
            status: "archived",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("soft deletes a task after checking workspace membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        softDeleteTask: async (taskId) => {
          calls.push(["delete", taskId]);
        },
      },
    });

    await service.deleteTask(UUIDS.task, { memberId: UUIDS.member });

    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["delete", UUIDS.task],
    ]);
  });

  it("creates task dependencies after checking workspace membership and cycle safety", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return taskId === UUIDS.dependsOnTask ? baseDependsOnTask : baseTask;
        },
        getTaskDependency: async (taskId, dependsOnTaskId) => {
          calls.push(["findDependency", taskId, dependsOnTaskId]);
          return null;
        },
        listTaskDependenciesForWorkspace: async (workspaceId) => {
          calls.push(["listDependencies", workspaceId]);
          return [];
        },
        createTaskDependency: async (taskId, dependsOnTaskId) => {
          calls.push(["createDependency", taskId, dependsOnTaskId]);
          return baseTaskDependency;
        },
      },
    });

    const result = await service.createTaskDependency(
      UUIDS.task,
      {
        dependsOnTaskId: UUIDS.dependsOnTask,
      },
      { memberId: UUIDS.member },
    );

    assert.deepEqual(result, {
      id: UUIDS.dependency,
      taskId: UUIDS.task,
      dependsOnTaskId: UUIDS.dependsOnTask,
      createdAt: "2026-06-28T11:00:00.000Z",
    });
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["get", UUIDS.dependsOnTask],
      ["findDependency", UUIDS.task, UUIDS.dependsOnTask],
      ["listDependencies", UUIDS.workspace],
      ["createDependency", UUIDS.task, UUIDS.dependsOnTask],
    ]);
  });

  it("rejects self task dependencies before writing", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        createTaskDependency: async () => {
          throw new Error("self dependency should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.createTaskDependency(
          UUIDS.task,
          {
            dependsOnTaskId: UUIDS.task,
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
    ]);
  });

  it("rejects duplicate task dependencies before writing", async () => {
    const service = createService({
      repository: {
        getTaskById: async (taskId) =>
          taskId === UUIDS.dependsOnTask ? baseDependsOnTask : baseTask,
        getTaskDependency: async () => baseTaskDependency,
        createTaskDependency: async () => {
          throw new Error("duplicate dependency should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.createTaskDependency(
          UUIDS.task,
          {
            dependsOnTaskId: UUIDS.dependsOnTask,
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("rejects task dependencies that would create a cycle", async () => {
    const service = createService({
      repository: {
        getTaskById: async (taskId) =>
          taskId === UUIDS.dependsOnTask ? baseDependsOnTask : baseTask,
        getTaskDependency: async () => null,
        listTaskDependenciesForWorkspace: async () => [
          {
            id: "dependency-2",
            taskId: UUIDS.dependsOnTask,
            dependsOnTaskId: UUIDS.cycleTask,
            createdAt: new Date("2026-06-28T11:00:00.000Z"),
          },
          {
            id: "dependency-3",
            taskId: UUIDS.cycleTask,
            dependsOnTaskId: UUIDS.task,
            createdAt: new Date("2026-06-28T11:05:00.000Z"),
          },
        ],
        createTaskDependency: async () => {
          throw new Error("cyclic dependency should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.createTaskDependency(
          UUIDS.task,
          {
            dependsOnTaskId: UUIDS.dependsOnTask,
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("deletes task dependencies after checking task workspace membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        deleteTaskDependency: async (taskId, dependsOnTaskId) => {
          calls.push(["deleteDependency", taskId, dependsOnTaskId]);
          return { count: 1 };
        },
      },
    });

    await service.deleteTaskDependency(UUIDS.task, UUIDS.dependsOnTask, {
      memberId: UUIDS.member,
    });

    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["deleteDependency", UUIDS.task, UUIDS.dependsOnTask],
    ]);
  });

  it("creates task comments after checking task workspace membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        createTaskComment: async (taskId, input, authorMemberId) => {
          calls.push(["createComment", taskId, input, authorMemberId]);
          return {
            ...baseTaskComment,
            taskId,
            body: input.body,
            authorMemberId,
          };
        },
      },
    });

    const result = await service.createTaskComment(
      UUIDS.task,
      {
        body: "  Please connect the GitHub repository before review.  ",
      },
      { userId: UUIDS.user },
    );

    assert.deepEqual(result, {
      id: UUIDS.comment,
      taskId: UUIDS.task,
      body: "Please connect the GitHub repository before review.",
      author: {
        memberId: UUIDS.member,
        userId: UUIDS.user,
        name: "Creator",
      },
      createdAt: "2026-06-28T09:00:00.000Z",
      updatedAt: "2026-06-28T09:00:00.000Z",
    });
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      [
        "createComment",
        UUIDS.task,
        {
          body: "Please connect the GitHub repository before review.",
        },
        UUIDS.member,
      ],
    ]);
  });

  it("lists task comments with author member summaries", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        listTaskComments: async (taskId) => {
          calls.push(["comments", taskId]);
          return [baseTaskComment];
        },
        listWorkspaceMembersByIds: async (workspaceId, memberIds) => {
          calls.push(["members", workspaceId, memberIds]);
          return [currentMember()];
        },
      },
    });

    const result = await service.listTaskComments(UUIDS.task, {
      memberId: UUIDS.member,
    });

    assert.equal(result[0].author.name, "Creator");
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["comments", UUIDS.task],
      ["members", UUIDS.workspace, [UUIDS.member]],
    ]);
  });

  it("lists task activity logs with actor member summaries", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        listTaskActivityLogs: async (taskId) => {
          calls.push(["activity", taskId]);
          return [baseTaskActivityLog];
        },
        listWorkspaceMembersByIds: async (workspaceId, memberIds) => {
          calls.push(["members", workspaceId, memberIds]);
          return [currentMember()];
        },
      },
    });

    const result = await service.listTaskActivityLogs(UUIDS.task, {
      memberId: UUIDS.member,
    });

    assert.deepEqual(result, [
      {
        id: UUIDS.activity,
        taskId: UUIDS.task,
        action: "task.updated",
        actor: {
          memberId: UUIDS.member,
          userId: UUIDS.user,
          name: "Creator",
        },
        beforeValue: {
          title: "Connect repository",
        },
        afterValue: {
          title: "Connect GitHub repository",
        },
        createdAt: "2026-06-28T09:10:00.000Z",
      },
    ]);
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["activity", UUIDS.task],
      ["members", UUIDS.workspace, [UUIDS.member]],
    ]);
  });

  it("rejects blank task comments before writing", async () => {
    const service = createService({
      repository: {
        createTaskComment: async () => {
          throw new Error("blank comments should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.createTaskComment(
          UUIDS.task,
          {
            body: " ",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("creates checklist items after checking task workspace membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        createChecklistItem: async (taskId, input) => {
          calls.push(["createChecklist", taskId, input]);
          return {
            ...baseChecklistItem,
            taskId,
            ...input,
            updatedAt: new Date("2026-06-28T10:00:00.000Z"),
          };
        },
      },
    });

    const result = await service.createChecklistItem(
      UUIDS.task,
      {
        title: "Install GitHub App",
        status: "todo",
        sortOrder: 2,
      },
      { memberId: UUIDS.member },
    );

    assert.deepEqual(result, {
      id: UUIDS.checklistItem,
      taskId: UUIDS.task,
      title: "Install GitHub App",
      status: "todo",
      sortOrder: 2,
      updatedAt: "2026-06-28T10:00:00.000Z",
    });
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      [
        "createChecklist",
        UUIDS.task,
        {
          title: "Install GitHub App",
          status: "todo",
          sortOrder: 2,
        },
      ],
    ]);
  });

  it("updates checklist title, completion status, and sort order", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        updateChecklistItem: async (taskId, itemId, input) => {
          calls.push(["updateChecklist", taskId, itemId, input]);
          return {
            ...baseChecklistItem,
            id: itemId,
            taskId,
            ...input,
            updatedAt: new Date("2026-06-28T10:10:00.000Z"),
          };
        },
      },
    });

    const result = await service.updateChecklistItem(
      UUIDS.task,
      UUIDS.checklistItem,
      {
        title: "Install and authorize GitHub App",
        status: "done",
        sortOrder: 0,
      },
      { userId: UUIDS.user },
    );

    assert.equal(result.title, "Install and authorize GitHub App");
    assert.equal(result.status, "done");
    assert.equal(result.sortOrder, 0);
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      [
        "updateChecklist",
        UUIDS.task,
        UUIDS.checklistItem,
        {
          title: "Install and authorize GitHub App",
          status: "done",
          sortOrder: 0,
        },
      ],
    ]);
  });

  it("rejects invalid checklist input before writing", async () => {
    const service = createService({
      repository: {
        createChecklistItem: async () => {
          throw new Error("invalid checklist should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.createChecklistItem(
          UUIDS.task,
          {
            title: "",
            status: "blocked",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("deletes checklist items after checking task workspace membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        deleteChecklistItem: async (taskId, itemId) => {
          calls.push(["deleteChecklist", taskId, itemId]);
          return { count: 1 };
        },
      },
    });

    await service.deleteChecklistItem(UUIDS.task, UUIDS.checklistItem, {
      memberId: UUIDS.member,
    });

    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["deleteChecklist", UUIDS.task, UUIDS.checklistItem],
    ]);
  });
});

describe("JuhyungTasksController", () => {
  it("forwards task routes with workspace and actor context", async () => {
    const calls = [];
    const controller = new JuhyungTasksController({
      listMilestones: async (workspaceId, actor) => {
        calls.push(["listMilestones", workspaceId, actor]);
        return [];
      },
      createMilestone: async (workspaceId, body, actor) => {
        calls.push(["createMilestone", workspaceId, body, actor]);
        return { id: UUIDS.milestone };
      },
      updateMilestone: async (milestoneId, body, actor) => {
        calls.push(["updateMilestone", milestoneId, body, actor]);
        return { id: milestoneId };
      },
      listTasks: async (workspaceId, query, actor) => {
        calls.push(["list", workspaceId, query, actor]);
        return [];
      },
      createTask: async (workspaceId, body, actor) => {
        calls.push(["create", workspaceId, body, actor]);
        return { id: UUIDS.task };
      },
      createTaskDraft: async (workspaceId, body, actor) => {
        calls.push(["createDraft", workspaceId, body, actor]);
        return { id: UUIDS.taskDraft };
      },
      approveTaskDraft: async (draftId, actor) => {
        calls.push(["approveDraft", draftId, actor]);
        return { id: draftId, taskId: UUIDS.task };
      },
      rejectTaskDraft: async (draftId, actor) => {
        calls.push(["rejectDraft", draftId, actor]);
        return { id: draftId, taskId: null };
      },
      getTask: async (taskId, actor) => {
        calls.push(["get", taskId, actor]);
        return { id: taskId };
      },
      updateTask: async (taskId, body, actor) => {
        calls.push(["patch", taskId, body, actor]);
        return { id: taskId };
      },
      updateTaskStatus: async (taskId, body, actor) => {
        calls.push(["status", taskId, body, actor]);
        return { id: taskId };
      },
      deleteTask: async (taskId, actor) => {
        calls.push(["delete", taskId, actor]);
      },
      createTaskDependency: async (taskId, body, actor) => {
        calls.push(["createDependency", taskId, body, actor]);
        return { id: UUIDS.dependency };
      },
      deleteTaskDependency: async (taskId, dependsOnTaskId, actor) => {
        calls.push(["deleteDependency", taskId, dependsOnTaskId, actor]);
      },
      createTaskComment: async (taskId, body, actor) => {
        calls.push(["createComment", taskId, body, actor]);
        return { id: UUIDS.comment };
      },
      listTaskComments: async (taskId, actor) => {
        calls.push(["listComments", taskId, actor]);
        return [];
      },
      listTaskActivityLogs: async (taskId, actor) => {
        calls.push(["listActivity", taskId, actor]);
        return [];
      },
      createChecklistItem: async (taskId, body, actor) => {
        calls.push(["createChecklist", taskId, body, actor]);
        return { id: UUIDS.checklistItem };
      },
      updateChecklistItem: async (taskId, itemId, body, actor) => {
        calls.push(["updateChecklist", taskId, itemId, body, actor]);
        return { id: itemId };
      },
      deleteChecklistItem: async (taskId, itemId, actor) => {
        calls.push(["deleteChecklist", taskId, itemId, actor]);
      },
    });

    await controller.listMilestones(UUIDS.workspace, UUIDS.user, undefined);
    await controller.createMilestone(
      UUIDS.workspace,
      { title: "MVP Backend" },
      undefined,
      UUIDS.member,
    );
    await controller.updateMilestone(
      UUIDS.milestone,
      { status: "done" },
      UUIDS.user,
      UUIDS.member,
    );
    await controller.listTasks(
      UUIDS.workspace,
      { status: "todo" },
      UUIDS.user,
      undefined,
    );
    await controller.createTask(
      UUIDS.workspace,
      { title: "Connect repository" },
      undefined,
      UUIDS.member,
    );
    await controller.createTaskDraft(
      UUIDS.workspace,
      { title: "Process OAuth callback" },
      UUIDS.user,
      undefined,
    );
    await controller.approveTaskDraft(UUIDS.taskDraft, undefined, UUIDS.member);
    await controller.rejectTaskDraft(UUIDS.taskDraft, UUIDS.user, undefined);
    await controller.getTask(UUIDS.task, UUIDS.user, UUIDS.member);
    await controller.updateTask(
      UUIDS.task,
      { title: "Connect repository" },
      UUIDS.user,
      undefined,
    );
    await controller.updateTaskStatus(
      UUIDS.task,
      { status: "done" },
      undefined,
      UUIDS.member,
    );
    await controller.deleteTask(UUIDS.task, UUIDS.user, UUIDS.member);
    await controller.createTaskDependency(
      UUIDS.task,
      { dependsOnTaskId: UUIDS.dependsOnTask },
      undefined,
      UUIDS.member,
    );
    await controller.deleteTaskDependency(
      UUIDS.task,
      UUIDS.dependsOnTask,
      UUIDS.user,
      undefined,
    );
    await controller.createTaskComment(
      UUIDS.task,
      { body: "Ready for review" },
      UUIDS.user,
      undefined,
    );
    await controller.listTaskComments(UUIDS.task, undefined, UUIDS.member);
    await controller.listTaskActivityLogs(UUIDS.task, UUIDS.user, UUIDS.member);
    await controller.createChecklistItem(
      UUIDS.task,
      { title: "Install GitHub App" },
      UUIDS.user,
      undefined,
    );
    await controller.updateChecklistItem(
      UUIDS.task,
      UUIDS.checklistItem,
      { status: "done" },
      undefined,
      UUIDS.member,
    );
    await controller.deleteChecklistItem(
      UUIDS.task,
      UUIDS.checklistItem,
      UUIDS.user,
      UUIDS.member,
    );

    assert.deepEqual(calls, [
      ["listMilestones", UUIDS.workspace, { userId: UUIDS.user }],
      [
        "createMilestone",
        UUIDS.workspace,
        { title: "MVP Backend" },
        { memberId: UUIDS.member },
      ],
      [
        "updateMilestone",
        UUIDS.milestone,
        { status: "done" },
        { userId: UUIDS.user, memberId: UUIDS.member },
      ],
      ["list", UUIDS.workspace, { status: "todo" }, { userId: UUIDS.user }],
      [
        "create",
        UUIDS.workspace,
        { title: "Connect repository" },
        { memberId: UUIDS.member },
      ],
      [
        "createDraft",
        UUIDS.workspace,
        { title: "Process OAuth callback" },
        { userId: UUIDS.user },
      ],
      ["approveDraft", UUIDS.taskDraft, { memberId: UUIDS.member }],
      ["rejectDraft", UUIDS.taskDraft, { userId: UUIDS.user }],
      ["get", UUIDS.task, { userId: UUIDS.user, memberId: UUIDS.member }],
      [
        "patch",
        UUIDS.task,
        { title: "Connect repository" },
        { userId: UUIDS.user },
      ],
      ["status", UUIDS.task, { status: "done" }, { memberId: UUIDS.member }],
      ["delete", UUIDS.task, { userId: UUIDS.user, memberId: UUIDS.member }],
      [
        "createDependency",
        UUIDS.task,
        { dependsOnTaskId: UUIDS.dependsOnTask },
        { memberId: UUIDS.member },
      ],
      [
        "deleteDependency",
        UUIDS.task,
        UUIDS.dependsOnTask,
        { userId: UUIDS.user },
      ],
      [
        "createComment",
        UUIDS.task,
        { body: "Ready for review" },
        { userId: UUIDS.user },
      ],
      ["listComments", UUIDS.task, { memberId: UUIDS.member }],
      [
        "listActivity",
        UUIDS.task,
        { userId: UUIDS.user, memberId: UUIDS.member },
      ],
      [
        "createChecklist",
        UUIDS.task,
        { title: "Install GitHub App" },
        { userId: UUIDS.user },
      ],
      [
        "updateChecklist",
        UUIDS.task,
        UUIDS.checklistItem,
        { status: "done" },
        { memberId: UUIDS.member },
      ],
      [
        "deleteChecklist",
        UUIDS.task,
        UUIDS.checklistItem,
        { userId: UUIDS.user, memberId: UUIDS.member },
      ],
    ]);
  });
});

function createService(overrides = {}) {
  const access = overrides.access ?? {
    requireWorkspaceMember: async () => currentMember(),
  };
  const repository = overrides.repository ?? {};
  return new JuhyungTaskService(repository, access, new JuhyungPublicAdapter());
}

function currentMember() {
  return {
    id: UUIDS.member,
    workspaceId: UUIDS.workspace,
    userId: UUIDS.user,
    displayName: "Creator",
    role: "member",
  };
}

function assigneeMember() {
  return {
    id: UUIDS.assignee,
    workspaceId: UUIDS.workspace,
    userId: UUIDS.user,
    displayName: "Assignee",
    role: "member",
  };
}
