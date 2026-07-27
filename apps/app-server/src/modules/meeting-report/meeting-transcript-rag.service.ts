import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/api-error";
import { DatabaseService } from "../../database/database.service";
import { embedGroundingQuery } from "../agent/grounding/query-embedding";
import {
  meetingRagMinimumSimilarity,
  passesRelevanceThreshold
} from "../agent/grounding/relevance-policy";
import { WorkspaceService } from "../workspace/workspace.service";

const MAX_RESULTS = 5;
const MAX_CANDIDATE_RESULTS = 20;
const MAX_REPORT_SCOPE = 500;
const MAX_LEXICAL_TERMS = 8;
const DIRECT_REFERENCE_DISTANCE_BOOST = 0.08;
const SEMANTIC_DUPLICATE_DISTANCE = 0.12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEXICAL_STOP_WORDS = new Set([
  "관련",
  "관한",
  "관해",
  "대해",
  "논의",
  "언급",
  "발언",
  "이야기",
  "얘기",
  "있었던",
  "했던",
  "나왔던",
  "회의",
  "회의록",
  "미팅",
  "내용",
  "요약",
  "결정",
  "사항",
  "찾아줘",
  "알려줘",
  "보여줘",
  "해주세요",
  "해줘",
  "누가",
  "무엇",
  "뭐야",
  "어떻게",
  "왜",
  "the",
  "and",
  "for"
]);

export interface MeetingTranscriptSearchInput {
  query: string;
  /** @deprecated Use reportIds for new callers. */
  reportId?: string;
  reportIds?: string[];
  /** Meeting occurrence range. These filters use meetings.started_at. */
  from?: string;
  to?: string;
}
export type MeetingEvidenceSourceType = "transcript" | "activity";
export interface MeetingEvidenceSource {
  sourceId: string;
  sourceType: MeetingEvidenceSourceType;
  reportId: string;
  content: string;
  startedAtMs?: number;
  endedAtMs?: number;
  occurredAt?: string;
  action?: string;
  summary?: string;
  directlyReferenced: boolean;
  /** Internal retrieval diagnostic. Never expose this value in a public tool summary. */
  score?: number;
}
export type MeetingTranscriptSource = MeetingEvidenceSource;

type CandidateSource = MeetingEvidenceSource & {
  distance: number;
  lexicalMatch: boolean;
};

@Injectable()
export class MeetingTranscriptRagService {
  constructor(private readonly database: DatabaseService, private readonly workspaceService: WorkspaceService) {}

