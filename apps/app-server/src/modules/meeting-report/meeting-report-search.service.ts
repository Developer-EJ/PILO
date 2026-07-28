import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/api-error";
import {
  MeetingReportCandidateService,
  type MeetingReportCandidateMatchStrategy,
  type MeetingReportCandidateSearchResult,
  type MeetingReportSearchCandidate
} from "./meeting-report-candidate.service";
import {
  MeetingTranscriptRagService,
  type MeetingEvidenceSource
} from "./meeting-transcript-rag.service";
import type { MeetingReportSearchScope } from "./meeting-report-search-scope";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MAX_CONTENT_SCOPE_REPORTS = 500;

export type { MeetingReportSearchCandidate } from "./meeting-report-candidate.service";

export interface MeetingReportSearchInput {
  scope: MeetingReportSearchScope;
  contentQuery?: string;
  /**
   * Internal server-owned candidate scope. Agent callers use this after a user
   * chooses one of multiple title matches; access is revalidated.
   */
  reportIds?: string[];
}

export type MeetingReportSearchStatus =
  | "resolved"
  | "candidates"
  | "not_found";

export type MeetingReportMatchStrategy =
  | MeetingReportCandidateMatchStrategy
  | "hybrid_content";

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
  fallbackApplied: boolean;
}

interface NormalizedMeetingReportSearchInput {
  scope: MeetingReportSearchScope;
  contentQuery?: string;
  reportIds?: string[];
  limit: number;
}

@Injectable()
export class MeetingReportSearchService {
  constructor(
    private readonly meetingReportCandidateService: MeetingReportCandidateService,
    private readonly meetingTranscriptRagService: MeetingTranscriptRagService
  ) {}

  async search(
    currentUserId: string,
    workspaceId: string,
    input: MeetingReportSearchInput
  ): Promise<MeetingReportSearchResult> {
    const normalized = this.normalizeInput(input);

    if (normalized.reportIds !== undefined) {
      const scoped = await this.meetingReportCandidateService.searchScope(
        currentUserId,
        workspaceId,
        normalized.scope,
        {
          reportIds: normalized.reportIds,
          limit: normalized.limit
        }
      );
      if (scoped.status === "not_found") {
        return this.fromCandidateResult(scoped);
      }
      return normalized.contentQuery
        ? this.searchHybridContent(
            currentUserId,
            workspaceId,
            normalized,
            scoped.reports,
            this.requireCandidateMatch(scoped),
            scoped.diagnostics
          )
        : this.fromCandidateResult(scoped);
    }

    if (normalized.scope.title) {
      const titleResult = await this.meetingReportCandidateService.searchScope(
        currentUserId,
        workspaceId,
        normalized.scope,
        { limit: normalized.limit }
      );
      if (titleResult.status === "candidates") {
        return this.fromCandidateResult(titleResult);
      }
      if (titleResult.status === "resolved") {
        return normalized.contentQuery
          ? this.searchHybridContent(
              currentUserId,
              workspaceId,
              normalized,
              titleResult.reports,
              this.requireCandidateMatch(titleResult),
              titleResult.diagnostics
            )
          : this.fromCandidateResult(titleResult);
      }
      if (!normalized.contentQuery) {
        return this.fromCandidateResult(titleResult);
      }
      if (normalized.scope.fallback !== "workspace_evidence") {
        return this.fromCandidateResult(titleResult);
      }
      return this.searchHybridContent(
        currentUserId,
        workspaceId,
        normalized,
        undefined,
        "hybrid_content",
        titleResult.diagnostics,
        true
      );
    }

    if (normalized.contentQuery) {
      const needsExplicitScope = Boolean(
        normalized.scope.latest ||
          normalized.scope.status ||
          normalized.scope.roomName
      );
      const filterResult = await this.meetingReportCandidateService.searchScope(
        currentUserId,
        workspaceId,
        normalized.scope,
        {
          limit: normalized.scope.latest
            ? 1
            : needsExplicitScope
              ? MAX_CONTENT_SCOPE_REPORTS
              : 1
        }
      );
      if (filterResult.status === "not_found") {
        return this.fromCandidateResult(filterResult);
      }
      return this.searchHybridContent(
        currentUserId,
        workspaceId,
        normalized,
        needsExplicitScope ? filterResult.reports : undefined,
        "hybrid_content",
        filterResult.diagnostics
      );
    }

    return this.fromCandidateResult(
      await this.meetingReportCandidateService.searchScope(
        currentUserId,
        workspaceId,
        normalized.scope,
        { limit: normalized.limit }
      )
    );
  }

