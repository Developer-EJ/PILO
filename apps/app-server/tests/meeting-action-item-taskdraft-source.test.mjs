import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import "reflect-metadata";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { BadRequestException, NotFoundException } = require("@nestjs/common");
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
  MeetingActionItemTaskDraftSourceAdapter,
} = require("../src/modules/meeting/public/meeting-action-item-taskdraft-source.adapter");

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("MeetingActionItemTaskDraftSourceAdapter", () => {
  it("maps a valid MeetingActionItem to a TaskCreateDraft payload without creating TaskDraft", () => {
    const stack = createMeetingStack();
    const meeting = stack.service.createMeeting("workspace-1", {
      title: "Agent action item meeting",
    });
    const report = stack.service.createReport(meeting.id);
    const actionItem = stack.service.createActionItem(report.id, {
      title: "Create TaskCreateDraft adapter",
      description: "Map MeetingActionItem to the Task draft contract.",
      assigneeSuggestionMemberId: "assignee-1",
      dueDateSuggestion: "2026-07-03",
    });

    const result = stack.source.createTaskDraftPayload({
      workspaceId: "workspace-1",
      meetingId: meeting.id,
      actionItemId: actionItem.id,
    });

    assert.equal(result.meetingId, meeting.id);
    assert.equal(result.reportId, report.id);
    assert.equal(result.actionItemId, actionItem.id);
    assert.deepEqual(result.payload, {
      workspaceId: "workspace-1",
      sourceType: "meeting_action_item",
      sourceId: actionItem.id,
      title: "Create TaskCreateDraft adapter",
      description: "Map MeetingActionItem to the Task draft contract.",
      assigneeMemberId: "assignee-1",
      priority: "medium",
      dueDate: "2026-07-03",
    });
    assert.equal(stack.taskDraftCalls, 0);
    assert.equal(stack.service.listActionItems(report.id)[0].status, "draft");
    assert.equal(
      stack.service.listActionItems(report.id)[0].convertedTaskId,
      null,
    );
  });

  it("fails clearly for missing, mismatched, and terminal action items", () => {
    const stack = createMeetingStack();
    const meeting = stack.service.createMeeting("workspace-1", {
      title: "Invalid source meeting",
    });
    const otherMeeting = stack.service.createMeeting("workspace-1", {
      title: "Other meeting",
    });
    const report = stack.service.createReport(meeting.id);
    const actionItem = stack.service.createActionItem(report.id, {
      title: "Rejected item",
    });
    stack.service.rejectActionItem(actionItem.id);

    assert.throws(
      () =>
        stack.source.createTaskDraftPayload({
          workspaceId: "workspace-1",
          meetingId: meeting.id,
          actionItemId: "",
        }),
      BadRequestException,
    );
    assert.throws(
      () =>
        stack.source.createTaskDraftPayload({
          workspaceId: "workspace-1",
          meetingId: meeting.id,
          actionItemId: "missing-action-item",
        }),
      NotFoundException,
    );
    assert.throws(
      () =>
        stack.source.createTaskDraftPayload({
          workspaceId: "workspace-2",
          meetingId: meeting.id,
          actionItemId: actionItem.id,
        }),
      NotFoundException,
    );
    assert.throws(
      () =>
        stack.source.createTaskDraftPayload({
          workspaceId: "workspace-1",
          meetingId: otherMeeting.id,
          actionItemId: actionItem.id,
        }),
      NotFoundException,
    );
    assert.throws(
      () =>
        stack.source.createTaskDraftPayload({
          workspaceId: "workspace-1",
          meetingId: meeting.id,
          actionItemId: actionItem.id,
        }),
      BadRequestException,
    );

    const convertedItem = stack.service.createActionItem(report.id, {
      title: "Converted item",
    });
    stack.service.approveActionItem(convertedItem.id);
    stack.service.markActionItemConverted(convertedItem.id, {
      convertedTaskId: "task-draft-1",
    });

    assert.throws(
      () =>
        stack.source.createTaskDraftPayload({
          workspaceId: "workspace-1",
          meetingId: meeting.id,
          actionItemId: convertedItem.id,
        }),
      BadRequestException,
    );
  });

  it("keeps the Meeting public source adapter free of Task owner writes", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../src/modules/meeting/public/meeting-action-item-taskdraft-source.adapter.ts",
      ),
      "utf8",
    );

    assert.doesNotMatch(source, /juhyung/i);
    assert.doesNotMatch(source, /TASK_DRAFT_CLIENT|TaskDraftClient/);
    assert.doesNotMatch(source, /task-draft\.adapter/);
  });
});

function createMeetingStack() {
  const repository = new MockMeetingRepository();
  const currentMemberAdapter = new MockCurrentMemberAdapter();
  currentMemberAdapter.registerWorkspaceMember({
    id: "assignee-1",
    workspaceId: "workspace-1",
    displayName: "Assignee",
  });
  let taskDraftCalls = 0;
  const taskDraftClient = {
    createTaskDraft() {
      taskDraftCalls += 1;
      throw new Error("TaskDraft writes are not expected");
    },
  };
  const service = new MeetingService(
    repository,
    currentMemberAdapter,
    new MockMeetingReportWorkflowClient(),
    taskDraftClient,
  );
  const source = new MeetingActionItemTaskDraftSourceAdapter(repository);

  return {
    get taskDraftCalls() {
      return taskDraftCalls;
    },
    service,
    source,
  };
}