  async search(currentUserId: string, workspaceId: string, input: MeetingTranscriptSearchInput): Promise<MeetingEvidenceSource[]> {
    await this.workspaceService.assertWorkspaceAccess(currentUserId, workspaceId);
    const query = input.query.trim();
    const hasExplicitReportScope =
      input.reportId !== undefined || input.reportIds !== undefined;
    const reportIds = [
      ...new Set([
        ...(input.reportId ? [input.reportId] : []),
        ...(input.reportIds ?? [])
      ])
    ];
    const from = this.normalizeDate(input.from, "from");
    const to = this.normalizeDate(input.to, "to");
    if (
      !query ||
      query.length > 1000 ||
      reportIds.length > MAX_REPORT_SCOPE ||
      reportIds.some((reportId) => !UUID.test(reportId)) ||
      (from && to && Date.parse(from) >= Date.parse(to))
    ) {
      throw badRequest("Invalid Meeting evidence search input");
    }
    if (hasExplicitReportScope && reportIds.length === 0) return [];
    const embedding = await embedGroundingQuery(query);
    const vector = `[${embedding.join(",")}]`;
    const minimumSimilarity = meetingRagMinimumSimilarity();
    const lexicalTerms = this.extractLexicalTerms(query);
    const [transcriptRows, activityRows] = await Promise.all([
      this.database.query<{ id: string; meeting_report_id: string; started_at_ms: number; ended_at_ms: number; content: string; distance: number; lexical_match: boolean }>(`
        WITH candidates AS (
          SELECT
            chunk.id,
            chunk.meeting_report_id,
            chunk.started_at_ms,
            chunk.ended_at_ms,
            chunk.content,
            chunk.embedding OPERATOR(extensions.<=>) $4::extensions.vector
              AS distance,
            EXISTS (
              SELECT 1
              FROM unnest($7::text[]) lexical_term
              WHERE lower(chunk.content) LIKE '%' || lexical_term || '%'
            ) AS lexical_match
          FROM meeting_report_transcript_chunks chunk
          JOIN meeting_reports report ON report.id = chunk.meeting_report_id
          JOIN meetings meeting ON meeting.id = report.meeting_id
          WHERE ${this.authorizedReportWhere("chunk.embedding IS NOT NULL")}
            AND ${this.latestCompletedTranscriptIndexWhere()}
            AND (
              1 - (chunk.embedding OPERATOR(extensions.<=>) $4::extensions.vector) >= $6
              OR EXISTS (
                SELECT 1
                FROM unnest($7::text[]) lexical_term
                WHERE lower(chunk.content) LIKE '%' || lexical_term || '%'
              )
            )
        ),
        ranked AS (
          SELECT
            candidates.*,
            ROW_NUMBER() OVER (
              PARTITION BY candidates.meeting_report_id
              ORDER BY candidates.lexical_match DESC, candidates.distance,
                candidates.id
            ) AS report_rank
          FROM candidates
        )
        SELECT
          id,
          meeting_report_id,
          started_at_ms,
          ended_at_ms,
          content,
          distance,
          lexical_match
        FROM ranked
        WHERE report_rank <= 3
        ORDER BY lexical_match DESC, distance, id
        LIMIT $5
      `, [workspaceId, reportIds.length === 0 ? null : reportIds, currentUserId, vector, MAX_CANDIDATE_RESULTS, minimumSimilarity, lexicalTerms, from ?? null, to ?? null]),
      this.database.query<{ id: string; meeting_report_id: string; occurred_at: Date | string; action: string; summary: string; content: string; distance: number; directly_referenced: boolean; lexical_match: boolean }>(`
        WITH candidates AS (
          SELECT
            chunk.id,
            chunk.meeting_report_id,
            chunk.occurred_at,
            chunk.action,
            chunk.summary,
            chunk.content,
            chunk.embedding OPERATOR(extensions.<=>) $4::extensions.vector
              AS distance,
            EXISTS (
              SELECT 1
              FROM unnest($7::text[]) lexical_term
              WHERE lower(chunk.content) LIKE '%' || lexical_term || '%'
            ) AS lexical_match,
            EXISTS (
              SELECT 1
              FROM meeting_report_activity_evidence_references reference
              WHERE reference.meeting_report_id = chunk.meeting_report_id
                AND reference.activity_evidence_id = chunk.activity_evidence_id
                AND reference.source_type IN ('decision', 'action_item')
            ) AS directly_referenced
          FROM meeting_report_activity_evidence_chunks chunk
          JOIN meeting_reports report ON report.id = chunk.meeting_report_id
          JOIN meetings meeting ON meeting.id = report.meeting_id
          WHERE ${this.authorizedReportWhere("chunk.embedding IS NOT NULL")}
            AND ${this.latestCompletedActivityIndexWhere()}
            AND (
              1 - (chunk.embedding OPERATOR(extensions.<=>) $4::extensions.vector) >= $6
              OR EXISTS (
                SELECT 1
                FROM unnest($7::text[]) lexical_term
                WHERE lower(chunk.content) LIKE '%' || lexical_term || '%'
              )
            )
        ),
        ranked AS (
          SELECT
            candidates.*,
            ROW_NUMBER() OVER (
              PARTITION BY candidates.meeting_report_id
              ORDER BY candidates.lexical_match DESC, candidates.distance,
                candidates.id
            ) AS report_rank
          FROM candidates
        )
        SELECT
          id,
          meeting_report_id,
          occurred_at,
          action,
          summary,
          content,
          distance,
          directly_referenced,
          lexical_match
        FROM ranked
        WHERE report_rank <= 3
        ORDER BY lexical_match DESC, distance, id
        LIMIT $5
      `, [workspaceId, reportIds.length === 0 ? null : reportIds, currentUserId, vector, MAX_CANDIDATE_RESULTS, minimumSimilarity, lexicalTerms, from ?? null, to ?? null])
    ]);
    const candidates: CandidateSource[] = [
      ...transcriptRows.map((row) => ({ sourceId: `transcript:${row.id}`, sourceType: "transcript" as const, reportId: row.meeting_report_id, startedAtMs: Number(row.started_at_ms), endedAtMs: Number(row.ended_at_ms), content: row.content.slice(0, 600), directlyReferenced: false, distance: Number(row.distance), lexicalMatch: Boolean(row.lexical_match) })),
      ...activityRows.map((row) => ({ sourceId: `activity:${row.id}`, sourceType: "activity" as const, reportId: row.meeting_report_id, occurredAt: this.toIso(row.occurred_at), action: row.action, summary: row.summary.slice(0, 500), content: row.content.slice(0, 600), directlyReferenced: Boolean(row.directly_referenced), distance: Number(row.distance), lexicalMatch: Boolean(row.lexical_match) }))
    ].filter((candidate) =>
      candidate.lexicalMatch ||
      passesRelevanceThreshold(1 - candidate.distance, minimumSimilarity)
    );
    const duplicatePairs = await this.findSemanticDuplicatePairs(
      candidates.filter((candidate) => candidate.sourceType === "transcript").map((candidate) => candidate.sourceId.slice("transcript:".length)),
      candidates.filter((candidate) => candidate.sourceType === "activity").map((candidate) => candidate.sourceId.slice("activity:".length))
    );
    return this.selectSources(candidates, duplicatePairs);
  }

