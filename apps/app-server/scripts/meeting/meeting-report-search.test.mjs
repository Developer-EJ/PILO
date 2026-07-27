import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  MeetingReportSearchService
} = require("../../dist/modules/meeting-report/meeting-report-search.service.js");

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_REPORT_ID = "44444444-4444-4444-8444-444444444444";

function reportRow({
  id = REPORT_ID,
  title = "API 설계 회의",
  similarity = null,
  totalCount = 1,
  startedAt = "2026-07-15T01:00:00.000Z"
} = {}) {
  return {
    id,
    meeting_id:
      id === REPORT_ID
        ? "55555555-5555-4555-8555-555555555555"
        : "66666666-6666-4666-8666-666666666666",
    recording_id:
      id === REPORT_ID
        ? "77777777-7777-4777-8777-777777777777"
        : "88888888-8888-4888-8888-888888888888",
    status: "COMPLETED",
    title,
    summary: "API 설계를 검토했습니다.",
    discussion_points: "인증 구조",
    decisions: "OAuth를 사용합니다.",
    meeting_started_at: startedAt,
    report_created_at: "2026-07-15T02:00:00.000Z",
    room_name: "개발 회의실",
    title_similarity: similarity,
    total_count: totalCount
  };
}

class FakeDatabase {
  constructor({ exact = [], fuzzy = [], ids = [], filters = [] } = {}) {
    this.exact = exact;
    this.fuzzy = fuzzy;
    this.ids = ids;
    this.filters = filters;
    this.queries = [];
  }

  async query(text, values) {
    this.queries.push({ text, values });
    if (text.includes("report.normalized_title =")) return this.exact;
    if (text.includes("OPERATOR(extensions.%)")) return this.fuzzy;
    if (text.includes("report.id = ANY")) return this.ids;
    return this.filters;
  }
}

class FakeWorkspaceService {
  constructor() {
    this.calls = [];
  }

  async assertWorkspaceAccess(userId, workspaceId) {
    this.calls.push({ userId, workspaceId });
  }
}

class FakeRagService {
  constructor(result = []) {
    this.result = result;
    this.calls = [];
  }

  async search(userId, workspaceId, input) {
    this.calls.push({ userId, workspaceId, input });
    return this.result;
  }
}

