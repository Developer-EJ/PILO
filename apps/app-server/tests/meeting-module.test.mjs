import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import "reflect-metadata";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { GUARDS_METADATA } = require("@nestjs/common/constants");
const {
  MeetingController,
} = require("../src/modules/meeting/meeting.controller");
const {
  MeetingRouteGuard,
} = require("../src/modules/meeting/meeting-route.guard");
const { MeetingService } = require("../src/modules/meeting/meeting.service");
const {
  MockMeetingRepository,
} = require("../src/modules/meeting/repositories/meeting.mock-repository");
const {
  MockCurrentMemberAdapter,
} = require("../src/modules/meeting/adapters/mock-current-member.adapter");
const {
  MockMeetingReportWorkflowClient,
} = require("../src/modules/meeting/adapters/mock-meeting-report-workflow.adapter");
const {
  JuhyungTaskDraftClient,
} = require("../src/modules/meeting/adapters/juhyung-task-draft.adapter");
const {
  MockTaskDraftClient,
} = require("../src/modules/meeting/adapters/mock-task-draft.adapter");
const {
  MEETING_REPOSITORY,
} = require("../src/modules/meeting/repositories/meeting.repository");
const {
  MEETING_STATUS_VALUES,
} = require("../src/modules/meeting/types/meeting.types");
const workspaceDashboardFixture = require("../../../docs/contracts/fixtures/workspace-dashboard.fixture.json");

function createMeetingService(
  repository,
  currentMemberAdapter,
  taskDraftClient = new MockTaskDraftClient(),
) {
  return new MeetingService(
    repository,
    currentMemberAdapter,
    new MockMeetingReportWorkflowClient(),
    taskDraftClient,
  );
}