  async loadAuthorizedSources(currentUserId: string, workspaceId: string, sourceIds: string[]): Promise<MeetingEvidenceSource[]> {
    if (sourceIds.length === 0) return [];
    await this.workspaceService.assertWorkspaceAccess(currentUserId, workspaceId);
    const parsed = sourceIds.flatMap((sourceId) => this.parseSourceId(sourceId));
    const transcriptIds = parsed.filter((source) => source.type === "transcript").map((source) => source.id);
    const activityIds = parsed.filter((source) => source.type === "activity").map((source) => source.id);
    const [transcriptRows, activityRows] = await Promise.all([
      transcriptIds.length === 0 ? Promise.resolve([]) : this.database.query<{ id: string; meeting_report_id: string; started_at_ms: number; ended_at_ms: number; content: string }>(`
        SELECT chunk.id, chunk.meeting_report_id, chunk.started_at_ms, chunk.ended_at_ms, chunk.content
        FROM meeting_report_transcript_chunks chunk
        JOIN meeting_reports report ON report.id = chunk.meeting_report_id
        JOIN meetings meeting ON meeting.id = report.meeting_id
        WHERE chunk.id = ANY($4::uuid[]) AND ${this.authorizedReportWhere("true", false)}
          AND ${this.latestCompletedTranscriptIndexWhere()}
      `, [workspaceId, null, currentUserId, transcriptIds]),
      activityIds.length === 0 ? Promise.resolve([]) : this.database.query<{ id: string; meeting_report_id: string; occurred_at: Date | string; action: string; summary: string; content: string; directly_referenced: boolean }>(`
        SELECT chunk.id, chunk.meeting_report_id, chunk.occurred_at, chunk.action, chunk.summary, chunk.content,
          EXISTS (
            SELECT 1 FROM meeting_report_activity_evidence_references reference
            WHERE reference.meeting_report_id = chunk.meeting_report_id
              AND reference.activity_evidence_id = chunk.activity_evidence_id
              AND reference.source_type IN ('decision', 'action_item')
          ) AS directly_referenced
        FROM meeting_report_activity_evidence_chunks chunk
        JOIN meeting_reports report ON report.id = chunk.meeting_report_id
        JOIN meetings meeting ON meeting.id = report.meeting_id
        WHERE chunk.id = ANY($4::uuid[]) AND ${this.authorizedReportWhere("true", false)}
          AND ${this.latestCompletedActivityIndexWhere()}
      `, [workspaceId, null, currentUserId, activityIds])
    ]);
    const bySourceId = new Map<string, MeetingEvidenceSource>();
    for (const row of transcriptRows) {
      bySourceId.set(`transcript:${row.id}`, { sourceId: `transcript:${row.id}`, sourceType: "transcript", reportId: row.meeting_report_id, startedAtMs: Number(row.started_at_ms), endedAtMs: Number(row.ended_at_ms), content: row.content.slice(0, 600), directlyReferenced: false });
    }
    for (const row of activityRows) {
      bySourceId.set(`activity:${row.id}`, { sourceId: `activity:${row.id}`, sourceType: "activity", reportId: row.meeting_report_id, occurredAt: this.toIso(row.occurred_at), action: row.action, summary: row.summary.slice(0, 500), content: row.content.slice(0, 600), directlyReferenced: Boolean(row.directly_referenced) });
    }
    return sourceIds.flatMap((sourceId) => {
      const normalized = this.normalizeSourceId(sourceId);
      const source = normalized ? bySourceId.get(normalized) : undefined;
      return source ? [source] : [];
    });
  }

