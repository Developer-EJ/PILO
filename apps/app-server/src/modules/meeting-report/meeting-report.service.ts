import { Injectable } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { badRequest, conflict, forbidden, notFound } from "../../common/api-error";
import { DatabaseService } from "../../database/database.service";
import { WorkspaceService } from "../workspace/workspace.service";
import {
  MeetingReportJobPayload,
  MeetingReportJobService
} from "./meeting-report-job.service";
import { MeetingReportRealtimePublisherService } from "./meeting-report-realtime-publisher.service";
import type { MeetingActionItemDeliveryInput } from "./meeting-action-item-delivery.service";
import type {
  MeetingReportActionItemExtractionPayload,
  MeetingReportActionItemExtractionStatus,
  MeetingReportFailedStep,
  MeetingReportStatus,
  MeetingReportSummaryPayload
} from "./meeting-report.types";

export type {
  MeetingReportActionItemExtractionPayload,
  MeetingReportParticipantSummaryPayload,
  MeetingReportSummaryPayload
} from "./meeting-report.types";

type RecordingStatus = "RUNNING" | "COMPLETED" | "FAILED";

type MeetingReportActionItemStatus =
  | "PENDING"
  | "DELIVERING"
  | "DELIVERY_FAILED"
  | "APPROVED"
  | "DISMISSED";

interface MeetingReportRow extends QueryResultRow {
  id: string;
  meeting_id: string;
  recording_id: string;
  status: MeetingReportStatus;
  failed_step: MeetingReportFailedStep | null;
  error_message: string | null;
  failure_code?: string | null;
  failure_detail?: unknown;
  title: string | null;
  ai_title?: string | null;
  user_title: string | null;
  summary: string | null;
  discussion_points: string | null;
  ai_discussion_points?: string | null;
  user_discussion_points: string | null;
  decisions: string | null;
  ai_decisions?: string | null;
  content_version: number | string;
  content_edited_by_user_id: string | null;
  content_edited_at: Date | string | null;
  action_item_candidates: unknown;
  retry_count: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  participant_count?: number | string;
  participant_preview?: unknown;
  can_delete?: boolean;
  can_edit?: boolean;
  action_item_extraction_status?: string | null;
  action_item_extraction_failure_code?: string | null;
}

interface MeetingReportDetailRow extends MeetingReportRow {
  transcript_text: string | null;
}

interface MeetingReportDecisionItemRow extends QueryResultRow {
  id: string;
  source_index: number | string;
  text: string;
  user_text: string | null;
  edited_by_user_id: string | null;
  edited_at: Date | string | null;
}

interface MeetingReportActionItemRow extends QueryResultRow {
  id: string;
  meeting_report_id: string;
  source_index: number | string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  assignee_user_id: string | null;
  assignee_name: string | null;
  assignee_avatar_url: string | null;
  action_item_candidates?: unknown;
  status: MeetingReportActionItemStatus;
  updated_by_user_id: string | null;
  approved_by_user_id: string | null;
  approved_at: Date | string | null;
  dismissed_by_user_id: string | null;
  dismissed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  delivery_id?: string | null;
  delivery_type?: "calendar_event" | "pilo_issue" | null;
  delivery_status?: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | null;
  delivery_error_code?: string | null;
  delivery_draft_json?: unknown;
  delivery_target_resource_id?: string | null;
  calendar_event_id?: number | string | null;
  calendar_event_title?: string | null;
  pilo_issue_id?: number | string | null;
  pilo_issue_title?: string | null;
  pilo_issue_board_id?: number | string | null;
  pilo_issue_column_id?: number | string | null;
  pilo_issue_column_name?: string | null;
}

interface MeetingReportActionItemAssigneeRow extends QueryResultRow {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
}

interface MeetingReportRegenerationRow extends MeetingReportDetailRow {
  recording_status: RecordingStatus;
  recording_audio_file_key: string | null;
}

interface QueryOneExecutor {
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<T | null>;
}

interface MeetingReportListQuery {
  cursor?: unknown;
  from?: unknown;
  status?: unknown;
  q?: unknown;
  to?: unknown;
  limit?: unknown;
}

/** Internal Agent query. Keep reportTitle and roomName out of the public Meeting REST contract. */
interface MeetingAgentReportListQuery extends MeetingReportListQuery {
  reportTitle?: unknown;
  roomName?: unknown;
}

interface MeetingReportCursor {
  createdAt: string;
  id: string;
}

interface MeetingReportRegenerationTransactionResult {
  payload: MeetingReportRegenerationPayload;
  job: MeetingReportJobPayload;
  previousReport: MeetingReportRegenerationRow;
}

export interface MeetingReportActionItemExtractionRetryPayload {
  actionItemExtraction: MeetingReportActionItemExtractionPayload;
}

export interface MeetingReportDetailPayload extends MeetingReportSummaryPayload {
  transcriptText: string | null;
  evidenceSegments: Array<{ id: string; segmentIndex: number; startedAtMs: number; endedAtMs: number; text: string }>;
  evidence: Array<{ sourceType: string; sourceIndex: number; transcriptSegmentId: string }>;
  activityEvidence: Array<{
    id: string;
    sourceIndex: number;
    occurredAt: string;
    action: string;
    summary: string;
    references: Array<{ sourceType: string; sourceIndex: number }>;
  }>;
  actionItems: MeetingReportActionItemPayload[];
  actionItemAssignees: MeetingReportActionItemAssigneePayload[];
  decisionItems: MeetingReportDecisionItemPayload[];
}

export interface MeetingReportDecisionItemPayload {
  id: string;
  sourceIndex: number;
  text: string;
  isUserEdited: boolean;
  editedByUserId: string | null;
  editedAt: string | null;
}

export interface MeetingReportContentMutationPayload {
  report: MeetingReportDetailPayload;
}