  private async searchHybridContent(
    currentUserId: string,
    workspaceId: string,
    input: NormalizedMeetingReportSearchInput,
    scopedReports: MeetingReportSearchCandidate[] | undefined,
    matchedBy: Exclude<MeetingReportMatchStrategy, "none">,
    counts: {
      exactTitleCount?: number;
      fuzzyTitleCount?: number;
    } = {},
    fallbackApplied = false
  ): Promise<MeetingReportSearchResult> {
    const reportIds = scopedReports?.map((report) => report.reportId);
    const evidence = await this.meetingTranscriptRagService.search(
      currentUserId,
      workspaceId,
      {
        query: input.contentQuery ?? "",
        ...(reportIds ? { reportIds } : {}),
        ...(input.scope.from ? { from: input.scope.from } : {}),
        ...(input.scope.to ? { to: input.scope.to } : {})
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
      const reportResult = await this.meetingReportCandidateService.search(
        currentUserId,
        workspaceId,
        {
          reportIds: evidenceReportIds,
          limit: evidenceReportIds.length
        }
      );
      const byId = new Map(
        reportResult.reports.map((report) => [report.reportId, report])
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
      },
      fallbackApplied
    );
  }

  private fromCandidateResult(
    candidateResult: MeetingReportCandidateSearchResult
  ): MeetingReportSearchResult {
    return this.result(
      candidateResult.status,
      candidateResult.matchedBy,
      candidateResult.reports,
      [],
      {
        ...candidateResult.diagnostics,
        hybridReportCount: 0
      },
      false
    );
  }

  private requireCandidateMatch(
    result: MeetingReportCandidateSearchResult
  ): Exclude<MeetingReportCandidateMatchStrategy, "none"> {
    if (result.matchedBy === "none") {
      throw new Error("Resolved Meeting report candidates require a match strategy");
    }
    return result.matchedBy;
  }

  private result(
    status: MeetingReportSearchStatus,
    matchedBy: MeetingReportMatchStrategy,
    reports: MeetingReportSearchCandidate[],
    evidence: MeetingEvidenceSource[],
    diagnostics: MeetingReportSearchResult["diagnostics"],
    fallbackApplied: boolean
  ): MeetingReportSearchResult {
    return {
      status,
      matchedBy,
      reports,
      evidence,
      diagnostics,
      fallbackApplied
    };
  }

  private normalizeInput(
    input: MeetingReportSearchInput
  ): NormalizedMeetingReportSearchInput {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw badRequest("Meeting report search input must be an object");
    }
    if (
      !input.scope ||
      typeof input.scope !== "object" ||
      Array.isArray(input.scope) ||
      input.scope.sort !== "latest" ||
      !["exists", "list", "summary", "evidence"].includes(input.scope.intent) ||
      !["none", "workspace_evidence"].includes(input.scope.fallback) ||
      (input.scope.latest !== undefined && input.scope.latest !== true) ||
      (input.scope.fallback === "workspace_evidence" &&
        input.scope.intent !== "evidence")
    ) {
      throw badRequest("Meeting report search scope is invalid");
    }
    const contentQuery = this.normalizeContentQuery(input.contentQuery);
    if (contentQuery && input.scope.intent !== "evidence") {
      throw badRequest("Meeting evidence query requires evidence intent");
    }
    const limit = input.scope.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw badRequest(`limit must be between 1 and ${MAX_LIMIT}`);
    }
    return {
      scope: input.scope,
      ...(contentQuery ? { contentQuery } : {}),
      ...(input.reportIds === undefined ? {} : { reportIds: input.reportIds }),
      limit
    };
  }

  private normalizeContentQuery(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      throw badRequest("contentQuery must be a string");
    }
    const trimmed = value.trim().replace(/\s+/gu, " ");
    if (!trimmed || Buffer.byteLength(trimmed, "utf8") > 1000) {
      throw badRequest(
        "contentQuery must be a non-empty string within 1000 bytes"
      );
    }
    return trimmed;
  }
}