{
  const database = new FakeDatabase({ exact: [reportRow()] });
  const workspace = new FakeWorkspaceService();
  const rag = new FakeRagService();
  const service = new MeetingReportSearchService(database, workspace, rag);
  const result = await service.search(USER_ID, WORKSPACE_ID, {
    title: "  API   설계 회의 ",
    from: "2026-07-15T00:00:00+09:00",
    to: "2026-07-16T00:00:00+09:00"
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.matchedBy, "exact_title");
  assert.equal(result.diagnostics.exactTitleCount, 1);
  assert.equal(result.reports[0].reportId, REPORT_ID);
  assert.equal(rag.calls.length, 0);
  assert.equal(workspace.calls.length, 1);
  assert.match(database.queries[0].text, /report\.normalized_title =/);
  assert.match(database.queries[0].text, /meeting\.started_at >=/);
  assert.match(database.queries[0].text, /meeting\.started_at </);
  assert.ok(database.queries[0].values.includes("api 설계 회의"));
}

{
  const database = new FakeDatabase({
    exact: [
      reportRow({ totalCount: 2 }),
      reportRow({
        id: SECOND_REPORT_ID,
        totalCount: 2,
        startedAt: "2026-07-14T01:00:00.000Z"
      })
    ]
  });
  const rag = new FakeRagService();
  const service = new MeetingReportSearchService(
    database,
    new FakeWorkspaceService(),
    rag
  );
  const result = await service.search(USER_ID, WORKSPACE_ID, {
    title: "API 설계 회의"
  });

  assert.equal(result.status, "candidates");
  assert.equal(result.matchedBy, "exact_title");
  assert.equal(result.reports.length, 2);
  assert.equal(rag.calls.length, 0);
}

{
  const database = new FakeDatabase({
    fuzzy: [
      reportRow({
        title: "API 설계 회의",
        similarity: 0.78
      })
    ]
  });
  const service = new MeetingReportSearchService(
    database,
    new FakeWorkspaceService(),
    new FakeRagService()
  );
  const result = await service.search(USER_ID, WORKSPACE_ID, {
    title: "API 설게 회의"
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.matchedBy, "fuzzy_title");
  assert.equal(result.reports[0].titleSimilarity, 0.78);
  assert.equal(database.queries.length, 2);
  assert.match(database.queries[1].text, /extensions\.similarity/);
  assert.match(
    database.queries[1].text,
    /OPERATOR\(extensions\.%\)/
  );
}

{
  const database = new FakeDatabase({
    fuzzy: [
      reportRow({
        title: "API 설계 회의",
        similarity: 0.42
      })
    ]
  });
  const rag = new FakeRagService([
    {
      sourceId: "transcript:99999999-9999-4999-8999-999999999999",
      sourceType: "transcript",
      reportId: REPORT_ID,
      content: "낮은 신뢰도의 제목 후보로 검색 범위를 고정하면 안 됩니다.",
      directlyReferenced: false,
      score: 0.91
    }
  ]);
  const service = new MeetingReportSearchService(
    database,
    new FakeWorkspaceService(),
    rag
  );
  const result = await service.search(USER_ID, WORKSPACE_ID, {
    title: "API 변경 회의",
    contentQuery: "인증 방식은?"
  });

  assert.equal(result.status, "candidates");
  assert.equal(result.matchedBy, "fuzzy_title");
  assert.equal(result.diagnostics.fuzzyTitleCount, 1);
  assert.equal(result.reports[0].titleSimilarity, 0.42);
  assert.equal(rag.calls.length, 0);
}

{
  const evidence = [
    {
      sourceId: "transcript:99999999-9999-4999-8999-999999999999",
      sourceType: "transcript",
      reportId: SECOND_REPORT_ID,
      content: "API v2 배포는 다음 주로 정했습니다.",
      directlyReferenced: false,
      score: 0.82
    }
  ];
  const database = new FakeDatabase({
    ids: [reportRow({ id: SECOND_REPORT_ID })]
  });
  const rag = new FakeRagService(evidence);
  const service = new MeetingReportSearchService(
    database,
    new FakeWorkspaceService(),
    rag
  );
  const result = await service.search(USER_ID, WORKSPACE_ID, {
    title: "존재하지 않는 제목",
    contentQuery: "API v2 배포 일정을 어떻게 정했어?",
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z"
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.matchedBy, "hybrid_content");
  assert.equal(result.diagnostics.exactTitleCount, 0);
  assert.equal(result.diagnostics.fuzzyTitleCount, 0);
  assert.equal(result.diagnostics.hybridReportCount, 1);
  assert.equal(result.reports[0].reportId, SECOND_REPORT_ID);
  assert.deepEqual(rag.calls[0].input, {
    query: "API v2 배포 일정을 어떻게 정했어?",
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z"
  });
}

{
  const first = reportRow({ totalCount: 2 });
  const second = reportRow({
    id: SECOND_REPORT_ID,
    totalCount: 2,
    startedAt: "2026-07-14T01:00:00.000Z"
  });
  const database = new FakeDatabase({ filters: [first, second] });
  const rag = new FakeRagService([
    {
      sourceId: "transcript:99999999-9999-4999-8999-999999999998",
      sourceType: "transcript",
      reportId: SECOND_REPORT_ID,
      content: "두 번째 회의에서 배포 일정을 정했습니다.",
      directlyReferenced: false,
      score: 0.8
    }
  ]);
  const service = new MeetingReportSearchService(
    database,
    new FakeWorkspaceService(),
    rag
  );
  const result = await service.search(USER_ID, WORKSPACE_ID, {
    contentQuery: "배포 일정",
    status: "COMPLETED",
    roomName: "개발 회의실"
  });

  assert.deepEqual(rag.calls[0].input.reportIds, [
    REPORT_ID,
    SECOND_REPORT_ID
  ]);
  assert.deepEqual(
    result.reports.map((report) => report.reportId),
    [SECOND_REPORT_ID]
  );
}

{
  const migration = await readFile(
    new URL(
      "../../../../db/migrations/109_add_meeting_report_title_search.sql",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.match(migration, /ADD COLUMN normalized_title TEXT/);
  assert.match(migration, /GENERATED ALWAYS AS/);
  assert.match(migration, /extensions\.gin_trgm_ops/);
  assert.match(
    migration,
    /idx_meetings_workspace_started_at[\s\S]*workspace_id,\s*started_at DESC/
  );
}