export interface MeetingReportActionItemPayload {
  id: string;
  sourceIndex: number;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  assignee: MeetingReportActionItemAssigneePayload | null;
  deliverySuggestion: {
    deliveryType: "calendar_event" | "pilo_issue";
    calendar: {
      isAllDay: boolean;
      startDate: string;
      endDate: string;
      startTime: string | null;
      endTime: string | null;
    } | null;
  } | null;
  status: MeetingReportActionItemStatus;
  updatedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  dismissedByUserId: string | null;
  dismissedAt: string | null;
  delivery: {
    deliveryType: "calendar_event" | "pilo_issue";
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
    errorCode: string | null;
    draft: MeetingActionItemDeliveryInput | null;
    targetResourceId: string | null;
    calendarEvent: { id: string; title: string } | null;
    piloIssue: {
      id: string;
      title: string;
      boardId: string;
      columnId: string;
      columnName: string | null;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingAgentActionItemSearchQuery {
  reportId?: string;
  assigneeUserId?: string;
  status?: "PENDING" | "DELIVERING" | "DELIVERY_FAILED" | "APPROVED" | "DISMISSED";
  title?: string;
  from?: string;
  to?: string;
  sort?: "newest" | "oldest";
  limit?: number;
}

export interface MeetingAgentActionItemSearchPayload {
  id: string;
  reportId: string;
  sourceIndex: number;
  title: string;
  status: "PENDING" | "DELIVERING" | "DELIVERY_FAILED" | "APPROVED" | "DISMISSED";
  assignee: MeetingReportActionItemAssigneePayload | null;
  reportCreatedAt: string;
}

export interface MeetingReportActionItemAssigneePayload {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface MeetingReportActionItemMutationPayload {
  actionItem: MeetingReportActionItemPayload;
}

export interface MeetingReportListPayload {
  nextCursor: string | null;
  reports: MeetingReportSummaryPayload[];
}

export interface MeetingReportDetailResponsePayload {
  report: MeetingReportDetailPayload;
}

export interface MeetingReportRegenerationPayload {
  report: MeetingReportSummaryPayload;
}

export interface MeetingReportDeletionPayload {
  deletedReportId: string;
}

const DEFAULT_MEETING_REPORT_LIMIT = 20;

const MAX_MEETING_REPORT_LIMIT = 100;

const MEETING_REPORT_STATUSES: readonly MeetingReportStatus[] = [
  "PROCESSING",
  "QUEUED",
  "TRANSCRIBING",
  "SUMMARIZING",
  "COMPLETED",
  "FAILED"
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MeetingReportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly workspaceService: WorkspaceService,
    private readonly meetingReportJobService: MeetingReportJobService,
    private readonly meetingReportRealtimePublisher?: MeetingReportRealtimePublisherService
  ) {}

  async listReports(
    currentUserId: string,
    workspaceId: string,
    query: MeetingReportListQuery
  ): Promise<MeetingReportListPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const cursor = this.normalizeMeetingReportCursor(query.cursor);
    const from = this.normalizeMeetingReportDate(query.from, "from");
    const to = this.normalizeMeetingReportDate(query.to, "to");
    const searchQuery = this.normalizeMeetingReportSearchQuery(query.q);
    const status = this.normalizeMeetingReportStatus(query.status);
    const limit = this.normalizeMeetingReportLimit(query.limit);
    if (from !== null && to !== null && from >= to) {
      throw badRequest("from must be before to");
    }
    const page = await this.listWorkspaceMeetingReportRows(
      workspaceId,
      currentUserId,
      status,
      limit,
      { cursor, from, searchQuery, to }
    );

    return {
      nextCursor: page.nextCursor,
      reports: page.reports.map((report) => this.mapMeetingReportSummary(report))
    };
  }

  async listReportsForAgent(
    currentUserId: string,
    workspaceId: string,
    query: MeetingAgentReportListQuery
  ): Promise<MeetingReportListPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const cursor = this.normalizeMeetingReportCursor(query.cursor);
    const from = this.normalizeMeetingReportDate(query.from, "from");
    const to = this.normalizeMeetingReportDate(query.to, "to");
    const status = this.normalizeMeetingReportStatus(query.status);
    const limit = this.normalizeAgentMeetingReportLimit(query.limit);
    const reportTitle = query.reportTitle === undefined
      ? null
      : this.normalizeAgentResolutionText(String(query.reportTitle));
    const roomName = query.roomName === undefined
      ? null
      : this.normalizeAgentResolutionText(String(query.roomName));
    if (from !== null && to !== null && from >= to) {
      throw badRequest("from must be before to");
    }
    let page = await this.listWorkspaceMeetingReportRows(
      workspaceId,
      currentUserId,
      status,
      limit,
      { cursor, from, searchQuery: null, to, reportTitle, roomName }
    );
    if (reportTitle !== null && page.reports.length === 0) {
      page = await this.listWorkspaceMeetingReportRows(
        workspaceId,
        currentUserId,
        status,
        limit,
        {
          cursor,
          from,
          searchQuery: null,
          to,
          reportTitlePrefix: reportTitle,
          roomName
        }
      );
    }
    return {
      nextCursor: page.nextCursor,
      reports: page.reports.map((report) => this.mapMeetingReportSummary(report))
    };
  }

  async listActionItemsForAgent(
    currentUserId: string,
    workspaceId: string,
    query: MeetingAgentActionItemSearchQuery
  ): Promise<{ actionItems: MeetingAgentActionItemSearchPayload[] }> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    if (
      (query.reportId !== undefined && !UUID_PATTERN.test(query.reportId)) ||
      (query.assigneeUserId !== undefined && !UUID_PATTERN.test(query.assigneeUserId))
    ) {
      return { actionItems: [] };
    }

    const limit = this.agentResolutionLimit(query.limit);
    const values: unknown[] = [workspaceId];
    const reportCondition =
      query.reportId === undefined
        ? ""
        : `AND action_items.meeting_report_id = $${values.push(query.reportId)}::uuid`;
    const assigneeCondition =
      query.assigneeUserId === undefined
        ? ""
        : `AND action_items.assignee_user_id = $${values.push(query.assigneeUserId)}::uuid`;
    const statusCondition =
      query.status === undefined
        ? ""
        : `AND action_items.status = $${values.push(query.status)}`;
    const title = query.title
      ? this.normalizeAgentResolutionText(query.title)
      : null;
    const titleCondition =
      title === null
        ? ""
        : `AND lower(regexp_replace(BTRIM(action_items.title), '\\s+', ' ', 'g')) LIKE '%' || $${values.push(title)} || '%'`;
    const fromCondition =
      query.from === undefined
        ? ""
        : `AND meeting_reports.created_at >= $${values.push(query.from)}::timestamptz`;
    const toCondition =
      query.to === undefined
        ? ""
        : `AND meeting_reports.created_at < $${values.push(query.to)}::timestamptz`;
    const reportOrder = query.sort === "oldest" ? "ASC" : "DESC";
    const rows = await this.database.query<
      QueryResultRow & {
        id: string;
        meeting_report_id: string;
        source_index: number | string;
        title: string;
        status: MeetingAgentActionItemSearchPayload["status"];
        assignee_user_id: string | null;
        assignee_name: string | null;
        assignee_avatar_url: string | null;
        report_created_at: Date | string;
      }
    >(
      `
        SELECT
          action_items.id,
          action_items.meeting_report_id,
          action_items.source_index,
          action_items.title,
          action_items.status,
          action_items.assignee_user_id,
          users.name AS assignee_name,
          users.avatar_url AS assignee_avatar_url,
          meeting_reports.created_at AS report_created_at
        FROM meeting_report_action_items AS action_items
        JOIN meeting_reports
          ON meeting_reports.id = action_items.meeting_report_id
        JOIN meetings
          ON meetings.id = meeting_reports.meeting_id
        LEFT JOIN users
          ON users.id = action_items.assignee_user_id
        WHERE meetings.workspace_id = $1
          ${reportCondition}
          ${assigneeCondition}
          ${statusCondition}
          ${titleCondition}
          ${fromCondition}
          ${toCondition}
        ORDER BY meeting_reports.created_at ${reportOrder}, action_items.source_index ASC, action_items.id ASC
        LIMIT $${values.push(limit)}
      `,
      values
    );
    return {
      actionItems: rows.map((row) => ({
        id: row.id,
        reportId: row.meeting_report_id,
        sourceIndex: Number(row.source_index),
        title: row.title,
        status: row.status,
        assignee:
          row.assignee_user_id === null
            ? null
            : {
                userId: row.assignee_user_id,
                name: row.assignee_name,
                avatarUrl: row.assignee_avatar_url
              },
        reportCreatedAt: this.toIsoString(row.report_created_at)
      }))
    };
  }

  async getReport(
    currentUserId: string,
    workspaceId: string,
    reportId: string
  ): Promise<MeetingReportDetailResponsePayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const report = await this.findMeetingReportDetailById(
      workspaceId,
      currentUserId,
      reportId
    );

    if (report === null) {
      throw notFound("Meeting report not found");
    }
    const [
      evidence,
      activityEvidence,
      actionItems,
      actionItemAssignees,
      decisionItems
    ] = await Promise.all([
      this.listMeetingReportEvidence(report.id),
      this.listMeetingReportActivityEvidence(report.id),
      this.listMeetingReportActionItems(report.id),
      this.listMeetingReportActionItemAssignees(workspaceId),
      this.listMeetingReportDecisionItems(report.id)
    ]);