  normalizeSourceIds(sourceIds: string[]): string[] {
    return [...new Set(sourceIds.flatMap((sourceId) => {
      const normalized = this.normalizeSourceId(sourceId);
      return normalized ? [normalized] : [];
    }))];
  }

  private authorizedReportWhere(
    indexedCondition: string,
    includeMeetingDateRange = true
  ): string {
    return `meeting.workspace_id = $1::uuid
      AND ($2::uuid[] IS NULL OR report.id = ANY($2::uuid[]))
      ${includeMeetingDateRange
        ? `AND ($8::timestamptz IS NULL OR meeting.started_at >= $8::timestamptz)
      AND ($9::timestamptz IS NULL OR meeting.started_at < $9::timestamptz)`
        : ""}
      AND ${indexedCondition}
      AND (
        EXISTS (SELECT 1 FROM workspace_members member WHERE member.workspace_id = meeting.workspace_id AND member.user_id = $3::uuid AND member.role = 'owner')
        OR EXISTS (SELECT 1 FROM meeting_participants participant WHERE participant.meeting_id = meeting.id AND participant.user_id = $3::uuid)
      )`;
  }

  private latestCompletedTranscriptIndexWhere(): string {
    return `chunk.transcript_hash = (
      SELECT job.transcript_hash
      FROM meeting_report_transcript_embedding_jobs job
      WHERE job.meeting_report_id = chunk.meeting_report_id
        AND job.status = 'completed'
      ORDER BY job.completed_at DESC NULLS LAST, job.created_at DESC, job.id DESC
      LIMIT 1
    )`;
  }

  private latestCompletedActivityIndexWhere(): string {
    return `chunk.evidence_hash = (
      SELECT job.evidence_hash
      FROM meeting_report_activity_evidence_embedding_jobs job
      WHERE job.meeting_report_id = chunk.meeting_report_id
        AND job.status = 'completed'
      ORDER BY job.completed_at DESC NULLS LAST, job.created_at DESC, job.id DESC
      LIMIT 1
    )`;
  }

  private parseSourceId(sourceId: string): Array<{ type: MeetingEvidenceSourceType; id: string }> {
    const normalized = this.normalizeSourceId(sourceId);
    if (!normalized) return [];
    const [type, id] = normalized.split(":", 2) as [MeetingEvidenceSourceType, string];
    return [{ type, id }];
  }

  private normalizeSourceId(sourceId: string): string | null {
    if (UUID.test(sourceId)) return `transcript:${sourceId}`;
    const match = /^(transcript|activity):([0-9a-f-]+)$/i.exec(sourceId);
    if (!match || !UUID.test(match[2])) return null;
    return `${match[1].toLowerCase()}:${match[2]}`;
  }

  private toIso(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }

  private async findSemanticDuplicatePairs(transcriptIds: string[], activityIds: string[]): Promise<Array<{ transcriptId: string; activityId: string }>> {
    if (transcriptIds.length === 0 || activityIds.length === 0) return [];
    const rows = await this.database.query<{ transcript_id: string; activity_id: string }>(`
      SELECT transcript.id AS transcript_id, activity.id AS activity_id
      FROM meeting_report_transcript_chunks transcript
      JOIN meeting_report_activity_evidence_chunks activity
        ON activity.meeting_report_id = transcript.meeting_report_id
      WHERE transcript.id = ANY($1::uuid[])
        AND activity.id = ANY($2::uuid[])
        AND transcript.embedding IS NOT NULL
        AND activity.embedding IS NOT NULL
        AND transcript.embedding OPERATOR(extensions.<=>) activity.embedding <= $3
    `, [transcriptIds, activityIds, SEMANTIC_DUPLICATE_DISTANCE]);
    return rows.map((row) => ({ transcriptId: row.transcript_id, activityId: row.activity_id }));
  }