describe("meeting module scaffold", () => {
  it("keeps the repository behind an injectable token", async () => {
    assert.equal(typeof MEETING_REPOSITORY, "symbol");
  });

  it("exposes scaffold status through the service and controller", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);

    assert.deepEqual(service.getScaffoldStatus(), {
      module: "meeting",
      repositoryMode: "mock",
      meetingStatusValues: MEETING_STATUS_VALUES,
    });
    assert.deepEqual(
      controller.getScaffoldStatus(),
      service.getScaffoldStatus(),
    );
  });

  it("protects workspace meeting routes with the route guard", async () => {
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        MeetingController.prototype.createMeeting,
      ),
      [MeetingRouteGuard],
    );
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        MeetingController.prototype.getReport,
      ),
      [MeetingRouteGuard],
    );
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        MeetingController.prototype.approveActionItem,
      ),
      [MeetingRouteGuard],
    );
    assert.equal(
      Reflect.getMetadata(
        GUARDS_METADATA,
        MeetingController.prototype.getScaffoldStatus,
      ),
      undefined,
    );
  });

  it("creates, lists, and reads meetings by workspace", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);

    const meeting = await controller.createMeeting("workspace-1", {
      title: "Sprint planning",
      purpose: "Plan the next implementation slice",
    });

    assert.equal(meeting.workspaceId, "workspace-1");
    assert.equal(meeting.title, "Sprint planning");
    assert.equal(meeting.purpose, "Plan the next implementation slice");
    assert.equal(meeting.status, "scheduled");
    assert.equal(meeting.startedAt, null);
    assert.equal(meeting.endedAt, null);
    assert.equal(meeting.createdByMemberId.length > 0, true);
    assert.deepEqual(await controller.listMeetings("workspace-1"), [meeting]);
    assert.deepEqual(await controller.listMeetings("workspace-2"), []);
    assert.deepEqual(await controller.getMeeting(meeting.id), meeting);
  });

  it("validates meeting status transitions and timestamps", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);

    const meeting = await service.createMeeting("workspace-1", {
      title: "Status meeting",
    });

    const inProgressMeeting = await service.updateMeetingStatus(meeting.id, {
      status: "in_progress",
    });

    assert.equal(inProgressMeeting.status, "in_progress");
    assert.notEqual(inProgressMeeting.startedAt, null);
    assert.equal(inProgressMeeting.endedAt, null);

    const endedMeeting = await service.updateMeetingStatus(meeting.id, {
      status: "ended",
    });

    assert.equal(endedMeeting.status, "ended");
    assert.notEqual(endedMeeting.startedAt, null);
    assert.notEqual(endedMeeting.endedAt, null);
    assert.equal(
      new Date(endedMeeting.endedAt).getTime() >=
        new Date(endedMeeting.startedAt).getTime(),
      true,
    );
  });

  it("rejects invalid status values and workspace mismatches", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);

    const meeting = await service.createMeeting("workspace-1", {
      title: "Workspace guard meeting",
    });

    await assert.rejects(async () =>
      service.updateMeetingStatus(meeting.id, {
        status: "invalid",
      }),
    );
    await assert.rejects(async () =>
      service.getMeetingForWorkspace("workspace-2", meeting.id),
    );
  });

  it("resolves route workspace ids from meeting reports and action items", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const meeting = await service.createMeeting("workspace-1", {
      title: "Route guard meeting",
    });
    const report = await service.createReport(meeting.id);
    const actionItem = await service.createActionItem(report.id, {
      title: "Guard action item",
    });

    assert.equal(
      await service.resolveRouteWorkspaceId({ meetingId: meeting.id }),
      "workspace-1",
    );
    assert.equal(
      await service.resolveRouteWorkspaceId({ reportId: report.id }),
      "workspace-1",
    );
    assert.equal(
      await service.resolveRouteWorkspaceId({ actionItemId: actionItem.id }),
      "workspace-1",
    );
    await assert.rejects(async () =>
      service.resolveRouteWorkspaceId({
        workspaceId: "workspace-2",
        reportId: report.id,
      }),
    );
  });

  it("adds, lists, and leaves meeting participants by workspace member id", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    currentMemberAdapter.registerWorkspaceMember({
      id: "member-1",
      workspaceId: "workspace-1",
      displayName: "Jinho",
    });
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Participant meeting",
    });

    const participant = await controller.addParticipant(meeting.id, {
      memberId: "member-1",
      role: "facilitator",
    });

    assert.equal(participant.meetingId, meeting.id);
    assert.equal(participant.memberId, "member-1");
    assert.equal(participant.role, "facilitator");
    assert.equal(participant.leftAt, null);
    assert.deepEqual(await controller.listParticipants(meeting.id), [participant]);

    const leftParticipant = await controller.leaveParticipant(
      meeting.id,
      participant.id,
    );

    assert.notEqual(leftParticipant.leftAt, null);
    assert.equal(
      new Date(leftParticipant.leftAt).getTime() >=
        new Date(leftParticipant.joinedAt).getTime(),
      true,
    );
  });

  it("rejects participants from a different workspace", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    currentMemberAdapter.registerWorkspaceMember({
      id: "member-2",
      workspaceId: "workspace-2",
    });
    const service = createMeetingService(repository, currentMemberAdapter);
    const meeting = await service.createMeeting("workspace-1", {
      title: "Workspace member validation meeting",
    });

    await assert.rejects(async () =>
      service.addParticipant(meeting.id, {
        memberId: "member-2",
      }),
    );
  });

  it("creates, lists, updates, and reorders meeting agendas", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Agenda meeting",
    });

    const firstAgenda = await controller.createAgenda(meeting.id, {
      title: "Scope API",
    });
    const secondAgenda = await controller.createAgenda(meeting.id, {
      title: "Review risks",
    });

    assert.equal(firstAgenda.status, "open");
    assert.equal(firstAgenda.sortOrder, 0);
    assert.equal(secondAgenda.sortOrder, 1);
    assert.deepEqual(await controller.listAgendas(meeting.id), [
      firstAgenda,
      secondAgenda,
    ]);

    const doneAgenda = await controller.updateAgendaStatus(
      meeting.id,
      firstAgenda.id,
      {
        status: "done",
      },
    );

    assert.equal(doneAgenda.status, "done");

    const reorderedAgenda = await controller.reorderAgenda(
      meeting.id,
      secondAgenda.id,
      {
        sortOrder: 0,
      },
    );

    assert.equal(reorderedAgenda.sortOrder, 0);
    assert.deepEqual(
      (await controller.listAgendas(meeting.id)).map((agenda) => [
        agenda.id,
        agenda.sortOrder,
      ]),
      [
        [secondAgenda.id, 0],
        [firstAgenda.id, 1],
      ],
    );
  });

  it("rejects invalid meeting agenda status and sort order", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const meeting = await service.createMeeting("workspace-1", {
      title: "Agenda validation meeting",
    });
    const agenda = await service.createAgenda(meeting.id, {
      title: "Validate agenda",
    });

    await assert.rejects(async () =>
      service.updateAgendaStatus(meeting.id, agenda.id, {
        status: "invalid",
      }),
    );
    await assert.rejects(async () =>
      service.reorderAgenda(meeting.id, agenda.id, {
        sortOrder: -1,
      }),
    );
  });

  it("creates and lists meeting memos with workspace member authors", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    currentMemberAdapter.registerWorkspaceMember({
      id: "memo-author",
      workspaceId: "workspace-1",
    });
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Memo meeting",
    });

    const memo = await controller.createMemo(meeting.id, {
      authorMemberId: "memo-author",
      body: "Discussed API shape.",
    });

    assert.equal(memo.meetingId, meeting.id);
    assert.equal(memo.authorMemberId, "memo-author");
    assert.equal(memo.body, "Discussed API shape.");
    assert.deepEqual(await controller.listMemos(meeting.id), [memo]);
  });

  it("defaults memo author to the mock current member", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const meeting = await service.createMeeting("workspace-1", {
      title: "Current member memo meeting",
    });

    const memo = await service.createMemo(meeting.id, {
      body: "Current member wrote this.",
    });

    assert.equal(memo.authorMemberId, "00000000-0000-4000-8000-000000000001");
  });

  it("creates and lists transcript segments in append order", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    currentMemberAdapter.registerWorkspaceMember({
      id: "speaker-1",
      workspaceId: "workspace-1",
    });
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Transcript meeting",
    });

    const textSegment = await controller.createTranscriptSegment(meeting.id, {
      speakerMemberId: "speaker-1",
      body: "Manual transcript input.",
    });
    const sttSegment = await controller.createTranscriptSegment(meeting.id, {
      speakerMemberId: "speaker-1",
      source: "stt",
      body: "STT transcript input.",
      startedAt: "2026-06-28T09:00:00.000Z",
      endedAt: "2026-06-28T09:00:05.000Z",
    });

    assert.equal(textSegment.source, "text");
    assert.equal(textSegment.speakerMemberId, "speaker-1");
    assert.equal(sttSegment.source, "stt");
    assert.deepEqual(await controller.listTranscriptSegments(meeting.id), [
      textSegment,
      sttSegment,
    ]);
  });

  it("rejects invalid transcript source, time range, and speaker workspace", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    currentMemberAdapter.registerWorkspaceMember({
      id: "speaker-2",
      workspaceId: "workspace-2",
    });
    const service = createMeetingService(repository, currentMemberAdapter);
    const meeting = await service.createMeeting("workspace-1", {
      title: "Transcript validation meeting",
    });

    await assert.rejects(async () =>
      service.createTranscriptSegment(meeting.id, {
        source: "voice",
        body: "Invalid source.",
      }),
    );
    await assert.rejects(async () =>
      service.createTranscriptSegment(meeting.id, {
        body: "Invalid time range.",
        startedAt: "2026-06-28T09:00:05.000Z",
        endedAt: "2026-06-28T09:00:00.000Z",
      }),
    );
    await assert.rejects(async () =>
      service.createTranscriptSegment(meeting.id, {
        speakerMemberId: "speaker-2",
        body: "Wrong workspace.",
      }),
    );
  });

  it("generates, reads, and lists recent meeting reports", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Report meeting",
    });
    controller.createMemo(meeting.id, {
      body: "Memo source.",
    });
    controller.createTranscriptSegment(meeting.id, {
      body: "Transcript source.",
    });

    const report = await controller.requestReportGeneration(meeting.id);

    assert.equal(report.meetingId, meeting.id);
    assert.equal(report.workspaceId, "workspace-1");
    assert.equal(report.title, "Report meeting");
    assert.equal(
      report.summary,
      "Report meeting 회의에서 2개 기록을 정리했다.",
    );
    assert.equal(report.decisionCount, 1);
    assert.equal(report.actionItemCount, 1);
    assert.equal(report.riskCount, 1);
    assert.deepEqual(report.decisions, [
      {
        id: report.decisions[0].id,
        reportId: report.id,
        title: "Memo source. 기준으로 후속 작업 범위를 확정했다.",
        content: "Memo source. 기준으로 후속 작업 범위를 확정했다.",
        status: "decided",
        linkedTaskId: null,
        createdAt: report.decisions[0].createdAt,
      },
    ]);
    assert.equal(report.risks[0].severity, "medium");
    assert.equal(report.risks[0].sortOrder, 0);
    assert.equal(
      report.nextAgendas[0].title,
      "Report meeting 후속 진행 상황 확인",
    );
    assert.equal((await controller.listActionItems(report.id))[0].status, "draft");
    assert.deepEqual(await controller.getReport(report.id), report);
    const recentReports = await controller.listRecentReports("workspace-1");

    assert.deepEqual(recentReports, [
      {
        id: report.id,
        meetingId: report.meetingId,
        workspaceId: report.workspaceId,
        title: report.title,
        summary: report.summary,
        decisionCount: 1,
        actionItemCount: 1,
        riskCount: 1,
        createdAt: report.createdAt,
      },
    ]);
    assert.equal("decisions" in recentReports[0], false);
    assert.equal("risks" in recentReports[0], false);
    assert.equal("nextAgendas" in recentReports[0], false);
    assert.equal((await controller.getMeeting(meeting.id)).status, "report_generated");
  });

  it("builds deterministic report workflow output with trace and no LLM call", async () => {
    const workflowClient = new MockMeetingReportWorkflowClient();

    const output = workflowClient.generateReport({
      meetingTitle: "Deterministic report",
      memoBodies: ["Confirm the TaskCreateDraft adapter scope."],
      transcriptBodies: [],
    });

    assert.equal(
      output.summary,
      "Deterministic report 회의에서 1개 기록을 정리했다.",
    );
    assert.equal(output.decisions[0].status, "decided");
    assert.equal(output.risks[0].severity, "low");
    assert.equal(
      output.nextAgendas[0].title,
      "Deterministic report 후속 진행 상황 확인",
    );
    assert.equal(output.actionItems[0].priority, "medium");
    assert.equal(output.trace[1].metadata.usesLlm, false);
    assert.equal(output.error, null);

    const emptyOutput = workflowClient.generateReport({
      meetingTitle: "Empty report",
      memoBodies: [],
      transcriptBodies: [],
    });

    assert.deepEqual(emptyOutput.decisions, []);
    assert.deepEqual(emptyOutput.risks, []);
    assert.deepEqual(emptyOutput.actionItems, []);
  });

  it("adapts recent meeting reports to Dashboard and Canvas fixture shapes", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Dashboard report meeting",
    });
    controller.createMemo(meeting.id, {
      body: "Dashboard needs report summary counts.",
    });

    const report = await controller.requestReportGeneration(meeting.id);
    const [summary] = await controller.listRecentReports("workspace-1");
    const [canvasEntityRef] =
      await controller.listRecentReportCanvasEntityRefs("workspace-1");
    const fixtureSummary = workspaceDashboardFixture.meetingReports[0];
    const fixtureCanvasEntityRef =
      workspaceDashboardFixture.canvasEntities.find(
        (entity) => entity.entityType === "meeting_report",
      );

    assert.equal(summary.id, report.id);
    assert.deepEqual(
      Object.keys(summary).sort(),
      Object.keys(fixtureSummary).sort(),
    );
    assert.equal("decisions" in summary, false);
    assert.equal("risks" in summary, false);
    assert.deepEqual(
      Object.keys(canvasEntityRef).sort(),
      Object.keys(fixtureCanvasEntityRef).sort(),
    );
    assert.deepEqual(canvasEntityRef, {
      entityType: "meeting_report",
      entityId: summary.id,
      displayTitle: summary.title,
      shapeType: "meeting_report",
    });
  });

  it("creates and lists meeting report read models", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Report read model meeting",
    });
    const report = await controller.createReport(meeting.id);

    const defaultDecision = await controller.createDecision(report.id, {
      content: "Use the existing meeting contract.",
    });
    const pendingDecision = await controller.createDecision(report.id, {
      content: "Confirm production repository migration timing.",
      status: "pending",
      linkedTaskId: "task-draft-1",
    });
    const defaultRisk = await controller.createRisk(report.id, {
      content: "Task API may not be merged before conversion work.",
    });
    const highRisk = await controller.createRisk(report.id, {
      content: "Contract drift can break Dashboard adapters.",
      severity: "high",
      sortOrder: 2,
    });
    const firstNextAgenda = await controller.createNextAgenda(report.id, {
      title: "Review report generation output.",
    });
    const secondNextAgenda = await controller.createNextAgenda(report.id, {
      title: "Confirm Dashboard summary fields.",
      sortOrder: 2,
    });

    assert.equal(defaultDecision.status, "decided");
    assert.equal(defaultDecision.linkedTaskId, null);
    assert.equal(pendingDecision.status, "pending");
    assert.equal(pendingDecision.linkedTaskId, "task-draft-1");
    assert.deepEqual(await controller.listDecisions(report.id), [
      defaultDecision,
      pendingDecision,
    ]);

    assert.equal(defaultRisk.severity, "medium");
    assert.equal(defaultRisk.sortOrder, 0);
    assert.equal(highRisk.severity, "high");
    assert.deepEqual(await controller.listRisks(report.id), [defaultRisk, highRisk]);

    assert.equal(firstNextAgenda.sortOrder, 0);
    assert.deepEqual(await controller.listNextAgendas(report.id), [
      firstNextAgenda,
      secondNextAgenda,
    ]);

    const reportDetail = await controller.getReport(report.id);

    assert.deepEqual(reportDetail.decisions, [
      defaultDecision,
      pendingDecision,
    ]);
    assert.deepEqual(reportDetail.risks, [defaultRisk, highRisk]);
    assert.deepEqual(reportDetail.nextAgendas, [
      firstNextAgenda,
      secondNextAgenda,
    ]);
    assert.equal(reportDetail.decisionCount, 2);
    assert.equal(reportDetail.actionItemCount, 0);
    assert.equal(reportDetail.riskCount, 2);

    const [summary] = await controller.listRecentReports("workspace-1");

    assert.equal(summary.decisionCount, 2);
    assert.equal(summary.actionItemCount, 0);
    assert.equal(summary.riskCount, 2);
    assert.equal("decisions" in summary, false);
    assert.equal("risks" in summary, false);
    assert.equal("nextAgendas" in summary, false);
  });

  it("rejects invalid report read model enum values and sort orders", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const meeting = await service.createMeeting("workspace-1", {
      title: "Report read model validation meeting",
    });
    const report = await service.createReport(meeting.id);

    service.createRisk(report.id, {
      content: "Known risk.",
      sortOrder: 0,
    });
    service.createNextAgenda(report.id, {
      title: "Known next agenda.",
      sortOrder: 0,
    });

    await assert.rejects(async () =>
      service.createDecision(report.id, {
        content: "Invalid decision status.",
        status: "done",
      }),
    );
    await assert.rejects(async () =>
      service.createRisk(report.id, {
        content: "Invalid risk severity.",
        severity: "urgent",
      }),
    );
    await assert.rejects(async () =>
      service.createRisk(report.id, {
        content: "Duplicate risk order.",
        sortOrder: 0,
      }),
    );
    await assert.rejects(async () =>
      service.createRisk(report.id, {
        content: "Negative risk order.",
        sortOrder: -1,
      }),
    );
    await assert.rejects(async () =>
      service.createNextAgenda(report.id, {
        title: "Duplicate next agenda order.",
        sortOrder: 0,
      }),
    );
  });

  it("creates and lists meeting action items with workspace assignee suggestions", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    currentMemberAdapter.registerWorkspaceMember({
      id: "assignee-1",
      workspaceId: "workspace-1",
      displayName: "Assignee",
    });
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Action item meeting",
    });
    const report = await controller.createReport(meeting.id);

    const actionItem = await controller.createActionItem(report.id, {
      title: "Write Task API contract",
      description: "Align TaskCreateDraft fields before adapter work.",
      assigneeSuggestionMemberId: "assignee-1",
      dueDateSuggestion: "2026-07-03",
    });

    assert.equal(actionItem.reportId, report.id);
    assert.equal(actionItem.title, "Write Task API contract");
    assert.equal(
      actionItem.description,
      "Align TaskCreateDraft fields before adapter work.",
    );
    assert.equal(actionItem.assigneeSuggestionMemberId, "assignee-1");
    assert.equal(actionItem.dueDateSuggestion, "2026-07-03");
    assert.equal(actionItem.status, "draft");
    assert.equal(actionItem.convertedTaskId, null);
    assert.equal("createdAt" in actionItem, false);
    assert.deepEqual(await controller.listActionItems(report.id), [actionItem]);

    const reportDetail = await controller.getReport(report.id);
    const [summary] = await controller.listRecentReports("workspace-1");

    assert.equal(reportDetail.actionItemCount, 1);
    assert.equal(summary.actionItemCount, 1);
  });

  it("transitions meeting action items through approved, converted, and rejected states", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Action item lifecycle meeting",
    });
    const report = await controller.createReport(meeting.id);
    const convertTarget = await controller.createActionItem(report.id, {
      title: "Convert this item",
    });
    const rejectTarget = await controller.createActionItem(report.id, {
      title: "Reject this item",
    });

    const approved = await controller.approveActionItem(convertTarget.id);

    assert.equal(approved.status, "approved");
    assert.equal(approved.convertedTaskId, null);
    await assert.rejects(async () => controller.approveActionItem(convertTarget.id));

    const converted = await controller.markActionItemConverted(convertTarget.id, {
      convertedTaskId: "task-1",
    });

    assert.equal(converted.status, "converted");
    assert.equal(converted.convertedTaskId, "task-1");
    await assert.rejects(async () => controller.rejectActionItem(convertTarget.id));

    const rejected = await controller.rejectActionItem(rejectTarget.id);

    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.convertedTaskId, null);
    await assert.rejects(async () => controller.rejectActionItem(rejectTarget.id));
  });

  it("rejects invalid meeting action item assignees, dates, and conversions", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    currentMemberAdapter.registerWorkspaceMember({
      id: "external-assignee",
      workspaceId: "workspace-2",
    });
    const service = createMeetingService(repository, currentMemberAdapter);
    const meeting = await service.createMeeting("workspace-1", {
      title: "Action item validation meeting",
    });
    const report = await service.createReport(meeting.id);
    const actionItem = await service.createActionItem(report.id, {
      title: "Needs approval before conversion",
    });

    await assert.rejects(async () =>
      service.createActionItem(report.id, {
        title: "Wrong assignee",
        assigneeSuggestionMemberId: "external-assignee",
      }),
    );
    await assert.rejects(async () =>
      service.createActionItem(report.id, {
        title: "Invalid due date",
        dueDateSuggestion: "2026-02-31",
      }),
    );
    await assert.rejects(async () =>
      service.markActionItemConverted(actionItem.id, {
        convertedTaskId: "task-1",
      }),
    );
    await assert.rejects(async () => {
      const approved = await service.approveActionItem(actionItem.id);

      await service.markActionItemConverted(approved.id, {});
    });
  });

  it("maps approved meeting action items to TaskCreateDraft and keeps conversion separate", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    currentMemberAdapter.registerWorkspaceMember({
      id: "task-assignee",
      workspaceId: "workspace-1",
    });
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Task draft meeting",
    });
    const report = await controller.createReport(meeting.id);
    const actionItem = await controller.createActionItem(report.id, {
      title: "Create TaskCreateDraft adapter",
      description: "Map MeetingActionItem to the Task draft contract.",
      assigneeSuggestionMemberId: "task-assignee",
      dueDateSuggestion: "2026-07-03",
    });
    const approvedActionItem = await controller.approveActionItem(actionItem.id);

    const result = await controller.requestActionItemTaskDraft(
      approvedActionItem.id,
    );

    assert.equal(result.taskDraft.mode, "mock");
    assert.match(
      result.taskDraft.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.equal(result.taskDraft.taskId, null);
    assert.deepEqual(result.taskDraft.payload, {
      workspaceId: "workspace-1",
      sourceType: "meeting_action_item",
      sourceId: actionItem.id,
      title: "Create TaskCreateDraft adapter",
      description: "Map MeetingActionItem to the Task draft contract.",
      assigneeMemberId: "task-assignee",
      priority: "medium",
      dueDate: "2026-07-03",
    });
    assert.equal(result.actionItem.status, "approved");
    assert.equal(result.actionItem.convertedTaskId, null);
    assert.deepEqual((await controller.listActionItems(report.id))[0], {
      ...approvedActionItem,
      status: "approved",
      convertedTaskId: null,
    });
  });

  it("calls the Task owner API adapter with the approval actor", async () => {
    const calls = [];
    const adapter = new JuhyungTaskDraftClient({
      async createTaskDraft(workspaceId, body, actor) {
        calls.push({ workspaceId, body, actor });

        return {
          id: "55555555-5555-4555-8555-555555555555",
          taskId: null,
        };
      },
    });
    const payload = {
      workspaceId: "workspace-1",
      sourceType: "meeting_action_item",
      sourceId: "action-item-1",
      title: "Draft the Task",
      description: null,
      assigneeMemberId: null,
      priority: "medium",
      dueDate: null,
    };

    const response = await adapter.createTaskDraft(payload, {
      actor: { memberId: "member-1" },
    });

    assert.deepEqual(calls, [
      {
        workspaceId: "workspace-1",
        body: payload,
        actor: { memberId: "member-1" },
      },
    ]);
    assert.deepEqual(response, {
      id: "55555555-5555-4555-8555-555555555555",
      taskId: null,
      payload,
      mode: "owner-api",
    });
  });

  it("keeps approved action items unchanged when TaskDraftClient fails", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const failingTaskDraftClient = {
      createTaskDraft() {
        throw new Error("Task API unavailable");
      },
    };
    const service = createMeetingService(
      repository,
      currentMemberAdapter,
      failingTaskDraftClient,
    );
    const meeting = await service.createMeeting("workspace-1", {
      title: "Task draft failure meeting",
    });
    const report = await service.createReport(meeting.id);
    const actionItem = await service.createActionItem(report.id, {
      title: "Keep this approved on failure",
    });

    await assert.rejects(() =>
      service.requestActionItemTaskDraft(actionItem.id),
    );

    const approvedActionItem = await service.approveActionItem(actionItem.id);

    await assert.rejects(() =>
      service.requestActionItemTaskDraft(approvedActionItem.id),
    );
    assert.deepEqual(await service.listActionItems(report.id), [approvedActionItem]);
  });

  it("returns the existing report when report creation is requested twice", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);
    const meeting = await controller.createMeeting("workspace-1", {
      title: "Duplicate report meeting",
    });

    const firstReport = await controller.createReport(meeting.id);
    const secondReport = await controller.createReport(meeting.id);

    assert.equal(firstReport.id, secondReport.id);
    const [summary] = await controller.listRecentReports("workspace-1");

    assert.equal(summary.id, firstReport.id);
    assert.equal("decisions" in summary, false);
  });

  it("keeps meeting report lookup scoped to workspace", async () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = createMeetingService(repository, currentMemberAdapter);
    const meeting = await service.createMeeting("workspace-1", {
      title: "Report workspace guard meeting",
    });
    const report = await service.createReport(meeting.id);

    await assert.rejects(async () =>
      service.getReportForWorkspace("workspace-2", report.id),
    );
    assert.deepEqual(await service.listRecentReports("workspace-2"), []);
  });
});