    return {
      report: this.mapMeetingReportDetail(report, {
        ...evidence,
        activityEvidence,
        actionItems,
        actionItemAssignees,
        decisionItems
      })
    };
  }

  async updateMeetingReportContent(
    currentUserId: string,
    workspaceId: string,
    reportId: string,
    body: unknown
  ): Promise<MeetingReportContentMutationPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const patch = this.normalizeMeetingReportContentPatch(body);

    await this.database.transaction(async (transaction) => {
      const report = await transaction.queryOne<{
        id: string;
        status: MeetingReportStatus;
        content_version: number | string;
        can_edit: boolean;
      }>(
        `SELECT
           meeting_reports.id,
           meeting_reports.status,
           meeting_reports.content_version,
           (
             EXISTS (
               SELECT 1
               FROM workspace_members
               WHERE workspace_members.workspace_id = meetings.workspace_id
                 AND workspace_members.user_id = $2
                 AND workspace_members.role = 'owner'
             )
             OR EXISTS (
               SELECT 1
               FROM meeting_participants
               WHERE meeting_participants.meeting_id = meeting_reports.meeting_id
                 AND meeting_participants.user_id = $2
             )
           ) AS can_edit
         FROM meeting_reports
         JOIN meetings ON meetings.id = meeting_reports.meeting_id
         WHERE meetings.workspace_id = $1
           AND meeting_reports.id = $3
         FOR UPDATE OF meeting_reports`,
        [workspaceId, currentUserId, reportId]
      );

      if (report === null) {
        throw notFound("Meeting report not found");
      }
      if (!report.can_edit) {
        throw forbidden("Only the workspace owner or a meeting participant can edit this report");
      }
      if (report.status !== "COMPLETED") {
        throw badRequest("Only completed meeting reports can be edited");
      }
      if (Number(report.content_version) !== patch.expectedVersion) {
        throw conflict("Meeting report content was updated by another user");
      }

      if (patch.title !== undefined || patch.discussionPoints !== undefined) {
        const updated = await transaction.queryOne<{ id: string }>(
          `UPDATE meeting_reports
           SET
             user_title = COALESCE($2, user_title),
             user_discussion_points = COALESCE($3, user_discussion_points),
             updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [
            report.id,
            patch.title ?? null,
            patch.discussionPoints ?? null
          ]
        );
        if (updated === null) throw notFound("Meeting report not found");
      }

      if (patch.decisionItems.length) {
        for (const item of patch.decisionItems) {
          const updated = await transaction.queryOne<{ id: string }>(
            `UPDATE meeting_report_decision_items
             SET
               user_text = $3,
               edited_by_user_id = $4,
               edited_at = now()
             WHERE id = $1
               AND meeting_report_id = $2
             RETURNING id`,
            [item.id, report.id, item.text, currentUserId]
          );
          if (updated === null) {
            throw badRequest("Invalid meeting report decision item");
          }
        }
      }

      const updated = await transaction.queryOne<{ id: string }>(
        `UPDATE meeting_reports
         SET
           content_version = content_version + 1,
           content_edited_by_user_id = $2,
           content_edited_at = now(),
           updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [report.id, currentUserId]
      );
      if (updated === null) throw notFound("Meeting report not found");
    });

    const result = await this.getReport(currentUserId, workspaceId, reportId);
    await this.publishMeetingReportEvent(reportId);
    return result;
  }

  async retryMeetingReportActionItemExtraction(
    currentUserId: string,
    workspaceId: string,
    reportId: string
  ): Promise<MeetingReportActionItemExtractionRetryPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    if (!UUID_PATTERN.test(reportId)) {
      throw notFound("Meeting report not found");
    }
    const extraction = await this.database.queryOne<{
      status: string;
    }>(
      `UPDATE meeting_report_action_item_extractions AS extraction
       SET
         status = 'pending',
         attempt_count = 0,
         next_attempt_at = now(),
         claim_token = NULL,
         claimed_at = NULL,
         delivered_at = NULL,
         completed_at = NULL,
         failure_code = NULL,
         failure_detail = NULL,
         updated_at = now()
       FROM meeting_reports AS reports
       JOIN meetings ON meetings.id = reports.meeting_id
       WHERE extraction.meeting_report_id = reports.id
         AND reports.id = $2
         AND meetings.workspace_id = $1
         AND reports.status = 'COMPLETED'
         AND extraction.status = 'failed'
       RETURNING extraction.status`,
      [workspaceId, reportId]
    );
    if (!extraction) {
      throw badRequest("Meeting report follow-up tasks cannot be retried");
    }
    return {
      actionItemExtraction: {
        status: "PENDING",
        errorMessage: null
      }
    };
  }

  private agentResolutionLimit(value: number | undefined): number {
    if (!Number.isInteger(value) || value === undefined) {
      return 4;
    }
    return Math.min(Math.max(value, 1), 20);
  }

  private normalizeAgentResolutionText(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
  }

  async getMeetingReportDecisionItem(
    currentUserId: string,
    workspaceId: string,
    reportId: string,
    sourceIndex: number
  ): Promise<{ sourceIndex: number; text: string } | null> {
    await this.getReport(currentUserId, workspaceId, reportId);
    return this.database.queryOne<{ source_index: number; text: string }>(
      `
        SELECT source_index, COALESCE(user_text, text) AS text
        FROM meeting_report_decision_items
        WHERE meeting_report_id = $1
          AND source_index = $2
        LIMIT 1
      `,
      [reportId, sourceIndex]
    ).then((row) =>
      row ? { sourceIndex: row.source_index, text: row.text } : null
    );
  }

  async deleteReport(
    currentUserId: string,
    workspaceId: string,
    reportId: string
  ): Promise<MeetingReportDeletionPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);

    return this.database.transaction(async (transaction) => {
      if (!UUID_PATTERN.test(reportId)) {
        throw notFound("Meeting report not found");
      }
      const report = await transaction.queryOne<{
        id: string;
        status: MeetingReportStatus;
        can_delete: boolean;
      }>(
        `SELECT
           meeting_reports.id,
           meeting_reports.status,
           (
             EXISTS (
               SELECT 1
               FROM workspace_members
               WHERE workspace_members.workspace_id = meetings.workspace_id
                 AND workspace_members.user_id = $2
                 AND workspace_members.role = 'owner'
             )
             OR EXISTS (
               SELECT 1
               FROM meeting_participants
               WHERE meeting_participants.meeting_id = meeting_reports.meeting_id
                 AND meeting_participants.user_id = $2
             )
           ) AS can_delete
         FROM meeting_reports
         JOIN meetings ON meetings.id = meeting_reports.meeting_id
         WHERE meetings.workspace_id = $1
           AND meeting_reports.id = $3
         FOR UPDATE OF meeting_reports`,
        [workspaceId, currentUserId, reportId]
      );

      if (report === null) {
        throw notFound("Meeting report not found");
      }
      if (!report.can_delete) {
        throw forbidden("Only the workspace owner or a meeting participant can delete this report");
      }
      if (this.isMeetingReportInProgress(report.status)) {
        throw badRequest("Meeting report is still processing");
      }

      const deleted = await transaction.queryOne<{ id: string }>(
        `DELETE FROM meeting_reports
         WHERE id = $1
         RETURNING id`,
        [report.id]
      );
      if (deleted === null) {
        throw notFound("Meeting report not found");
      }

      return { deletedReportId: deleted.id };
    });
  }

  async updateMeetingReportActionItem(
    currentUserId: string,
    workspaceId: string,
    reportId: string,
    actionItemId: string,
    body: unknown
  ): Promise<MeetingReportActionItemMutationPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const patch = this.normalizeMeetingReportActionItemPatch(body);

    const actionItem = await this.database.transaction(async (transaction) => {
      const current = await this.findMeetingReportActionItemForUpdate(
        transaction,
        workspaceId,
        reportId,
        actionItemId
      );
      this.assertPendingMeetingReportActionItem(current);

      const assigneeUserId = patch.assigneeUserId === undefined
        ? current.assignee_user_id
        : patch.assigneeUserId;
      if (assigneeUserId !== null) {
        await this.assertWorkspaceMember(transaction, workspaceId, assigneeUserId);
      }

      return this.updatePendingMeetingReportActionItem(transaction, current, {
        assigneeUserId,
        description: patch.description ?? current.description,
        priority: patch.priority ?? current.priority,
        title: patch.title ?? current.title
      }, currentUserId);
    });

    return { actionItem: this.mapMeetingReportActionItem(actionItem) };
  }

  async approveMeetingReportActionItem(
    currentUserId: string,
    workspaceId: string,
    reportId: string,
    actionItemId: string
  ): Promise<MeetingReportActionItemMutationPayload> {
    const actionItem = await this.transitionMeetingReportActionItem(
      currentUserId,
      workspaceId,
      reportId,
      actionItemId,
      "APPROVED"
    );
    return { actionItem: this.mapMeetingReportActionItem(actionItem) };
  }

  async dismissMeetingReportActionItem(
    currentUserId: string,
    workspaceId: string,
    reportId: string,
    actionItemId: string
  ): Promise<MeetingReportActionItemMutationPayload> {
    const actionItem = await this.transitionMeetingReportActionItem(
      currentUserId,
      workspaceId,
      reportId,
      actionItemId,
      "DISMISSED"
    );
    return { actionItem: this.mapMeetingReportActionItem(actionItem) };
  }

  async listMeetingReports(
    currentUserId: string,
    workspaceId: string,
    meetingId: string
  ): Promise<MeetingReportListPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    await this.assertMeetingExists(workspaceId, meetingId);
    const reports = await this.listMeetingReportRows(meetingId);

    return {
      nextCursor: null,
      reports: reports.map((report) => this.mapMeetingReportSummary(report))
    };
  }

  async requestReportRegeneration(
    currentUserId: string,
    workspaceId: string,
    reportId: string
  ): Promise<MeetingReportRegenerationPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);

    const result =
      await this.database.transaction<MeetingReportRegenerationTransactionResult>(
        async (transaction) => {
          const report = await this.findMeetingReportForRegeneration(
            transaction,
            workspaceId,
            reportId
          );

          if (report === null) {
            throw notFound("Meeting report not found");
          }

          const audioFileKey = this.assertReportCanBeRegenerated(report);
          const updatedReport = await this.updateMeetingReportForRegeneration(
            transaction,
            report.id
          );

          return {
            payload: {
              report: this.mapMeetingReportSummary(updatedReport)
            },
            job: this.buildMeetingReportJobPayloadFromAudioFileKey(
              updatedReport,
              audioFileKey
            ),
            previousReport: report
          };
        }
      );

    try {
      await this.meetingReportJobService.enqueueMeetingReportJob(result.job);
    } catch (error) {
      await this.restoreMeetingReportAfterRegenerationEnqueueFailure(
        result.previousReport
      );
      throw error;
    }

    return result.payload;
  }

  private assertReportCanBeRegenerated(
    report: MeetingReportRegenerationRow
  ): string {
    if (this.isMeetingReportInProgress(report.status)) {
      throw badRequest("Meeting report is already processing");
    }

    if (report.status === "COMPLETED") {
      throw badRequest("Completed meeting report cannot be regenerated");
    }

    if (report.status !== "FAILED") {
      throw badRequest("Meeting report cannot be regenerated");
    }

    if (
      report.recording_status !== "COMPLETED" ||
      report.recording_audio_file_key === null ||
      !report.recording_audio_file_key.trim()
    ) {
      throw badRequest("Meeting report audio file is unavailable");
    }

    return report.recording_audio_file_key.trim();
  }

  private async findMeetingReportForRegeneration(
    executor: QueryOneExecutor,
    workspaceId: string,
    reportId: string
  ): Promise<MeetingReportRegenerationRow | null> {
    if (!UUID_PATTERN.test(reportId)) {
      return null;
    }

    return executor.queryOne<MeetingReportRegenerationRow>(
      `
        SELECT
          meeting_reports.id,
          meeting_reports.meeting_id,
          meeting_reports.recording_id,
          meeting_reports.status,
          meeting_reports.failed_step,
          meeting_reports.error_message,
          meeting_reports.failure_code,
          meeting_reports.failure_detail,
          meeting_reports.transcript_text,
          meeting_reports.title AS ai_title,
          COALESCE(meeting_reports.user_title, meeting_reports.title) AS title,
          meeting_reports.user_title,
          meeting_reports.summary,
          meeting_reports.discussion_points AS ai_discussion_points,
          COALESCE(meeting_reports.user_discussion_points, meeting_reports.discussion_points) AS discussion_points,
          meeting_reports.user_discussion_points,
          meeting_reports.decisions AS ai_decisions,
          COALESCE(decision_content.decisions, meeting_reports.decisions) AS decisions,
          meeting_reports.content_version,
          meeting_reports.content_edited_by_user_id,
          meeting_reports.content_edited_at,
          meeting_reports.action_item_candidates,
          meeting_reports.retry_count,
          meeting_reports.created_at,
          meeting_reports.updated_at,
          meeting_recordings.status AS recording_status,
          meeting_recordings.audio_file_key AS recording_audio_file_key
        FROM meeting_reports
        JOIN meetings
          ON meetings.id = meeting_reports.meeting_id
        LEFT JOIN LATERAL (
          SELECT string_agg(COALESCE(user_text, text), E'\n' ORDER BY source_index) AS decisions
          FROM meeting_report_decision_items
          WHERE meeting_report_id = meeting_reports.id
        ) AS decision_content ON true
        JOIN meeting_recordings
          ON meeting_recordings.id = meeting_reports.recording_id
          AND meeting_recordings.meeting_id = meeting_reports.meeting_id
        WHERE meetings.workspace_id = $1
          AND meeting_reports.id = $2
        FOR UPDATE OF meeting_reports, meeting_recordings
      `,
      [workspaceId, reportId]
    );
  }

  private async updateMeetingReportForRegeneration(
    executor: QueryOneExecutor,
    reportId: string
  ): Promise<MeetingReportRow> {
    const updatedReport = await executor.queryOne<MeetingReportRow>(
      `
        UPDATE meeting_reports
        SET
          status = 'QUEUED',
          failed_step = NULL,
          error_message = NULL,
          failure_code = NULL,
          failure_detail = NULL,
          transcript_text = NULL,
          title = NULL,
          summary = NULL,
          discussion_points = NULL,
          decisions = NULL,
          action_item_candidates = '[]'::jsonb,
          retry_count = retry_count + 1,
          updated_at = now()
        WHERE id = $1
          AND status = 'FAILED'
        RETURNING
          id,
          meeting_id,
          recording_id,
          status,
          failed_step,
          error_message,
          failure_code,
          failure_detail,
          COALESCE(user_title, title) AS title,
          user_title,
          summary,
          COALESCE(user_discussion_points, discussion_points) AS discussion_points,
          user_discussion_points,
          decisions,
          content_version,
          content_edited_by_user_id,
          content_edited_at,
          action_item_candidates,
          retry_count,
          created_at,
          updated_at
      `,
      [reportId]
    );

    if (updatedReport === null) {
      throw badRequest("Meeting report could not be regenerated");
    }

    return updatedReport;
  }

  private async restoreMeetingReportAfterRegenerationEnqueueFailure(
    report: MeetingReportRegenerationRow
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const restoredReport = await transaction.queryOne<MeetingReportRow>(
        `
          UPDATE meeting_reports
          SET
            status = $2::meeting_report_status,
            failed_step = $3::meeting_report_failed_step,
            error_message = $4,
            failure_code = $5,
            failure_detail = $6::jsonb,
            transcript_text = $7,
            title = $8,
            summary = $9,
            discussion_points = $10,
            decisions = $11,
            action_item_candidates = $12::jsonb,
            retry_count = $13,
            updated_at = now()
          WHERE id = $1
            AND status IN ('PROCESSING', 'QUEUED', 'TRANSCRIBING', 'SUMMARIZING')
          RETURNING
            id,
            meeting_id,
            recording_id,
            status,
            failed_step,
            error_message,
            failure_code,
            failure_detail,
            title,
            user_title,
            summary,
            discussion_points,
            decisions,
            user_discussion_points,
            content_version,
            content_edited_by_user_id,
            content_edited_at,
            action_item_candidates,
            retry_count,
            created_at,
            updated_at
        `,
        [
          report.id,
          report.status,
          report.failed_step,
          report.error_message,
          report.failure_code,
          report.failure_detail == null ? null : JSON.stringify(report.failure_detail),
          report.transcript_text,
          report.ai_title,
          report.summary,
          report.ai_discussion_points,
          report.ai_decisions,
          JSON.stringify(report.action_item_candidates ?? []),
          Number(report.retry_count)
        ]
      );

      if (restoredReport === null) {
        throw badRequest("Meeting report regeneration could not be restored");
      }
    });
  }

  private buildMeetingReportJobPayloadFromAudioFileKey(
    report: MeetingReportRow,
    audioFileKey: string
  ): MeetingReportJobPayload {
    return {
      jobType: "meeting_report",
      reportId: report.id,
      meetingId: report.meeting_id,
      recordingId: report.recording_id,
      audioFileKey,
      retryCount: Number(report.retry_count)
    };
  }

  private async assertWorkspaceAccess(
    currentUserId: string,
    workspaceId: string
  ): Promise<void> {
    await this.workspaceService.assertWorkspaceAccess(currentUserId, workspaceId);
  }

  private async assertMeetingExists(
    workspaceId: string,
    meetingId: string
  ): Promise<void> {
    if (!UUID_PATTERN.test(meetingId)) {
      throw notFound("Meeting not found");
    }
    const meeting = await this.database.queryOne<{ id: string }>(
      `
        SELECT meetings.id
        FROM meetings
        WHERE meetings.workspace_id = $1
          AND meetings.id = $2
        LIMIT 1
      `,
      [workspaceId, meetingId]
    );
    if (!meeting) {
      throw notFound("Meeting not found");
    }
  }

  private async publishMeetingReportEvent(reportId: string | undefined): Promise<void> {
    if (!reportId) return;
    await this.meetingReportRealtimePublisher?.publishReportUpdatedSafely(reportId);
  }

  private async listMeetingReportRows(
    meetingId: string
  ): Promise<MeetingReportRow[]> {
    return this.database.query<MeetingReportRow>(
      `
        SELECT
          meeting_reports.id, meeting_reports.meeting_id, meeting_reports.recording_id,
          meeting_reports.status, meeting_reports.failed_step, meeting_reports.error_message,
          COALESCE(meeting_reports.user_title, meeting_reports.title) AS title,
          meeting_reports.user_title,
          meeting_reports.summary,
          COALESCE(meeting_reports.user_discussion_points, meeting_reports.discussion_points) AS discussion_points,
          meeting_reports.user_discussion_points,
          COALESCE(decision_content.decisions, meeting_reports.decisions) AS decisions,
          meeting_reports.content_version, meeting_reports.content_edited_by_user_id,
          meeting_reports.content_edited_at,
          meeting_reports.action_item_candidates, meeting_reports.retry_count,
          meeting_reports.created_at, meeting_reports.updated_at,
          ${this.meetingReportParticipantSummaryColumns()}
        FROM meeting_reports
        LEFT JOIN LATERAL (
          SELECT string_agg(COALESCE(user_text, text), E'\n' ORDER BY source_index) AS decisions
          FROM meeting_report_decision_items
          WHERE meeting_report_id = meeting_reports.id
        ) AS decision_content ON true
        ${this.meetingReportParticipantSummaryJoin("meeting_reports")}
        WHERE meeting_reports.meeting_id = $1
        ORDER BY meeting_reports.created_at DESC, meeting_reports.id ASC
      `,
      [meetingId]
    );
  }

  private async listWorkspaceMeetingReportRows(
    workspaceId: string,
    currentUserId: string,
    status: MeetingReportStatus | null,
    limit: number,
    filters: {
      cursor: MeetingReportCursor | null;
      from: string | null;
      searchQuery: string | null;
      to: string | null;
      reportTitle?: string | null;
      reportTitlePrefix?: string | null;
      roomName?: string | null;
    }
  ): Promise<{ nextCursor: string | null; reports: MeetingReportRow[] }> {
    const values: unknown[] = [workspaceId, currentUserId];
    const statusCondition =
      status === null
        ? ""
        : `AND meeting_reports.status = $${values.push(status)}`;
    const searchCondition =
      filters.searchQuery === null
        ? ""
        : `AND to_tsvector('simple', concat_ws(' ', COALESCE(meeting_reports.user_title, meeting_reports.title, ''), COALESCE(meeting_reports.summary, ''), COALESCE(meeting_reports.user_discussion_points, meeting_reports.discussion_points, ''), COALESCE((SELECT string_agg(COALESCE(user_text, text), E'\n' ORDER BY source_index) FROM meeting_report_decision_items WHERE meeting_report_id = meeting_reports.id), meeting_reports.decisions, ''), COALESCE(meeting_reports.action_item_candidates::text, ''), COALESCE(meeting_reports.error_message, ''))) @@ websearch_to_tsquery('simple', $${values.push(filters.searchQuery)})`;
    const fromCondition =
      filters.from === null
        ? ""
        : `AND meeting_reports.created_at >= $${values.push(filters.from)}::timestamptz`;
    const toCondition =
      filters.to === null
        ? ""
        : `AND meeting_reports.created_at < $${values.push(filters.to)}::timestamptz`;
    const roomNameCondition =
      filters.roomName === null || filters.roomName === undefined
        ? ""
        : `AND lower(regexp_replace(BTRIM(meeting_rooms.name), '\\s+', ' ', 'g')) = $${values.push(filters.roomName)}`;
    const reportTitleCondition =
      filters.reportTitle === null || filters.reportTitle === undefined
        ? ""
        : `AND lower(regexp_replace(BTRIM(COALESCE(meeting_reports.user_title, meeting_reports.title)), '\\s+', ' ', 'g')) = $${values.push(filters.reportTitle)}`;
    const reportTitlePrefixCondition =
      filters.reportTitlePrefix === null || filters.reportTitlePrefix === undefined
        ? ""
        : (() => {
            const titleParameter = `$${values.push(filters.reportTitlePrefix)}`;
            const normalizedTitle =
              "lower(regexp_replace(BTRIM(COALESCE(meeting_reports.user_title, meeting_reports.title)), '\\s+', ' ', 'g'))";
            return `AND left(${normalizedTitle}, char_length(${titleParameter})) = ${titleParameter}
              AND substring(${normalizedTitle} FROM char_length(${titleParameter}) + 1 FOR 1)
                IN (' ', ':', '：', '-', '–', '—', '|', '/', '·')`;
          })();
    const cursorCondition =
      filters.cursor === null
        ? ""
        : (() => {
            const createdAtParameter = `$${values.push(filters.cursor.createdAt)}`;
            const idParameter = `$${values.push(filters.cursor.id)}`;
            return `AND (meeting_reports.created_at < ${createdAtParameter}::timestamptz OR (meeting_reports.created_at = ${createdAtParameter}::timestamptz AND meeting_reports.id > ${idParameter}::uuid))`;
          })();
    const limitParameter = `$${values.push(limit + 1)}`;

    const rows = await this.database.query<MeetingReportRow>(
      `
        SELECT
          meeting_reports.id,
          meeting_reports.meeting_id,
          meeting_reports.recording_id,
          meeting_reports.status,
          meeting_reports.failed_step,
          meeting_reports.error_message,
          COALESCE(meeting_reports.user_title, meeting_reports.title) AS title,
          meeting_reports.user_title,
          meeting_reports.summary,
          COALESCE(meeting_reports.user_discussion_points, meeting_reports.discussion_points) AS discussion_points,
          meeting_reports.user_discussion_points,
          COALESCE(decision_content.decisions, meeting_reports.decisions) AS decisions,
          meeting_reports.content_version,
          meeting_reports.content_edited_by_user_id,
          meeting_reports.content_edited_at,
          meeting_reports.action_item_candidates,
          meeting_reports.retry_count,
          meeting_reports.created_at,
          meeting_reports.updated_at,
          extraction.status AS action_item_extraction_status,
          extraction.failure_code AS action_item_extraction_failure_code,
          (
            EXISTS (
              SELECT 1
              FROM workspace_members
              WHERE workspace_members.workspace_id = meetings.workspace_id
                AND workspace_members.user_id = $2
                AND workspace_members.role = 'owner'
            )
            OR EXISTS (
              SELECT 1
              FROM meeting_participants
              WHERE meeting_participants.meeting_id = meeting_reports.meeting_id
                AND meeting_participants.user_id = $2
            )
          ) AS can_delete,
          (
            EXISTS (
              SELECT 1
              FROM workspace_members
              WHERE workspace_members.workspace_id = meetings.workspace_id
                AND workspace_members.user_id = $2
                AND workspace_members.role = 'owner'
            )
            OR EXISTS (
              SELECT 1
              FROM meeting_participants
              WHERE meeting_participants.meeting_id = meeting_reports.meeting_id
                AND meeting_participants.user_id = $2
            )
          ) AS can_edit,
          ${this.meetingReportParticipantSummaryColumns()}
        FROM meeting_reports
        JOIN meetings
          ON meetings.id = meeting_reports.meeting_id
        LEFT JOIN meeting_rooms
          ON meeting_rooms.workspace_id = meetings.workspace_id
          AND meeting_rooms.room_key = meetings.room_key
        LEFT JOIN meeting_report_action_item_extractions AS extraction
          ON extraction.meeting_report_id = meeting_reports.id
        LEFT JOIN LATERAL (
          SELECT string_agg(COALESCE(user_text, text), E'\n' ORDER BY source_index) AS decisions
          FROM meeting_report_decision_items
          WHERE meeting_report_id = meeting_reports.id
        ) AS decision_content ON true
        ${this.meetingReportParticipantSummaryJoin("meeting_reports")}
        WHERE meetings.workspace_id = $1
          ${statusCondition}
          ${searchCondition}
          ${fromCondition}
          ${toCondition}
          ${roomNameCondition}
          ${reportTitleCondition}
          ${reportTitlePrefixCondition}
          ${cursorCondition}
        ORDER BY meeting_reports.created_at DESC, meeting_reports.id ASC
        LIMIT ${limitParameter}
      `,
      values
    );
    const reports = rows.slice(0, limit);
    const lastReport = reports.at(-1);

    return {
      nextCursor:
        rows.length > limit && lastReport
          ? this.encodeMeetingReportCursor({
              createdAt: this.toIsoString(lastReport.created_at),
              id: lastReport.id
            })
          : null,
      reports
    };
  }

  private async findMeetingReportDetailById(
    workspaceId: string,
    currentUserId: string,
    reportId: string
  ): Promise<MeetingReportDetailRow | null> {
    if (!UUID_PATTERN.test(reportId)) {
      return null;
    }

    return this.database.queryOne<MeetingReportDetailRow>(
      `
        SELECT
          meeting_reports.id,
          meeting_reports.meeting_id,
          meeting_reports.recording_id,
          meeting_reports.status,
          meeting_reports.failed_step,
          meeting_reports.error_message,
          meeting_reports.transcript_text,
          COALESCE(meeting_reports.user_title, meeting_reports.title) AS title,
          meeting_reports.user_title,
          meeting_reports.summary,
          COALESCE(meeting_reports.user_discussion_points, meeting_reports.discussion_points) AS discussion_points,
          meeting_reports.user_discussion_points,
          COALESCE(decision_content.decisions, meeting_reports.decisions) AS decisions,
          meeting_reports.content_version,
          meeting_reports.content_edited_by_user_id,
          meeting_reports.content_edited_at,
          meeting_reports.action_item_candidates,
          meeting_reports.retry_count,
          meeting_reports.created_at,
          meeting_reports.updated_at,
          extraction.status AS action_item_extraction_status,
          extraction.failure_code AS action_item_extraction_failure_code,
          (
            EXISTS (
              SELECT 1
              FROM workspace_members
              WHERE workspace_members.workspace_id = meetings.workspace_id
                AND workspace_members.user_id = $2
                AND workspace_members.role = 'owner'
            )
            OR EXISTS (
              SELECT 1
              FROM meeting_participants
              WHERE meeting_participants.meeting_id = meeting_reports.meeting_id
                AND meeting_participants.user_id = $2
            )
          ) AS can_delete,
          (
            EXISTS (
              SELECT 1
              FROM workspace_members
              WHERE workspace_members.workspace_id = meetings.workspace_id
                AND workspace_members.user_id = $2
                AND workspace_members.role = 'owner'
            )
            OR EXISTS (
              SELECT 1
              FROM meeting_participants
              WHERE meeting_participants.meeting_id = meeting_reports.meeting_id
                AND meeting_participants.user_id = $2
            )
          ) AS can_edit,
          ${this.meetingReportParticipantSummaryColumns()}
        FROM meeting_reports
        JOIN meetings
          ON meetings.id = meeting_reports.meeting_id
        LEFT JOIN meeting_report_action_item_extractions AS extraction
          ON extraction.meeting_report_id = meeting_reports.id
        LEFT JOIN LATERAL (
          SELECT string_agg(COALESCE(user_text, text), E'\n' ORDER BY source_index) AS decisions
          FROM meeting_report_decision_items
          WHERE meeting_report_id = meeting_reports.id
        ) AS decision_content ON true
        ${this.meetingReportParticipantSummaryJoin("meeting_reports")}
        WHERE meetings.workspace_id = $1
          AND meeting_reports.id = $3
        LIMIT 1
      `,
      [workspaceId, currentUserId, reportId]
    );
  }

  private mapMeetingReportSummary(
    report: MeetingReportRow
  ): MeetingReportSummaryPayload {
    const actionItemExtraction = this.mapActionItemExtraction(report);
    return {
      id: report.id,
      meetingId: report.meeting_id,
      recordingId: report.recording_id,
      status: report.status,
      failedStep: report.failed_step,
      errorMessage: report.error_message,
      title: report.title,
      summary: report.summary,
      discussionPoints: report.discussion_points,
      decisions: report.decisions,
      contentVersion: Number(report.content_version),
      contentEditedByUserId: report.content_edited_by_user_id,
      contentEditedAt: this.toNullableIsoString(report.content_edited_at),
      actionItemCandidates: this.toJsonArray(report.action_item_candidates),
      ...(actionItemExtraction
        ? { actionItemExtraction }
        : {}),
      retryCount: Number(report.retry_count),
      participantSummary: this.mapMeetingReportParticipantSummary(report),
      ...(typeof report.can_delete === "boolean"
        ? { canDelete: report.can_delete }
        : {}),
      ...(typeof report.can_edit === "boolean"
        ? { canEdit: report.can_edit }
        : {}),
      createdAt: this.toIsoString(report.created_at),
      updatedAt: this.toIsoString(report.updated_at)
    };
  }

  private mapActionItemExtraction(
    report: MeetingReportRow
  ): MeetingReportActionItemExtractionPayload | null {
    const rawStatus = report.action_item_extraction_status;
    if (typeof rawStatus !== "string") return null;
    const status = rawStatus.toUpperCase() as MeetingReportActionItemExtractionStatus;
    if (![
      "PENDING", "PUBLISHING", "QUEUED", "PROCESSING", "COMPLETED", "FAILED"
    ].includes(status)) return null;
    return {
      status,
      errorMessage: status === "FAILED" ? "후속 작업을 생성하지 못했습니다." : null
    };
  }

  private mapMeetingReportParticipantSummary(report: MeetingReportRow) {
    const participants = this.toJsonArray(report.participant_preview).flatMap((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
      const participant = value as Record<string, unknown>;
      if (typeof participant.userId !== "string") return [];
      return [{
        userId: participant.userId,
        name: typeof participant.name === "string" ? participant.name : null,
        avatarUrl: typeof participant.avatarUrl === "string" ? participant.avatarUrl : null
      }];
    });
    const totalCount = Number(report.participant_count ?? 0);
    return { totalCount, participants, hasMore: totalCount > participants.length };
  }

  private meetingReportParticipantSummaryColumns(): string {
    return "COALESCE(participant_summary.participant_count, 0)::int AS participant_count, COALESCE(participant_summary.participant_preview, '[]'::jsonb) AS participant_preview";
  }

  private meetingReportParticipantSummaryJoin(reportAlias: string): string {
    return `LEFT JOIN LATERAL (
      SELECT
        (SELECT COUNT(DISTINCT user_id)::int FROM meeting_participants WHERE meeting_id = ${reportAlias}.meeting_id) AS participant_count,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('userId', preview.user_id, 'name', preview.name, 'avatarUrl', preview.avatar_url) ORDER BY preview.joined_at ASC, preview.id ASC), '[]'::jsonb)
         FROM (
           SELECT first_session.id, first_session.user_id, first_session.joined_at, first_session.name, first_session.avatar_url
           FROM (
             SELECT DISTINCT ON (meeting_participants.user_id)
               meeting_participants.id,
               meeting_participants.user_id,
               meeting_participants.joined_at,
               users.name,
               users.avatar_url
             FROM meeting_participants
             JOIN users ON users.id = meeting_participants.user_id
             WHERE meeting_participants.meeting_id = ${reportAlias}.meeting_id
             ORDER BY meeting_participants.user_id, meeting_participants.joined_at ASC, meeting_participants.id ASC
           ) AS first_session
           ORDER BY first_session.joined_at ASC, first_session.id ASC
           LIMIT 3
         ) AS preview) AS participant_preview
    ) AS participant_summary ON true`;
  }

  private async transitionMeetingReportActionItem(
    currentUserId: string,
    workspaceId: string,
    reportId: string,
    actionItemId: string,
    status: "APPROVED" | "DISMISSED"
  ): Promise<MeetingReportActionItemRow> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);

    return this.database.transaction(async (transaction) => {
      const current = await this.findMeetingReportActionItemForUpdate(
        transaction,
        workspaceId,
        reportId,
        actionItemId
      );
      this.assertPendingMeetingReportActionItem(current);
      const updated = await transaction.queryOne<{ id: string }>(
        status === "APPROVED"
          ? `UPDATE meeting_report_action_items
             SET status = 'APPROVED', updated_by_user_id = $2,
                 approved_by_user_id = $2, approved_at = now(), updated_at = now()
             WHERE id = $1 AND status = 'PENDING'
             RETURNING id`
          : `UPDATE meeting_report_action_items
             SET status = 'DISMISSED', updated_by_user_id = $2,
                 dismissed_by_user_id = $2, dismissed_at = now(), updated_at = now()
             WHERE id = $1 AND status = 'PENDING'
             RETURNING id`,
        [current.id, currentUserId]
      );
      if (updated === null) throw badRequest("Action item is no longer pending");
      return this.findMeetingReportActionItemForUpdate(
        transaction,
        workspaceId,
        reportId,
        actionItemId
      );
    });
  }

  private async findMeetingReportActionItemForUpdate(
    executor: QueryOneExecutor,
    workspaceId: string,
    reportId: string,
    actionItemId: string
  ): Promise<MeetingReportActionItemRow> {
    if (!UUID_PATTERN.test(reportId) || !UUID_PATTERN.test(actionItemId)) {
      throw notFound("Meeting report action item not found");
    }
    const actionItem = await executor.queryOne<MeetingReportActionItemRow>(
      `SELECT action_items.id, action_items.meeting_report_id, action_items.source_index,
              action_items.title, action_items.description, action_items.priority,
              action_items.assignee_user_id, users.name AS assignee_name,
              users.avatar_url AS assignee_avatar_url,
              meeting_reports.action_item_candidates,
              action_items.status,
              action_items.updated_by_user_id, action_items.approved_by_user_id,
              action_items.approved_at, action_items.dismissed_by_user_id,
              action_items.dismissed_at, action_items.created_at, action_items.updated_at
       FROM meeting_report_action_items AS action_items
       JOIN meeting_reports ON meeting_reports.id = action_items.meeting_report_id
       JOIN meetings ON meetings.id = meeting_reports.meeting_id
       LEFT JOIN users ON users.id = action_items.assignee_user_id
       WHERE meetings.workspace_id = $1
         AND action_items.meeting_report_id = $2
         AND action_items.id = $3
       FOR UPDATE OF action_items`,
      [workspaceId, reportId, actionItemId]
    );
    if (actionItem === null) throw notFound("Meeting report action item not found");
    return actionItem;
  }

  private assertPendingMeetingReportActionItem(
    actionItem: MeetingReportActionItemRow
  ): void {
    if (actionItem.status !== "PENDING") {
      throw badRequest("Action item is no longer pending");
    }
  }

  private async assertWorkspaceMember(
    executor: QueryOneExecutor,
    workspaceId: string,
    userId: string
  ): Promise<void> {
    const member = await executor.queryOne<{ user_id: string }>(
      `SELECT user_id FROM workspace_members
       WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    );
    if (member === null) {
      throw badRequest("Action item assignee must be a Workspace member");
    }
  }

  private async updatePendingMeetingReportActionItem(
    executor: QueryOneExecutor,
    actionItem: MeetingReportActionItemRow,
    values: {
      title: string;
      description: string;
      priority: "LOW" | "MEDIUM" | "HIGH";
      assigneeUserId: string | null;
    },
    currentUserId: string
  ): Promise<MeetingReportActionItemRow> {
    const updated = await executor.queryOne<{ id: string }>(
      `UPDATE meeting_report_action_items
       SET title = $2, description = $3, priority = $4, assignee_user_id = $5,
           updated_by_user_id = $6, updated_at = now()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING id`,
      [
        actionItem.id,
        values.title,
        values.description,
        values.priority,
        values.assigneeUserId,
        currentUserId
      ]
    );
    if (updated === null) throw badRequest("Action item is no longer pending");
    return {
      ...actionItem,
      assignee_avatar_url: values.assigneeUserId === actionItem.assignee_user_id
        ? actionItem.assignee_avatar_url
        : null,
      assignee_name: values.assigneeUserId === actionItem.assignee_user_id
        ? actionItem.assignee_name
        : null,
      assignee_user_id: values.assigneeUserId,
      description: values.description,
      priority: values.priority,
      title: values.title,
      updated_at: new Date(),
      updated_by_user_id: currentUserId
    };
  }

  private normalizeMeetingReportActionItemPatch(body: unknown): {
    title?: string;
    description?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH";
    assigneeUserId?: string | null;
  } {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw badRequest("Action item patch must be an object");
    }
    const patch = body as Record<string, unknown>;
    const allowed = new Set(["title", "description", "priority", "assigneeUserId"]);
    if (!Object.keys(patch).length || Object.keys(patch).some((key) => !allowed.has(key))) {
      throw badRequest("Invalid action item patch");
    }
    const normalized: {
      title?: string;
      description?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH";
      assigneeUserId?: string | null;
    } = {};
    if (Object.hasOwn(patch, "title")) normalized.title = this.normalizeActionItemText(patch.title, "title", 500);
    if (Object.hasOwn(patch, "description")) normalized.description = this.normalizeActionItemText(patch.description, "description", 5000);
    if (Object.hasOwn(patch, "priority")) {
      if (patch.priority !== "LOW" && patch.priority !== "MEDIUM" && patch.priority !== "HIGH") {
        throw badRequest("Invalid action item priority");
      }
      normalized.priority = patch.priority;
    }
    if (Object.hasOwn(patch, "assigneeUserId")) {
      if (patch.assigneeUserId === null) normalized.assigneeUserId = null;
      else if (typeof patch.assigneeUserId === "string" && UUID_PATTERN.test(patch.assigneeUserId)) normalized.assigneeUserId = patch.assigneeUserId;
      else throw badRequest("Invalid action item assignee");
    }
    return normalized;
  }

  private normalizeMeetingReportContentPatch(body: unknown): {
    expectedVersion: number;
    title?: string;
    discussionPoints?: string;
    decisionItems: Array<{ id: string; text: string }>;
  } {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw badRequest("Meeting report patch must be an object");
    }
    const patch = body as Record<string, unknown>;
    const allowed = new Set([
      "expectedVersion",
      "title",
      "discussionPoints",
      "decisionItems"
    ]);
    if (
      Object.keys(patch).some((key) => !allowed.has(key)) ||
      !Object.hasOwn(patch, "expectedVersion")
    ) {
      throw badRequest("Invalid meeting report patch");
    }
    if (
      typeof patch.expectedVersion !== "number" ||
      !Number.isInteger(patch.expectedVersion) ||
      patch.expectedVersion < 1
    ) {
      throw badRequest("Invalid meeting report expectedVersion");
    }

    const normalized: {
      expectedVersion: number;
      title?: string;
      discussionPoints?: string;
      decisionItems: Array<{ id: string; text: string }>;
    } = {
      expectedVersion: patch.expectedVersion,
      decisionItems: []
    };
    if (Object.hasOwn(patch, "title")) {
      normalized.title = this.normalizeMeetingReportContentText(
        patch.title,
        "title",
        500
      );
    }
    if (Object.hasOwn(patch, "discussionPoints")) {
      normalized.discussionPoints = this.normalizeMeetingReportContentText(
        patch.discussionPoints,
        "discussionPoints",
        16000
      );
    }
    if (Object.hasOwn(patch, "decisionItems")) {
      if (!Array.isArray(patch.decisionItems) || !patch.decisionItems.length) {
        throw badRequest("Meeting report decisionItems must be a non-empty array");
      }
      const seenIds = new Set<string>();
      normalized.decisionItems = patch.decisionItems.map((value) => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          throw badRequest("Invalid meeting report decision item");
        }
        const item = value as Record<string, unknown>;
        if (
          Object.keys(item).length !== 2 ||
          !Object.hasOwn(item, "id") ||
          !Object.hasOwn(item, "text") ||
          typeof item.id !== "string" ||
          !UUID_PATTERN.test(item.id) ||
          seenIds.has(item.id)
        ) {
          throw badRequest("Invalid meeting report decision item");
        }
        seenIds.add(item.id);
        return {
          id: item.id,
          text: this.normalizeMeetingReportContentText(item.text, "decision text", 5000)
        };
      });
    }
    if (
      normalized.title === undefined &&
      normalized.discussionPoints === undefined &&
      !normalized.decisionItems.length
    ) {
      throw badRequest("Meeting report patch must update content");
    }
    return normalized;
  }

  private normalizeMeetingReportContentText(
    value: unknown,
    field: string,
    maxLength: number
  ): string {
    if (typeof value !== "string") {
      throw badRequest(`Meeting report ${field} must be a string`);
    }
    const normalized = value.trim();
    if (!normalized || Buffer.byteLength(normalized, "utf8") > maxLength) {
      throw badRequest(`Invalid meeting report ${field}`);
    }
    return normalized;
  }

  private normalizeActionItemText(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== "string") throw badRequest(`Action item ${field} must be a string`);
    const normalized = value.trim();
    if (!normalized || Buffer.byteLength(normalized, "utf8") > maxLength) {
      throw badRequest(`Invalid action item ${field}`);
    }
    return normalized;
  }

  private mapMeetingReportActionItem(
    actionItem: MeetingReportActionItemRow
  ): MeetingReportActionItemPayload {
    return {
      id: actionItem.id,
      sourceIndex: Number(actionItem.source_index),
      title: actionItem.title,
      description: actionItem.description,
      priority: actionItem.priority,
      assignee: actionItem.assignee_user_id === null ? null : {
        userId: actionItem.assignee_user_id,
        name: actionItem.assignee_name,
        avatarUrl: actionItem.assignee_avatar_url
      },
      deliverySuggestion: this.getActionItemDeliverySuggestion(actionItem),
      status: actionItem.status,
      updatedByUserId: actionItem.updated_by_user_id,
      approvedByUserId: actionItem.approved_by_user_id,
      approvedAt: this.toNullableIsoString(actionItem.approved_at),
      dismissedByUserId: actionItem.dismissed_by_user_id,
      dismissedAt: this.toNullableIsoString(actionItem.dismissed_at),
      delivery: !actionItem.delivery_id ||
        !actionItem.delivery_type ||
        !actionItem.delivery_status
        ? null
        : {
            deliveryType: actionItem.delivery_type,
            status: actionItem.delivery_status,
            errorCode: actionItem.delivery_error_code ?? null,
            draft: this.toMeetingActionItemDeliveryDraft(
              actionItem.delivery_draft_json,
              actionItem.delivery_type
            ),
            targetResourceId: actionItem.delivery_target_resource_id ?? null,
            calendarEvent: actionItem.calendar_event_id === null ||
              actionItem.calendar_event_title === null
              ? null
              : {
                  id: String(actionItem.calendar_event_id),
                  title: actionItem.calendar_event_title ?? "일정"
                },
            piloIssue: actionItem.pilo_issue_id === null ||
              actionItem.pilo_issue_title === null ||
              actionItem.pilo_issue_board_id === null ||
              actionItem.pilo_issue_column_id === null
              ? null
              : {
                  id: String(actionItem.pilo_issue_id),
                  title: actionItem.pilo_issue_title ?? "Issue",
                  boardId: String(actionItem.pilo_issue_board_id),
                  columnId: String(actionItem.pilo_issue_column_id),
                  columnName: actionItem.pilo_issue_column_name ?? null
                }
          },
      createdAt: this.toIsoString(actionItem.created_at),
      updatedAt: this.toIsoString(actionItem.updated_at)
    };
  }

  private getActionItemDeliverySuggestion(
    actionItem: MeetingReportActionItemRow
  ): MeetingReportActionItemPayload["deliverySuggestion"] {
    const candidate = this.toJsonArray(actionItem.action_item_candidates)[
      Number(actionItem.source_index)
    ];
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      return null;
    }
    const suggestion = (candidate as Record<string, unknown>).deliverySuggestion;
    if (typeof suggestion !== "object" || suggestion === null || Array.isArray(suggestion)) {
      return null;
    }
    const value = suggestion as Record<string, unknown>;
    if (value.deliveryType === "pilo_issue") {
      return { deliveryType: "pilo_issue", calendar: null };
    }
    if (value.deliveryType !== "calendar_event") return null;
    const calendar = value.calendar;
    if (typeof calendar !== "object" || calendar === null || Array.isArray(calendar)) {
      return null;
    }
    const details = calendar as Record<string, unknown>;
    if (
      typeof details.isAllDay !== "boolean" ||
      typeof details.startDate !== "string" ||
      typeof details.endDate !== "string" ||
      (details.startTime !== null && typeof details.startTime !== "string") ||
      (details.endTime !== null && typeof details.endTime !== "string")
    ) {
      return null;
    }
    return {
      deliveryType: "calendar_event",
      calendar: {
        isAllDay: details.isAllDay,
        startDate: details.startDate,
        endDate: details.endDate,
        startTime: details.startTime,
        endTime: details.endTime
      }
    };
  }

  private mapMeetingReportDetail(report: MeetingReportDetailRow, evidence: {
    evidenceSegments: MeetingReportDetailPayload["evidenceSegments"];
    evidence: MeetingReportDetailPayload["evidence"];
    activityEvidence: MeetingReportDetailPayload["activityEvidence"];
    actionItems: MeetingReportActionItemPayload[];
    actionItemAssignees: MeetingReportActionItemAssigneePayload[];
    decisionItems: MeetingReportDecisionItemPayload[];
  }): MeetingReportDetailPayload {
    return {
      ...this.mapMeetingReportSummary(report),
      transcriptText: report.transcript_text,
      ...evidence
    };
  }

  private async listMeetingReportDecisionItems(
    reportId: string
  ): Promise<MeetingReportDecisionItemPayload[]> {
    const rows = await this.database.query<MeetingReportDecisionItemRow>(
      `SELECT id, source_index, text, user_text, edited_by_user_id, edited_at
       FROM meeting_report_decision_items
       WHERE meeting_report_id = $1
       ORDER BY source_index ASC, id ASC`,
      [reportId]
    );
    return rows.map((item) => ({
      id: item.id,
      sourceIndex: Number(item.source_index),
      text: item.user_text ?? item.text,
      isUserEdited: item.user_text !== null,
      editedByUserId: item.edited_by_user_id,
      editedAt: this.toNullableIsoString(item.edited_at)
    }));
  }

  private async listMeetingReportActionItems(
    reportId: string
  ): Promise<MeetingReportActionItemPayload[]> {
    const rows = await this.database.query<MeetingReportActionItemRow>(
      `SELECT action_items.id, action_items.meeting_report_id, action_items.source_index,
              action_items.title, action_items.description, action_items.priority,
              action_items.assignee_user_id, users.name AS assignee_name,
              users.avatar_url AS assignee_avatar_url,
              meeting_reports.action_item_candidates,
              action_items.status,
              action_items.updated_by_user_id, action_items.approved_by_user_id,
              action_items.approved_at, action_items.dismissed_by_user_id,
              action_items.dismissed_at, action_items.created_at, action_items.updated_at,
              delivery.id AS delivery_id, delivery.delivery_type, delivery.status AS delivery_status,
              delivery.last_error_code AS delivery_error_code,
              delivery.draft_json AS delivery_draft_json,
              delivery.target_resource_id AS delivery_target_resource_id,
              calendar_event.id AS calendar_event_id, calendar_event.title AS calendar_event_title,
              pilo_issue.id AS pilo_issue_id, pilo_issue.title AS pilo_issue_title,
              pilo_issue.board_id AS pilo_issue_board_id,
              pilo_issue.column_id AS pilo_issue_column_id,
              board_column.name AS pilo_issue_column_name
       FROM meeting_report_action_items AS action_items
       JOIN meeting_reports
         ON meeting_reports.id = action_items.meeting_report_id
       LEFT JOIN users ON users.id = action_items.assignee_user_id
       LEFT JOIN meeting_report_action_item_deliveries AS delivery
         ON delivery.action_item_id = action_items.id
       LEFT JOIN calendar_events AS calendar_event
         ON calendar_event.id = delivery.calendar_event_id
       LEFT JOIN pilo_issues AS pilo_issue
         ON pilo_issue.id = delivery.pilo_issue_id
       LEFT JOIN board_columns AS board_column
         ON board_column.id = pilo_issue.column_id
        AND board_column.board_id = pilo_issue.board_id
       WHERE action_items.meeting_report_id = $1
       ORDER BY action_items.source_index ASC`,
      [reportId]
    );
    return rows.map((actionItem) => this.mapMeetingReportActionItem(actionItem));
  }

  private async listMeetingReportActionItemAssignees(
    workspaceId: string
  ): Promise<MeetingReportActionItemAssigneePayload[]> {
    const rows = await this.database.query<MeetingReportActionItemAssigneeRow>(
      `SELECT workspace_members.user_id, users.name, users.avatar_url
       FROM workspace_members
       JOIN users ON users.id = workspace_members.user_id
       WHERE workspace_members.workspace_id = $1
       ORDER BY CASE workspace_members.role WHEN 'owner' THEN 0 ELSE 1 END,
                workspace_members.joined_at ASC, workspace_members.user_id ASC`,
      [workspaceId]
    );
    return rows.map((member) => ({
      userId: member.user_id,
      name: member.name,
      avatarUrl: member.avatar_url
    }));
  }

  private async listMeetingReportEvidence(reportId: string): Promise<{ evidenceSegments: MeetingReportDetailPayload["evidenceSegments"]; evidence: MeetingReportDetailPayload["evidence"] }> {
    const rows = await this.database.query<{ id: string; segment_index: number; started_at_ms: number; ended_at_ms: number; text: string; source_type: string | null; source_index: number | null; transcript_segment_id: string | null }>(`
      SELECT segments.id, segments.segment_index, segments.started_at_ms, segments.ended_at_ms, segments.text,
        evidence.source_type, evidence.source_index, evidence.transcript_segment_id
      FROM meeting_report_evidence evidence
      JOIN meeting_report_transcript_segments segments ON segments.id = evidence.transcript_segment_id
      WHERE evidence.meeting_report_id = $1
      ORDER BY segments.segment_index ASC, evidence.source_type ASC, evidence.source_index ASC
    `, [reportId]);
    const segmentMap = new Map<string, MeetingReportDetailPayload["evidenceSegments"][number]>();
    const references: MeetingReportDetailPayload["evidence"] = [];
    for (const row of rows) {
      segmentMap.set(row.id, { id: row.id, segmentIndex: Number(row.segment_index), startedAtMs: Number(row.started_at_ms), endedAtMs: Number(row.ended_at_ms), text: row.text });
      if (row.source_type !== null && row.source_index !== null && row.transcript_segment_id !== null) references.push({ sourceType: row.source_type, sourceIndex: Number(row.source_index), transcriptSegmentId: row.transcript_segment_id });
    }
    return { evidenceSegments: [...segmentMap.values()], evidence: references };
  }

  private async listMeetingReportActivityEvidence(
    reportId: string
  ): Promise<MeetingReportDetailPayload["activityEvidence"]> {
    const rows = await this.database.query<{
      id: string;
      source_index: number | string;
      occurred_at: Date | string;
      action: string;
      summary: string;
      source_type: string | null;
      reference_source_index: number | string | null;
    }>(
      `SELECT activity_evidence.id, activity_evidence.source_index, activity_evidence.occurred_at,
              activity_evidence.action::text AS action, activity_evidence.summary,
              activity_references.source_type, activity_references.source_index AS reference_source_index
       FROM meeting_report_activity_evidence AS activity_evidence
       LEFT JOIN meeting_report_activity_evidence_references AS activity_references
         ON activity_references.activity_evidence_id = activity_evidence.id
        AND activity_references.meeting_report_id = activity_evidence.meeting_report_id
       WHERE activity_evidence.meeting_report_id = $1
       ORDER BY activity_evidence.occurred_at ASC, activity_evidence.source_index ASC,
                activity_references.source_type ASC, activity_references.source_index ASC`,
      [reportId]
    );

    const activityEvidence = new Map<string, MeetingReportDetailPayload["activityEvidence"][number]>();
    for (const row of rows) {
      const item = activityEvidence.get(row.id) ?? {
        id: row.id,
        sourceIndex: Number(row.source_index),
        occurredAt: new Date(row.occurred_at).toISOString(),
        action: row.action,
        summary: row.summary,
        references: []
      };
      if (row.source_type !== null && row.reference_source_index !== null) {
        item.references.push({
          sourceType: row.source_type,
          sourceIndex: Number(row.reference_source_index)
        });
      }
      activityEvidence.set(row.id, item);
    }
    return [...activityEvidence.values()];
  }

  private normalizeMeetingReportStatus(
    status: unknown
  ): MeetingReportStatus | null {
    if (status === undefined) {
      return null;
    }

    if (typeof status !== "string") {
      throw badRequest("Invalid meeting report status");
    }

    if (MEETING_REPORT_STATUSES.includes(status as MeetingReportStatus)) {
      return status as MeetingReportStatus;
    }

    throw badRequest("Invalid meeting report status");
  }

  private normalizeMeetingReportSearchQuery(value: unknown): string | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if (typeof value !== "string" || Array.isArray(value)) {
      throw badRequest("Invalid meeting report search query");
    }

    const query = value.trim();
    if (!query || query.length > 200) {
      throw badRequest("Invalid meeting report search query");
    }

    return query;
  }

  private normalizeMeetingReportDate(
    value: unknown,
    name: "from" | "to"
  ): string | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if (typeof value !== "string" || Array.isArray(value)) {
      throw badRequest(`Invalid meeting report ${name}`);
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw badRequest(`Invalid meeting report ${name}`);
    }

    return date.toISOString();
  }

  private normalizeMeetingReportCursor(value: unknown): MeetingReportCursor | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if (typeof value !== "string" || Array.isArray(value) || value.length > 512) {
      throw badRequest("Invalid meeting report cursor");
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8")
      ) as Partial<MeetingReportCursor>;
      const id = parsed.id;
      if (
        typeof parsed.createdAt !== "string" ||
        typeof id !== "string" ||
        !UUID_PATTERN.test(id)
      ) {
        throw new Error("Invalid cursor payload");
      }

      const createdAt = new Date(parsed.createdAt);
      if (!Number.isFinite(createdAt.getTime())) {
        throw new Error("Invalid cursor timestamp");
      }

      return { createdAt: createdAt.toISOString(), id };
    } catch {
      throw badRequest("Invalid meeting report cursor");
    }
  }

  private encodeMeetingReportCursor(cursor: MeetingReportCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
  }

  private isMeetingReportInProgress(status: MeetingReportStatus): boolean {
    return (
      status === "PROCESSING" ||
      status === "QUEUED" ||
      status === "TRANSCRIBING" ||
      status === "SUMMARIZING"
    );
  }

  private normalizeMeetingReportLimit(limit: unknown): number {
    if (limit === undefined || limit === null || limit === "") {
      return DEFAULT_MEETING_REPORT_LIMIT;
    }

    if (Array.isArray(limit)) {
      return DEFAULT_MEETING_REPORT_LIMIT;
    }

    const rawLimit = typeof limit === "number" ? String(limit) : limit;
    if (typeof rawLimit !== "string") {
      return DEFAULT_MEETING_REPORT_LIMIT;
    }

    const parsed = Number(rawLimit.trim());
    if (!Number.isFinite(parsed)) {
      return DEFAULT_MEETING_REPORT_LIMIT;
    }

    const integerLimit = Math.trunc(parsed);
    if (integerLimit < DEFAULT_MEETING_REPORT_LIMIT) {
      return DEFAULT_MEETING_REPORT_LIMIT;
    }

    return Math.min(integerLimit, MAX_MEETING_REPORT_LIMIT);
  }

/**
   * Agent retrieval needs an exact bounded result count for selector resolution.
   * Keep the public Meeting API's legacy 20-item minimum unchanged.
   */
  private normalizeAgentMeetingReportLimit(limit: unknown): number {
    if (limit === undefined || limit === null || limit === "") {
      return 1;
    }
    if (Array.isArray(limit)) {
      throw badRequest("Agent meeting report limit must be a positive integer");
    }
    const rawLimit = typeof limit === "number" ? String(limit) : limit;
    if (typeof rawLimit !== "string") {
      throw badRequest("Agent meeting report limit must be a positive integer");
    }
    const parsed = Number(rawLimit.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_MEETING_REPORT_LIMIT) {
      throw badRequest("Agent meeting report limit must be between 1 and 100");
    }
    return parsed;
  }

  private toJsonArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  private toMeetingActionItemDeliveryDraft(
    value: unknown,
    deliveryType: "calendar_event" | "pilo_issue"
  ): MeetingActionItemDeliveryInput | null {
    const draft = this.toJsonObject(value);
    if (!draft || draft.deliveryType !== deliveryType) return null;
    if (deliveryType === "calendar_event") {
      const calendar = this.toJsonObject(draft.calendar);
      if (
        !calendar ||
        typeof calendar.startDate !== "string" ||
        typeof calendar.endDate !== "string"
      ) {
        return null;
      }
      return {
        deliveryType,
        calendar: {
          title: typeof calendar.title === "string" ? calendar.title : undefined,
          description:
            typeof calendar.description === "string" || calendar.description === null
              ? calendar.description
              : undefined,
          color: typeof calendar.color === "string" ? calendar.color : undefined,
          isAllDay: typeof calendar.isAllDay === "boolean" ? calendar.isAllDay : undefined,
          startDate: calendar.startDate,
          endDate: calendar.endDate,
          startTime:
            typeof calendar.startTime === "string" || calendar.startTime === null
              ? calendar.startTime
              : undefined,
          endTime:
            typeof calendar.endTime === "string" || calendar.endTime === null
              ? calendar.endTime
              : undefined
        }
      };
    }
    const issue = this.toJsonObject(draft.issue);
    if (
      !issue ||
      typeof issue.boardId !== "string" ||
      typeof issue.columnId !== "string"
    ) {
      return null;
    }
    return {
      deliveryType,
      issue: {
        boardId: issue.boardId,
        columnId: issue.columnId,
        title: typeof issue.title === "string" ? issue.title : undefined,
        body: typeof issue.body === "string" ? issue.body : undefined
      }
    };
  }

  private toJsonObject(value: unknown): Record<string, unknown> | null {
    const parsed = typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return null;
          }
        })()
      : value;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toNullableIsoString(value: Date | string | null): string | null {
    return value === null ? null : this.toIsoString(value);
  }
}