  private selectSources(candidates: CandidateSource[], duplicatePairs: Array<{ transcriptId: string; activityId: string }>): MeetingEvidenceSource[] {
    const parent = new Map(candidates.map((candidate) => [candidate.sourceId, candidate.sourceId]));
    const find = (sourceId: string): string => {
      const root = parent.get(sourceId);
      if (!root || root === sourceId) return sourceId;
      const resolved = find(root);
      parent.set(sourceId, resolved);
      return resolved;
    };
    const union = (left: string, right: string) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    };
    for (const pair of duplicatePairs) {
      const transcriptSourceId = `transcript:${pair.transcriptId}`;
      const activitySourceId = `activity:${pair.activityId}`;
      if (parent.has(transcriptSourceId) && parent.has(activitySourceId)) union(transcriptSourceId, activitySourceId);
    }

    const groups = new Map<string, CandidateSource[]>();
    for (const candidate of candidates) {
      const group = groups.get(find(candidate.sourceId)) ?? [];
      group.push(candidate);
      groups.set(find(candidate.sourceId), group);
    }
    const compare = (left: CandidateSource, right: CandidateSource) => {
      const lexicalDifference =
        Number(right.lexicalMatch) - Number(left.lexicalMatch);
      if (lexicalDifference !== 0) return lexicalDifference;
      const relevanceDifference = this.relevanceScore(left) - this.relevanceScore(right);
      return relevanceDifference || left.distance - right.distance || left.sourceId.localeCompare(right.sourceId);
    };
    const representatives = [...groups.values()].flatMap((group) =>
      (["transcript", "activity"] as const).flatMap((sourceType) => {
        const candidatesForType = group.filter((candidate) => candidate.sourceType === sourceType).sort(compare);
        return candidatesForType.length === 0 ? [] : [candidatesForType[0]];
      })
    );
    const ranked = representatives.sort(compare);
    const selected: CandidateSource[] = [];
    const selectedIds = new Set<string>();
    const selectedReportIds = new Set<string>();
    const add = (candidate: CandidateSource | undefined) => {
      if (!candidate || selectedIds.has(candidate.sourceId)) return;
      selected.push(candidate);
      selectedIds.add(candidate.sourceId);
      selectedReportIds.add(candidate.reportId);
    };

    add(ranked[0]);
    for (const sourceType of ["transcript", "activity"] as const) {
      if (selected.some((candidate) => candidate.sourceType === sourceType)) {
        continue;
      }
      add(ranked.find((candidate) => candidate.sourceType === sourceType));
    }
    for (const candidate of ranked) {
      if (selected.length === MAX_RESULTS) break;
      if (!selectedReportIds.has(candidate.reportId)) add(candidate);
    }
    for (const candidate of ranked) {
      if (selected.length === MAX_RESULTS) break;
      add(candidate);
    }
    return selected.map(({ distance, lexicalMatch: _lexicalMatch, ...source }) => ({
      ...source,
      score: 1 - distance
    }));
  }

  private extractLexicalTerms(query: string): string[] {
    const normalized = query.toLocaleLowerCase("ko-KR");
    const tokens = normalized.match(/[0-9a-z가-힣]+/g) ?? [];
    const terms: string[] = [];
    for (const token of tokens) {
      const term = token.replace(
        /(?:에서|으로|에게|부터|까지|처럼|보다|이라는|라는|이란|란|은|는|이|가|을|를|과|와|의)$/u,
        ""
      );
      if (
        term.length < 2 ||
        LEXICAL_STOP_WORDS.has(term) ||
        terms.includes(term)
      ) {
        continue;
      }
      terms.push(term);
      if (terms.length === MAX_LEXICAL_TERMS) break;
    }
    return terms;
  }

  private relevanceScore(candidate: CandidateSource): number {
    return candidate.distance - (candidate.directlyReferenced ? DIRECT_REFERENCE_DISTANCE_BOOST : 0);
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

}
