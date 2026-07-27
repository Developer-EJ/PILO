import { Injectable } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { badRequest } from "../../common/api-error";
import { DatabaseService } from "../../database/database.service";
import { WorkspaceService } from "../workspace/workspace.service";
import {
  MeetingTranscriptRagService,
  type MeetingEvidenceSource
} from "./meeting-transcript-rag.service";
import type { MeetingReportStatus } from "./meeting-report.types";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MAX_REPORT_IDS = 100;
const MAX_CONTENT_SCOPE_REPORTS = 500;
const FUZZY_TITLE_THRESHOLD = 0.35;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEETING_REPORT_STATUSES = new Set<MeetingReportStatus>([
  "PROCESSING",
  "QUEUED",
  "TRANSCRIBING",
  "SUMMARIZING",
  "COMPLETED",
  "FAILED"
]);

export interface MeetingReportSearchInput {
  title?: string;
  from?: string;
  to?: string;
  contentQuery?: string;
  roomName?: string;
  status?: MeetingReportStatus;
  limit?: number;
  /**
   * Internal server-owned candidate scope. Agent callers use this after a user
   * chooses one of multiple title matches; this service revalidates access.
   */
  reportIds?: string[];
}

export interface MeetingReportSearchCandidate {
  reportId: string;
  meetingId: string;
  recordingId: string;
  status: MeetingReportStatus;
  title: string | null;
  summary: string | null;
  discussionPoints: string | null;
  decisions: string | null;
  meetingStartedAt: string;
  reportCreatedAt: string;
  roomName: string | null;
  titleSimilarity?: number;
}

export type MeetingReportSearchStatus =
  | "resolved"
  | "candidates"
  | "not_found";

export type MeetingReportMatchStrategy =
  | "exact_title"
  | "fuzzy_title"
  | "hybrid_content"
  | "filters_only"
  | "none";

export interface MeetingReportSearchResult {
  status: MeetingReportSearchStatus;
  matchedBy: MeetingReportMatchStrategy;
  reports: MeetingReportSearchCandidate[];
  evidence: MeetingEvidenceSource[];
  diagnostics: {
    exactTitleCount: number;
    fuzzyTitleCount: number;
    hybridReportCount: number;
  };
}

interface NormalizedMeetingReportSearchInput {
  title?: string;
  from?: string;
  to?: string;
  contentQuery?: string;
  roomName?: string;
  status?: MeetingReportStatus;
  limit: number;
  reportIds?: string[];
}

interface MeetingReportSearchRow extends QueryResultRow {
  id: string;
  meeting_id: string;
  recording_id: string;
  status: MeetingReportStatus;
  title: string | null;
  summary: string | null;
  discussion_points: string | null;
  decisions: string | null;
  meeting_started_at: Date | string;
  report_created_at: Date | string;
  room_name: string | null;
  title_similarity: number | string | null;
  total_count: number | string;
}

type ReportQueryMode =
  | { kind: "exact"; title: string }
  | { kind: "fuzzy"; title: string }
  | { kind: "ids"; reportIds: string[] }
  | { kind: "filters" };

