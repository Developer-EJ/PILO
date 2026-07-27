import { Injectable, Logger } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { badRequest } from "../../common/api-error";
import { DatabaseService } from "../../database/database.service";
import { MeetingReportJobPayload, MeetingReportJobService } from "./meeting-report-job.service";
import { MeetingReportRealtimePublisherService } from "./meeting-report-realtime-publisher.service";
import type {
  MeetingReportActionItemExtractionPayload,
  MeetingReportActionItemExtractionStatus,
  MeetingReportFailedStep,
  MeetingReportStatus,
  MeetingReportSummaryPayload
} from "./meeting-report.types";

type RecordingStatus = "RUNNING" | "COMPLETED" | "FAILED";

export interface MeetingReportSourceRecording extends QueryResultRow {
  id: string;
  meeting_id: string;
  livekit_egress_id: string | null;
  status: RecordingStatus;
  audio_file_url: string | null;
  audio_file_key: string | null;
  duration_sec: number | null;
  file_size_bytes: number | string | null;
  started_at: Date | string;
  ended_at: Date | string | null;
  error_message: string | null;
}

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

interface QueryOneExecutor {
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<T | null>;
}

interface MeetingReportInsertResult {
  report: MeetingReportRow;
  inserted: boolean;
}

export interface MeetingReportPreparation {
  report: MeetingReportSummaryPayload | null;
  job: MeetingReportJobPayload | null;
}

@Injectable()
export class MeetingReportLifecycleService {
  private readonly logger = new Logger(MeetingReportLifecycleService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly meetingReportJobService: MeetingReportJobService,
    private readonly meetingReportRealtimePublisher?: MeetingReportRealtimePublisherService
  ) {}

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

  async prepareForStoppedRecording(
    executor: QueryOneExecutor,
    recording: MeetingReportSourceRecording
  ): Promise<MeetingReportPreparation> {
    if (recording.status !== "COMPLETED") {
      return {
        report: null,
        job: null
      };
    }

    if (recording.duration_sec === null || Number(recording.duration_sec) <= 60) {
      return {
        report: null,
        job: null
      };
    }

    const existingReport = await this.findMeetingReportByRecordingId(
      executor,
      recording.meeting_id,
      recording.id
    );
    if (existingReport !== null) {
      return {
        report: this.mapMeetingReportSummary(existingReport),
        job: null
      };
    }

    const result = await this.insertProcessingMeetingReport(executor, recording);
    const job =
      result.inserted && recording.audio_file_key !== null
        ? this.buildMeetingReportJobPayload(result.report, recording)
        : null;

    if (job !== null) {
      await this.insertMeetingReportOutbox(executor, job);
    }

    return {
      report: this.mapMeetingReportSummary(result.report),
      job
    };
  }

  private async findMeetingReportByRecordingId(
    executor: QueryOneExecutor,
    meetingId: string,
    recordingId: string
  ): Promise<MeetingReportRow | null> {
    return executor.queryOne<MeetingReportRow>(
      `
        SELECT
          id,
          meeting_id,
          recording_id,
          status,
          failed_step,
          error_message,
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
        FROM meeting_reports
        WHERE meeting_id = $1
          AND recording_id = $2
        LIMIT 1
      `,
      [meetingId, recordingId]
    );
  }

  private async insertProcessingMeetingReport(
    executor: QueryOneExecutor,
    recording: MeetingReportSourceRecording
  ): Promise<MeetingReportInsertResult> {
    const insertedReport = await executor.queryOne<MeetingReportRow>(
      `
        INSERT INTO meeting_reports (
          meeting_id,
          recording_id,
          status
        )
        VALUES ($1, $2, 'QUEUED')
        ON CONFLICT (recording_id) DO NOTHING
        RETURNING
          id,
          meeting_id,
          recording_id,
          status,
          failed_step,
          error_message,
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
      [recording.meeting_id, recording.id]
    );

    if (insertedReport !== null) {
      return {
        report: insertedReport,
        inserted: true
      };
    }

    const existingReport = await this.findMeetingReportByRecordingId(
      executor,
      recording.meeting_id,
      recording.id
    );
    if (existingReport === null) {
      throw badRequest("Meeting report could not be created");
    }

    return {
      report: existingReport,
      inserted: false
    };
  }

  private buildMeetingReportJobPayload(
    report: MeetingReportRow,
    recording: MeetingReportSourceRecording
  ): MeetingReportJobPayload {
    if (recording.audio_file_key === null) {
      throw badRequest("Meeting report job could not be created");
    }

    return this.buildMeetingReportJobPayloadFromAudioFileKey(
      report,
      recording.audio_file_key
    );
  }

  private async enqueueMeetingReportJob(
    job: MeetingReportJobPayload | null
  ): Promise<void> {
    if (job === null) {
      return;
    }

    await this.meetingReportJobService.enqueueMeetingReportJob(job);
  }

  private async insertMeetingReportOutbox(
    executor: QueryOneExecutor,
    job: MeetingReportJobPayload
  ): Promise<void> {
    const outbox = await executor.queryOne<{ id: string }>(
      `
        INSERT INTO meeting_report_outbox (
          report_id,
          meeting_id,
          recording_id,
          audio_file_key
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (report_id) DO NOTHING
        RETURNING id
      `,
      [job.reportId, job.meetingId, job.recordingId, job.audioFileKey]
    );

    if (outbox === null) {
      const existing = await executor.queryOne<{ id: string }>(
        `
          SELECT id
          FROM meeting_report_outbox
          WHERE report_id = $1
          LIMIT 1
        `,
        [job.reportId]
      );

      if (existing === null) {
        throw badRequest("Meeting report outbox could not be saved");
      }
    }
  }

  async publishOutbox(
    job: MeetingReportJobPayload | null
  ): Promise<void> {
    if (job === null) {
      return;
    }

    try {
      await this.enqueueMeetingReportJob(job);
      const outbox = await this.database.queryOne<{ id: string }>(
        `
          UPDATE meeting_report_outbox
          SET
            status = 'delivered',
            delivered_at = now(),
            error_code = NULL,
            error_message = NULL,
            updated_at = now()
          WHERE report_id = $1
            AND status = 'pending'
          RETURNING id
        `,
        [job.reportId]
      );
      if (outbox !== null) {
        this.logger.log(
          `MeetingReport outbox event=fast_path_delivered outbox_id=${outbox.id} report_id=${job.reportId} meeting_id=${job.meetingId} recording_id=${job.recordingId}`
        );
      }
    } catch {
      // Keep the committed pending intent for MP-05 dispatcher retry.
      this.logger.warn(
        `MeetingReport outbox event=fast_path_pending report_id=${job.reportId} meeting_id=${job.meetingId} recording_id=${job.recordingId} failure_step=none`
      );
    }
  }

  async publishReportEvent(reportId: string | undefined): Promise<void> {
    if (!reportId) return;
    await this.meetingReportRealtimePublisher?.publishReportUpdatedSafely(reportId);
  }

  async listForMeeting(meetingId: string): Promise<MeetingReportSummaryPayload[]> {
    const reports = await this.listMeetingReportRows(meetingId);
    return reports.map((report) => this.mapMeetingReportSummary(report));
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

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toNullableIsoString(value: Date | string | null): string | null {
    return value === null ? null : this.toIsoString(value);
  }
}
