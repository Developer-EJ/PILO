import { Injectable } from "@nestjs/common";
import { QueryResultRow } from "pg";
import { badRequest } from "../../common/api-error";
import { DatabaseService } from "../../database/database.service";
import { WorkspaceService } from "../workspace/workspace.service";
import type { MeetingReportSearchScope } from "./meeting-report-search-scope";
import type { MeetingReportStatus } from "./meeting-report.types";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 500;
const MAX_REPORT_IDS = 500;
const FUZZY_TITLE_CANDIDATE_THRESHOLD = 0.35;
const FUZZY_TITLE_AUTO_RESOLVE_THRESHOLD = 0.7;
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

export interface MeetingReportCandidateSearchInput {
  title?: string;
  from?: string;
  to?: string;
  roomName?: string;
  status?: MeetingReportStatus;
  limit?: number;
  /**
   * Internal server-owned scope. Every id is revalidated against Workspace and
   * Meeting participation before it is returned.
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

export type MeetingReportCandidateSearchStatus =
  | "resolved"
  | "candidates"
  | "not_found";

export type MeetingReportCandidateMatchStrategy =
  | "exact_title"
  | "fuzzy_title"
  | "filters_only"
  | "none";

export interface MeetingReportCandidateSearchResult {
  status: MeetingReportCandidateSearchStatus;
  matchedBy: MeetingReportCandidateMatchStrategy;
  reports: MeetingReportSearchCandidate[];
  totalCount: number;
  diagnostics: {
    exactTitleCount: number;
    fuzzyTitleCount: number;
  };
}

interface NormalizedMeetingReportCandidateSearchInput {
  title?: string;
  from?: string;
  to?: string;
  roomName?: string;
  status?: MeetingReportStatus;
  limit: number;
  reportIds?: string[];
}

interface MeetingReportCandidateRow extends QueryResultRow {
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
  whole_title_similarity?: number | string | null;
  total_count: number | string;
}

type CandidateQueryMode =
  | { kind: "exact"; title: string }
  | { kind: "fuzzy"; title: string }
  | { kind: "ids"; reportIds: string[] }
  | { kind: "filters" };

@Injectable()
export class MeetingReportCandidateService {
  constructor(
    private readonly database: DatabaseService,
    private readonly workspaceService: WorkspaceService
  ) {}

  async searchScope(
    currentUserId: string,
    workspaceId: string,
    scope: MeetingReportSearchScope,
    overrides: {
      reportIds?: string[];
      limit?: number;
    } = {}
  ): Promise<MeetingReportCandidateSearchResult> {
    const latestFilteredReport = scope.latest === true && !scope.title;
    return this.search(currentUserId, workspaceId, {
      ...(scope.title && overrides.reportIds === undefined
        ? { title: scope.title }
        : {}),
      ...(scope.from ? { from: scope.from } : {}),
      ...(scope.to ? { to: scope.to } : {}),
      ...(scope.status ? { status: scope.status } : {}),
      ...(scope.roomName ? { roomName: scope.roomName } : {}),
      ...(overrides.reportIds === undefined
        ? {}
        : { reportIds: overrides.reportIds }),
      limit:
        overrides.limit ??
        (latestFilteredReport ? 1 : scope.limit ?? DEFAULT_LIMIT)
    });
  }

  async search(
    currentUserId: string,
    workspaceId: string,
    input: MeetingReportCandidateSearchInput
  ): Promise<MeetingReportCandidateSearchResult> {
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
      return this.reportResult("filters_only", scoped.rows, scoped.totalCount, {
        exactTitleCount: 0,
        fuzzyTitleCount: 0
      });
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
      if (exactTitleCount > 0) {
        return this.reportResult(
          "exact_title",
          exact.rows,
          exactTitleCount,
          { exactTitleCount, fuzzyTitleCount }
        );
      }

      const fuzzy = await this.queryReports(
        currentUserId,
        workspaceId,
        normalized,
        { kind: "fuzzy", title: normalized.title },
        normalized.limit
      );
      fuzzyTitleCount = fuzzy.totalCount;
      if (fuzzyTitleCount === 0) {
        return this.result("not_found", "none", [], 0, {
          exactTitleCount,
          fuzzyTitleCount
        });
      }
      if (
        fuzzyTitleCount === 1 &&
        !this.isConfidentSingleFuzzyMatch(fuzzy.rows)
      ) {
        return this.result(
          "candidates",
          "fuzzy_title",
          fuzzy.rows.map((row) => this.mapCandidate(row)),
          fuzzyTitleCount,
          { exactTitleCount, fuzzyTitleCount }
        );
      }
      return this.reportResult(
        "fuzzy_title",
        fuzzy.rows,
        fuzzyTitleCount,
        { exactTitleCount, fuzzyTitleCount }
      );
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
      { exactTitleCount, fuzzyTitleCount }
    );
  }

  private async queryReports(
    currentUserId: string,
    workspaceId: string,
    input: NormalizedMeetingReportCandidateSearchInput,
    mode: CandidateQueryMode,
    limit: number
  ): Promise<{ rows: MeetingReportCandidateRow[]; totalCount: number }> {
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
    let wholeSimilarityExpression = "NULL::double precision";
    let orderBy =
      "meeting.started_at DESC, report.created_at DESC, report.id ASC";

    if (mode.kind === "exact") {
      modeCondition = `AND report.normalized_title <> ''
        AND report.normalized_title = $${values.push(mode.title)}::text`;
    } else if (mode.kind === "fuzzy") {
      const titleParameter = `$${values.push(mode.title)}`;
      const thresholdParameter =
        `$${values.push(FUZZY_TITLE_CANDIDATE_THRESHOLD)}`;
      wholeSimilarityExpression =
        `extensions.similarity(report.normalized_title, ${titleParameter}::text)`;
      similarityExpression = `GREATEST(
        ${wholeSimilarityExpression},
        extensions.word_similarity(${titleParameter}::text, report.normalized_title)
      )`;
      modeCondition = `AND report.normalized_title <> ''
        AND (
          report.normalized_title OPERATOR(extensions.%) ${titleParameter}::text
          OR ${titleParameter}::text OPERATOR(extensions.<%) report.normalized_title
          OR report.normalized_title LIKE ${titleParameter}::text || '%'
        )
        AND ${similarityExpression} >= ${thresholdParameter}::double precision`;
      orderBy =
        "title_similarity DESC, meeting.started_at DESC, report.created_at DESC, report.id ASC";
    } else if (mode.kind === "ids") {
      modeCondition =
        `AND report.id = ANY($${values.push(mode.reportIds)}::uuid[])`;
    }
    const limitParameter = `$${values.push(limit)}`;
    const rows = await this.database.query<MeetingReportCandidateRow>(
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
          ${wholeSimilarityExpression} AS whole_title_similarity,
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

  private isConfidentSingleFuzzyMatch(
    rows: MeetingReportCandidateRow[]
  ): boolean {
    if (rows.length !== 1) {
      return false;
    }
    const similarity = Number(
      rows[0].whole_title_similarity ?? rows[0].title_similarity
    );
    return (
      Number.isFinite(similarity) &&
      similarity >= FUZZY_TITLE_AUTO_RESOLVE_THRESHOLD
    );
  }

  private reportResult(
    matchedBy: Exclude<MeetingReportCandidateMatchStrategy, "none">,
    rows: MeetingReportCandidateRow[],
    totalCount: number,
    diagnostics: MeetingReportCandidateSearchResult["diagnostics"]
  ): MeetingReportCandidateSearchResult {
    if (totalCount === 0) {
      return this.result("not_found", "none", [], 0, diagnostics);
    }
    return this.result(
      totalCount === 1 ? "resolved" : "candidates",
      matchedBy,
      rows.map((row) => this.mapCandidate(row)),
      totalCount,
      diagnostics
    );
  }

  private result(
    status: MeetingReportCandidateSearchStatus,
    matchedBy: MeetingReportCandidateMatchStrategy,
    reports: MeetingReportSearchCandidate[],
    totalCount: number,
    diagnostics: MeetingReportCandidateSearchResult["diagnostics"]
  ): MeetingReportCandidateSearchResult {
    return { status, matchedBy, reports, totalCount, diagnostics };
  }

  private emptyResult(): MeetingReportCandidateSearchResult {
    return this.result("not_found", "none", [], 0, {
      exactTitleCount: 0,
      fuzzyTitleCount: 0
    });
  }

  private mapCandidate(
    row: MeetingReportCandidateRow
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
    input: MeetingReportCandidateSearchInput
  ): NormalizedMeetingReportCandidateSearchInput {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw badRequest("Meeting report candidate search input must be an object");
    }
    const title = this.normalizeText(input.title, "title", 500, true);
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
      throw badRequest(
        `${field} must be a non-empty string within ${maxBytes} bytes`
      );
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