@Injectable()
export class MeetingReportSearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly workspaceService: WorkspaceService,
    private readonly meetingTranscriptRagService: MeetingTranscriptRagService
  ) {}

  async search(
    currentUserId: string,
    workspaceId: string,
    input: MeetingReportSearchInput
  ): Promise<MeetingReportSearchResult> {
    const normalized = this.normalizeInput(input);
    await this.workspaceService.assertWorkspaceAccess(
      currentUserId,
      workspaceId
    );

    if (normalized.reportIds !== undefined) {
      if (normalized.reportIds.length === 0) {
        return this.emptyResult();
      }
      const scoped = await this.queryReports(
        currentUserId,
        workspaceId,
        normalized,
        { kind: "ids", reportIds: normalized.reportIds },
        Math.min(normalized.limit, normalized.reportIds.length)
      );
      if (scoped.rows.length === 0) {
        return this.emptyResult();
      }
      if (normalized.contentQuery) {
        return this.searchHybridContent(
          currentUserId,
          workspaceId,
          normalized,
          scoped.rows.map((row) => this.mapCandidate(row)),
          "filters_only"
        );
      }
      return this.reportResult(
        "filters_only",
        scoped.rows,
        scoped.totalCount,
        0,
        0
      );
    }

    let exactTitleCount = 0;
    let fuzzyTitleCount = 0;
    if (normalized.title) {
      const exact = await this.queryReports(
        currentUserId,
        workspaceId,
        normalized,
        { kind: "exact", title: normalized.title },
        normalized.limit
      );
      exactTitleCount = exact.totalCount;
      if (exactTitleCount > 1) {
        return this.reportResult(
          "exact_title",
          exact.rows,
          exactTitleCount,
          exactTitleCount,
          0
        );
      }
      if (exactTitleCount === 1) {
        const reports = exact.rows.map((row) => this.mapCandidate(row));
        return normalized.contentQuery
          ? this.searchHybridContent(
              currentUserId,
              workspaceId,
              normalized,
              reports,
              "exact_title",
              { exactTitleCount }
            )
          : this.result("resolved", "exact_title", reports, [], {
              exactTitleCount,
              fuzzyTitleCount: 0,
              hybridReportCount: 0
            });
      }

      const fuzzy = await this.queryReports(
        currentUserId,
        workspaceId,
        normalized,
        { kind: "fuzzy", title: normalized.title },
        normalized.limit
      );
      fuzzyTitleCount = fuzzy.totalCount;
      if (fuzzyTitleCount > 1) {
        return this.reportResult(
          "fuzzy_title",
          fuzzy.rows,
          fuzzyTitleCount,
          exactTitleCount,
          fuzzyTitleCount
        );
      }
      if (fuzzyTitleCount === 1) {
        const reports = fuzzy.rows.map((row) => this.mapCandidate(row));
        return normalized.contentQuery
          ? this.searchHybridContent(
              currentUserId,
              workspaceId,
              normalized,
              reports,
              "fuzzy_title",
              { exactTitleCount, fuzzyTitleCount }
            )
          : this.result("resolved", "fuzzy_title", reports, [], {
              exactTitleCount,
              fuzzyTitleCount,
              hybridReportCount: 0
            });
      }
    }

    if (normalized.contentQuery) {
      let scopedReports: MeetingReportSearchCandidate[] | undefined;
      if (normalized.status || normalized.roomName) {
        const scope = await this.queryReports(
          currentUserId,
          workspaceId,
          normalized,
          { kind: "filters" },
          MAX_CONTENT_SCOPE_REPORTS
        );
        scopedReports = scope.rows.map((row) => this.mapCandidate(row));
        if (scopedReports.length === 0) {
          return this.result("not_found", "none", [], [], {
            exactTitleCount,
            fuzzyTitleCount,
            hybridReportCount: 0
          });
        }
      }
      return this.searchHybridContent(
        currentUserId,
        workspaceId,
        normalized,
        scopedReports,
        "hybrid_content",
        { exactTitleCount, fuzzyTitleCount }
      );
    }

    if (normalized.title) {
      return this.result("not_found", "none", [], [], {
        exactTitleCount,
        fuzzyTitleCount,
        hybridReportCount: 0
      });
    }

    const filtered = await this.queryReports(
      currentUserId,
      workspaceId,
      normalized,
      { kind: "filters" },
      normalized.limit
    );
    return this.reportResult(
      "filters_only",
      filtered.rows,
      filtered.totalCount,
      0,
      0
    );
  }

  private async searchHybridContent(
    currentUserId: string,
    workspaceId: string,
    input: NormalizedMeetingReportSearchInput,
    scopedReports: MeetingReportSearchCandidate[] | undefined,
    matchedBy: Exclude<MeetingReportMatchStrategy, "none">,
    counts: { exactTitleCount?: number; fuzzyTitleCount?: number } = {}
  ): Promise<MeetingReportSearchResult> {
    const reportIds = scopedReports?.map((report) => report.reportId);
    const evidence = await this.meetingTranscriptRagService.search(
      currentUserId,
      workspaceId,
      {
        query: input.contentQuery ?? "",
        ...(reportIds ? { reportIds } : {}),
        ...(input.from ? { from: input.from } : {}),
        ...(input.to ? { to: input.to } : {})
      }
    );
    const evidenceReportIds = [
      ...new Set(evidence.map((source) => source.reportId))
    ];
    const hasResolvedTitle =
      matchedBy === "exact_title" || matchedBy === "fuzzy_title";
    let reports: MeetingReportSearchCandidate[] = [];
    if (scopedReports) {
      const byId = new Map(
        scopedReports.map((report) => [report.reportId, report])
      );
      reports = evidenceReportIds.flatMap((reportId) => {
        const report = byId.get(reportId);
        return report ? [report] : [];
      });
      if (reports.length === 0 && hasResolvedTitle) {
        reports = scopedReports;
      }
    } else if (evidenceReportIds.length > 0) {
      const reportRows = await this.queryReports(
        currentUserId,
        workspaceId,
        input,
        { kind: "ids", reportIds: evidenceReportIds },
        evidenceReportIds.length
      );
      const byId = new Map(
        reportRows.rows.map((row) => [row.id, this.mapCandidate(row)])
      );
      reports = evidenceReportIds.flatMap((reportId) => {
        const report = byId.get(reportId);
        return report ? [report] : [];
      });
    }
    const hybridReportCount = evidenceReportIds.length;
    return this.result(
      evidence.length > 0 || hasResolvedTitle ? "resolved" : "not_found",
      evidence.length > 0 ? matchedBy : hasResolvedTitle ? matchedBy : "none",
      reports,
      evidence,
      {
        exactTitleCount: counts.exactTitleCount ?? 0,
        fuzzyTitleCount: counts.fuzzyTitleCount ?? 0,
        hybridReportCount
      }
    );
  }

  private async queryReports(
    currentUserId: string,
    workspaceId: string,
    input: NormalizedMeetingReportSearchInput,
    mode: ReportQueryMode,
    limit: number
  ): Promise<{ rows: MeetingReportSearchRow[]; totalCount: number }> {
    const values: unknown[] = [
      workspaceId,
      currentUserId,
      input.status ?? null,
      input.from ?? null,
      input.to ?? null,
      input.roomName ?? null
    ];
    let modeCondition = "";
    let similarityExpression = "NULL::double precision";
    let orderBy =
      "meeting.started_at DESC, report.created_at DESC, report.id ASC";

    if (mode.kind === "exact") {
      modeCondition = `AND report.normalized_title <> ''
        AND report.normalized_title = $${values.push(mode.title)}::text`;
    } else if (mode.kind === "fuzzy") {
      const titleParameter = `$${values.push(mode.title)}`;
      const thresholdParameter = `$${values.push(FUZZY_TITLE_THRESHOLD)}`;
      similarityExpression =
        `extensions.similarity(report.normalized_title, ${titleParameter}::text)`;
      modeCondition = `AND report.normalized_title <> ''
        AND report.normalized_title OPERATOR(extensions.%) ${titleParameter}::text
        AND extensions.similarity(report.normalized_title, ${titleParameter}::text) >= ${thresholdParameter}::double precision`;
      orderBy =
        "title_similarity DESC, meeting.started_at DESC, report.created_at DESC, report.id ASC";
    } else if (mode.kind === "ids") {
      modeCondition =
        `AND report.id = ANY($${values.push(mode.reportIds)}::uuid[])`;
    }
    const limitParameter = `$${values.push(limit)}`;
    const rows = await this.database.query<MeetingReportSearchRow>(
      `
        SELECT
          report.id,
          report.meeting_id,
          report.recording_id,
          report.status,
          COALESCE(report.user_title, report.title) AS title,
          report.summary,
          COALESCE(report.user_discussion_points, report.discussion_points)
            AS discussion_points,
          COALESCE(decision_content.decisions, report.decisions) AS decisions,
          meeting.started_at AS meeting_started_at,
          report.created_at AS report_created_at,
          room.name AS room_name,
          ${similarityExpression} AS title_similarity,
          COUNT(*) OVER() AS total_count
        FROM meeting_reports report
        JOIN meetings meeting ON meeting.id = report.meeting_id
        LEFT JOIN meeting_rooms room
          ON room.workspace_id = meeting.workspace_id
          AND room.room_key = meeting.room_key
        LEFT JOIN LATERAL (
          SELECT string_agg(
            COALESCE(item.user_text, item.text),
            E'\\n'
            ORDER BY item.source_index
          ) AS decisions
          FROM meeting_report_decision_items item
          WHERE item.meeting_report_id = report.id
        ) decision_content ON true
        WHERE meeting.workspace_id = $1::uuid
          AND ($3::text IS NULL OR report.status::text = $3::text)
          AND ($4::timestamptz IS NULL OR meeting.started_at >= $4::timestamptz)
          AND ($5::timestamptz IS NULL OR meeting.started_at < $5::timestamptz)
          AND (
            $6::text IS NULL
            OR lower(regexp_replace(btrim(room.name), '\\s+', ' ', 'g')) = $6::text
          )
          AND (
            EXISTS (
              SELECT 1
              FROM workspace_members member
              WHERE member.workspace_id = meeting.workspace_id
                AND member.user_id = $2::uuid
                AND member.role = 'owner'
            )
            OR EXISTS (
              SELECT 1
              FROM meeting_participants participant
              WHERE participant.meeting_id = meeting.id
                AND participant.user_id = $2::uuid
            )
          )
          ${modeCondition}
        ORDER BY ${orderBy}
        LIMIT ${limitParameter}
      `,
      values
    );
    return {
      rows,
      totalCount: rows.length === 0 ? 0 : Number(rows[0].total_count)
    };
  }

  private reportResult(
    matchedBy: Exclude<MeetingReportMatchStrategy, "none">,
    rows: MeetingReportSearchRow[],
    totalCount: number,
    exactTitleCount: number,
    fuzzyTitleCount: number
  ): MeetingReportSearchResult {
    if (totalCount === 0) {
      return this.result("not_found", "none", [], [], {
        exactTitleCount,
        fuzzyTitleCount,
        hybridReportCount: 0
      });
    }
    return this.result(
      totalCount === 1 ? "resolved" : "candidates",
      matchedBy,
      rows.map((row) => this.mapCandidate(row)),
      [],
      {
        exactTitleCount,
        fuzzyTitleCount,
        hybridReportCount: 0
      }
    );
  }

  private result(
    status: MeetingReportSearchStatus,
    matchedBy: MeetingReportMatchStrategy,
    reports: MeetingReportSearchCandidate[],
    evidence: MeetingEvidenceSource[],
    diagnostics: MeetingReportSearchResult["diagnostics"]
  ): MeetingReportSearchResult {
    return { status, matchedBy, reports, evidence, diagnostics };
  }

  private emptyResult(): MeetingReportSearchResult {
    return this.result("not_found", "none", [], [], {
      exactTitleCount: 0,
      fuzzyTitleCount: 0,
      hybridReportCount: 0
    });
  }

  private mapCandidate(
    row: MeetingReportSearchRow
  ): MeetingReportSearchCandidate {
    const similarity =
      row.title_similarity === null ? undefined : Number(row.title_similarity);
    return {
      reportId: row.id,
      meetingId: row.meeting_id,
      recordingId: row.recording_id,
      status: row.status,
      title: row.title,
      summary: row.summary,
      discussionPoints: row.discussion_points,
      decisions: row.decisions,
      meetingStartedAt: this.toIso(row.meeting_started_at),
      reportCreatedAt: this.toIso(row.report_created_at),
      roomName: row.room_name,
      ...(similarity === undefined ? {} : { titleSimilarity: similarity })
    };
  }

  private normalizeInput(
    input: MeetingReportSearchInput
  ): NormalizedMeetingReportSearchInput {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw badRequest("Meeting report search input must be an object");
    }
    const title = this.normalizeText(input.title, "title", 500, true);
    const contentQuery = this.normalizeText(
      input.contentQuery,
      "contentQuery",
      1000,
      false
    );
    const roomName = this.normalizeText(input.roomName, "roomName", 100, true);
    const from = this.normalizeDate(input.from, "from");
    const to = this.normalizeDate(input.to, "to");
    if (from && to && Date.parse(from) >= Date.parse(to)) {
      throw badRequest("from must be before to");
    }
    if (
      input.status !== undefined &&
      !MEETING_REPORT_STATUSES.has(input.status)
    ) {
      throw badRequest("Invalid Meeting report status");
    }
    const limit = input.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw badRequest(`limit must be between 1 and ${MAX_LIMIT}`);
    }
    let reportIds: string[] | undefined;
    if (input.reportIds !== undefined) {
      if (
        !Array.isArray(input.reportIds) ||
        input.reportIds.length > MAX_REPORT_IDS ||
        input.reportIds.some(
          (reportId) =>
            typeof reportId !== "string" || !UUID_PATTERN.test(reportId)
        )
      ) {
        throw badRequest("reportIds must contain valid MeetingReport UUIDs");
      }
      reportIds = [...new Set(input.reportIds)];
    }
    if (title && reportIds !== undefined) {
      throw badRequest("title and reportIds may not be combined");
    }
    return {
      ...(title ? { title } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(contentQuery ? { contentQuery } : {}),
      ...(roomName ? { roomName } : {}),
      ...(input.status ? { status: input.status } : {}),
      limit,
      ...(reportIds === undefined ? {} : { reportIds })
    };
  }

  private normalizeText(
    value: string | undefined,
    field: string,
    maxBytes: number,
    normalizeCase: boolean
  ): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      throw badRequest(`${field} must be a string`);
    }
    const trimmed = value.trim().replace(/\s+/gu, " ");
    if (!trimmed || Buffer.byteLength(trimmed, "utf8") > maxBytes) {
      throw badRequest(`${field} must be a non-empty string within ${maxBytes} bytes`);
    }
    return normalizeCase ? trimmed.toLocaleLowerCase("ko-KR") : trimmed;
  }

  private normalizeDate(
    value: string | undefined,
    field: "from" | "to"
  ): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
      throw badRequest(`${field} must be an ISO 8601 date-time`);
    }
    return value;
  }

  private toIso(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }
}
