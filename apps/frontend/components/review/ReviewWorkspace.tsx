"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createReviewClient,
  ReviewApiError,
} from "../../lib/review/reviewClient.mjs";
import {
  reviewMockMemberId,
  reviewMockWorkspaceId,
} from "../../lib/review/reviewFixtures.mjs";
import { ReviewDomainNav, type ReviewView } from "./ReviewDomainNav";
import styles from "./ReviewWorkspace.module.css";

type ReviewRiskLevel = "low" | "medium" | "high" | "critical";
type ReviewNodeStatus = "ok" | "discuss" | "unknown";
type ReviewChecklistStatus = "todo" | "done" | "skipped";

type PullRequestSummary = {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  authorLogin: string | null;
  state: string;
  branch: string | null;
  baseBranch: string | null;
  url: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  linkedTaskIds: string[];
  syncedAt: string | null;
};

type CodeReviewRoomSummary = {
  id: string;
  workspaceId: string;
  pullRequestId: string;
  status: string;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
  pullRequest: PullRequestSummary;
};

type PRAnalysisSummary = {
  id: string;
  pullRequestId: string;
  purposeSummary: string | null;
  impactSummary: string | null;
  testRecommendation: string | null;
  riskLevel: ReviewRiskLevel;
  analysisStatus: string;
  okCount: number;
  discussCount: number;
  riskCount: number;
  conclusion: string | null;
};

type ReviewNodeSummary = {
  id: string;
  analysisId: string;
  nodeType: string;
  label: string;
  filePath: string | null;
  functionName: string | null;
  riskLevel: ReviewRiskLevel;
  status: ReviewNodeStatus;
  reviewOrder: number;
  roleSummary: string;
  reviewReason: string;
  position: { x: number; y: number };
};

type ReviewGraphSummary = {
  id: string;
  analysisId: string;
  summary: string | null;
  intentSummary: string;
  reviewStrategy: string;
  reviewOrder: string[];
  nodes: ReviewNodeSummary[];
};

type ChangedFunction = {
  id: string;
  changedFileId: string;
  name: string;
  changeType: string;
  summary: string | null;
};

type ChangedFile = {
  id: string;
  analysisId: string;
  filePath: string;
  changeType: string;
  additions: number;
  deletions: number;
  summary: string | null;
  functions: ChangedFunction[];
};

type ReviewNodeDetail = {
  id: string;
  analysisId: string;
  nodeId: string;
  filePath: string;
  roleSummary: string;
  modificationReason: string;
  changeGroups: Array<{
    id: string;
    title: string;
    summary: string;
    newStartLine: number;
    newEndLine: number | null;
  }>;
  diffHunks: Array<{
    id: string;
    oldStartLine: number;
    newStartLine: number;
    oldCode: string;
    newCode: string;
    highlightLines?: number[];
  }>;
};

type ReviewChecklistItem = {
  id: string;
  analysisId: string;
  checklistType: "review" | "merge";
  title: string;
  status: ReviewChecklistStatus;
  checkedByMemberId: string | null;
  checkedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type ReviewComment = {
  id: string;
  roomId: string;
  authorMemberId: string;
  nodeId: string | null;
  changedFileId: string | null;
  changedFunctionId: string | null;
  body: string;
  createdAt: string;
};

type ReviewWorkspaceProps = {
  workspaceId?: string | null;
  embedded?: boolean;
};

const stateLabels: Record<string, string> = {
  review_requested: "리뷰 요청",
  changes_requested: "수정 요청",
  open: "열림",
  merged: "병합됨",
  closed: "닫힘",
};

const statusLabels: Record<string, string> = {
  pending: "분석 대기",
  running: "분석 중",
  succeeded: "분석 완료",
  failed: "분석 실패",
  ok: "문제 없음",
  discuss: "논의 필요",
  unknown: "판단 불가",
};

const riskLabels: Record<ReviewRiskLevel, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "치명적",
};

const changeTypeLabels: Record<string, string> = {
  added: "추가",
  modified: "수정",
  deleted: "삭제",
  renamed: "이름 변경",
};

const checklistTypeLabels: Record<ReviewChecklistItem["checklistType"], string> =
  {
    review: "리뷰",
    merge: "병합",
  };

const checklistStatusLabels: Record<ReviewChecklistStatus, string> = {
  todo: "대기",
  done: "완료",
  skipped: "건너뜀",
};

const sourceLabels: Record<string, string> = {
  github_fixture: "GitHub fixture",
  github_changed_files_fixture: "GitHub 변경 파일 fixture",
  review_artifacts_fixture: "리뷰 아티팩트 fixture",
  review_fixture: "리뷰 fixture",
};

const reviewViews: ReviewView[] = [
  "prs",
  "analysis",
  "files",
  "graph",
  "artifacts",
];

const viewLabels: Record<ReviewView, string> = {
  prs: "PR 선택",
  analysis: "분석",
  files: "변경 파일",
  graph: "리뷰 그래프",
  artifacts: "아티팩트",
};

function parseReviewView(value: string | null): ReviewView {
  return reviewViews.includes(value as ReviewView)
    ? (value as ReviewView)
    : "prs";
}

function messageFromError(error: unknown) {
  if (error instanceof ReviewApiError) {
    return `${error.message}${error.status ? ` (${error.status})` : ""}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

function riskClassName(riskLevel: ReviewRiskLevel) {
  return styles[`risk-${riskLevel}` as keyof typeof styles] ?? "";
}

function fileRisk(file: ChangedFile): ReviewRiskLevel {
  const changedLines = file.additions + file.deletions;

  if (changedLines >= 90) {
    return "high";
  }

  if (changedLines >= 30) {
    return "medium";
  }

  return "low";
}

function formatBranch(branch: string | null) {
  return branch || "unknown";
}

function formatClientMode(mode: string) {
  return mode === "api" ? "API 모드" : "Mock 모드";
}

function formatSource(source: string) {
  return (sourceLabels[source] ?? source) || "fixture";
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id);

  if (existingIndex < 0) {
    return [nextItem, ...items];
  }

  return items.map((item, index) => (index === existingIndex ? nextItem : item));
}

function SelectionRequiredPanel({
  activeView,
  onSelectPullRequest,
}: {
  activeView: ReviewView;
  onSelectPullRequest: () => void;
}) {
  return (
    <section className={styles.selectionRequired} aria-live="polite">
      <article className={styles.emptyPanel}>
        <strong>{viewLabels[activeView]}를 보려면 PR을 먼저 선택하세요.</strong>
        <p>
          리뷰룸은 선택한 PR의 분석 결과와 변경 파일을 기준으로 열립니다.
          먼저 PR 목록에서 리뷰할 항목을 선택해 주세요.
        </p>
        <button
          className={styles.primaryButton}
          onClick={onSelectPullRequest}
          type="button"
        >
          PR 선택으로 이동
        </button>
      </article>
    </section>
  );
}

export function ReviewWorkspace({
  workspaceId = reviewMockWorkspaceId,
  embedded = false,
}: ReviewWorkspaceProps = {}) {
  const [client] = useState(() => createReviewClient());
  const pathname = usePathname() ?? "/reviews";
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewFromUrl = parseReviewView(searchParams.get("view"));
  const [activeView, setActiveView] = useState<ReviewView>(viewFromUrl);
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([]);
  const [providerBoundary, setProviderBoundary] = useState("");
  const [selectedPullRequest, setSelectedPullRequest] =
    useState<PullRequestSummary | null>(null);
  const [room, setRoom] = useState<CodeReviewRoomSummary | null>(null);
  const [analysis, setAnalysis] = useState<PRAnalysisSummary | null>(null);
  const [runtimeAnalysis, setRuntimeAnalysis] =
    useState<PRAnalysisSummary | null>(null);
  const [graph, setGraph] = useState<ReviewGraphSummary | null>(null);
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [changedFilesSource, setChangedFilesSource] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDetail, setNodeDetail] = useState<ReviewNodeDetail | null>(null);
  const [nodeDecisionComment, setNodeDecisionComment] = useState("");
  const [checklist, setChecklist] = useState<ReviewChecklistItem[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [changeTypeFilter, setChangeTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("Review 화면을 준비하고 있습니다.");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveView(viewFromUrl);
  }, [viewFromUrl]);

  function changeView(nextView: ReviewView) {
    setActiveView(nextView);

    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (nextView === "prs") {
      nextSearchParams.delete("view");
    } else {
      nextSearchParams.set("view", nextView);
    }

    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  const selectedNode = useMemo(() => {
    if (!graph || !selectedNodeId) {
      return null;
    }

    return graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [graph, selectedNodeId]);

  const selectedFile = useMemo(() => {
    return (
      changedFiles.find((file) => file.id === selectedFileId) ??
      changedFiles[0] ??
      null
    );
  }, [changedFiles, selectedFileId]);

  const filteredChangedFiles = useMemo(() => {
    const normalizedQuery = fileQuery.trim().toLowerCase();

    return changedFiles.filter((file) => {
      const matchesQuery =
        !normalizedQuery ||
        file.filePath.toLowerCase().includes(normalizedQuery) ||
        (file.summary ?? "").toLowerCase().includes(normalizedQuery);
      const matchesType =
        changeTypeFilter === "all" || file.changeType === changeTypeFilter;
      const matchesRisk = riskFilter === "all" || fileRisk(file) === riskFilter;

      return matchesQuery && matchesType && matchesRisk;
    });
  }, [changedFiles, changeTypeFilter, fileQuery, riskFilter]);

  useEffect(() => {
    let mounted = true;

    async function loadPullRequests() {
      try {
        const response = await client.listPullRequests();

        if (!mounted) {
          return;
        }

        setPullRequests(response.items ?? []);
        setProviderBoundary(response.boundary ?? "");
        setNotice(
          response.source === "github_fixture"
            ? "GitHub PR provider는 Deferred라 PullRequestSummary fixture를 사용합니다."
            : "PR 목록을 불러왔습니다.",
        );
      } catch (caught) {
        if (mounted) {
          setError(messageFromError(caught));
        }
      }
    }

    loadPullRequests();

    return () => {
      mounted = false;
    };
  }, [client]);

  useEffect(() => {
    let mounted = true;

    async function loadNodeDetail() {
      if (!selectedNode) {
        setNodeDetail(null);
        return;
      }

      const detail = await client.getNodeDetail(selectedNode.id);

      if (mounted) {
        setNodeDetail(detail);
      }
    }

    loadNodeDetail().catch((caught) => {
      if (mounted) {
        setError(messageFromError(caught));
      }
    });

    return () => {
      mounted = false;
    };
  }, [client, selectedNode]);

  async function selectPullRequest(pullRequest: PullRequestSummary) {
    setBusy("open-room");
    setError(null);
    setSelectedPullRequest(pullRequest);
    setSelectedNodeId(null);
    setNodeDetail(null);
    changeView("analysis");

    try {
      const openedRoom = await client.openRoom(pullRequest.id, {
        workspaceId: workspaceId ?? reviewMockWorkspaceId,
        memberId: reviewMockMemberId,
      });
      setRoom(openedRoom);

      const summary = await client.getAnalysisSummary(pullRequest.id);
      setAnalysis(summary);
      setRuntimeAnalysis(summary);

      const [nextGraph, nextFiles, nextChecklist, nextComments] =
        await Promise.all([
          client.getGraph(summary.id),
          client.listChangedFiles(summary.id),
          client.listChecklistItems(summary.id),
          client.listComments(openedRoom.id),
        ]);

      setGraph(nextGraph);
      setChangedFiles(nextFiles.items ?? []);
      setChangedFilesSource(nextFiles.source ?? "");
      setChecklist(nextChecklist.items ?? []);
      setComments(nextComments.items ?? []);
      setSelectedFileId((nextFiles.items ?? [])[0]?.id ?? null);
      setNotice("리뷰룸, 분석 요약, 그래프를 불러왔습니다.");
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function requestAnalysis() {
    if (!selectedPullRequest) {
      return;
    }

    setBusy("analysis");
    setError(null);

    try {
      const requested = await client.requestAnalysis(selectedPullRequest.id);
      setRuntimeAnalysis(requested);
      setNotice(
        requested.analysisStatus === "pending"
          ? "리뷰 분석 요청이 접수되었습니다. Agent runtime 연결 전까지는 public summary fixture를 표시합니다."
          : "리뷰 분석이 완료되었습니다.",
      );
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function refreshAnalysisStatus() {
    if (!selectedPullRequest) {
      return;
    }

    setBusy("refresh-analysis");
    setError(null);

    try {
      const nextAnalysis = await client.getAnalysis(selectedPullRequest.id);
      setRuntimeAnalysis(nextAnalysis);
      setNotice(
        `현재 분석 실행 상태: ${
          statusLabels[nextAnalysis.analysisStatus] ?? nextAnalysis.analysisStatus
        }`,
      );
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function refreshSummaryAndGraph() {
    if (!selectedPullRequest) {
      return;
    }

    setBusy("refresh-summary");
    setError(null);

    try {
      const nextAnalysis = await client.getAnalysisSummary(
        selectedPullRequest.id,
      );
      const nextGraph = await client.getGraph(nextAnalysis.id);
      const nextFiles = await client.listChangedFiles(nextAnalysis.id);

      setAnalysis(nextAnalysis);
      setGraph(nextGraph);
      setChangedFiles(nextFiles.items ?? []);
      setChangedFilesSource(nextFiles.source ?? "");
      setNotice("분석 요약, 그래프, 변경 파일을 다시 불러왔습니다.");
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveNodeDecision(status: ReviewNodeStatus) {
    if (!selectedNode) {
      return;
    }

    setBusy("node-state");
    setError(null);

    try {
      const saved = await client.updateNodeState(selectedNode.id, {
        reviewerMemberId: reviewMockMemberId,
        status,
        comment: nodeDecisionComment || null,
        changedAt: new Date().toISOString(),
      });

      setGraph((current) =>
        current
          ? {
              ...current,
              nodes: current.nodes.map((node) =>
                node.id === selectedNode.id
                  ? { ...node, status: saved.status }
                  : node,
              ),
            }
          : current,
      );
      setNotice(`노드 판단을 '${statusLabels[saved.status]}' 상태로 저장했습니다.`);
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function toggleChecklistItem(item: ReviewChecklistItem) {
    setBusy("checklist");
    setError(null);

    try {
      const nextStatus = item.status === "done" ? "todo" : "done";
      const saved = await client.createChecklistItem(item.analysisId, {
        checklistType: item.checklistType,
        title: item.title,
        status: nextStatus,
        checkedByMemberId:
          nextStatus === "done" ? reviewMockMemberId : undefined,
        sortOrder: item.sortOrder,
        changedAt: new Date().toISOString(),
      });

      setChecklist((current) => upsertById(current, saved));
      setNotice("체크리스트 상태를 저장했습니다.");
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function addChecklistItem() {
    if (!analysis || !newChecklistTitle.trim()) {
      return;
    }

    setBusy("checklist");
    setError(null);

    try {
      const saved = await client.createChecklistItem(analysis.id, {
        checklistType: "review",
        title: newChecklistTitle.trim(),
        status: "todo",
      });

      setChecklist((current) => upsertById(current, saved));
      setNewChecklistTitle("");
      setNotice("새 리뷰 체크리스트를 추가했습니다.");
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function addComment() {
    if (!room || !commentBody.trim()) {
      return;
    }

    setBusy("comment");
    setError(null);

    try {
      const saved = await client.createComment(room.id, {
        authorMemberId: reviewMockMemberId,
        nodeId: selectedNode?.id ?? null,
        changedFileId: selectedFile?.id ?? null,
        body: commentBody.trim(),
        createdAt: new Date().toISOString(),
      });

      setComments((current) => [saved, ...current]);
      setCommentBody("");
      setNotice("리뷰 코멘트를 저장했습니다.");
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(null);
    }
  }

  const analysisForDisplay = analysis ?? runtimeAnalysis;
  const graphNodes = graph?.nodes ?? [];
  const requiresSelection = activeView !== "prs" && !selectedPullRequest;
  const reviewShellClassName = embedded
    ? `${styles.reviewShell} ${styles.reviewShellEmbedded}`
    : styles.reviewShell;
  const workspaceClassName = embedded
    ? `${styles.workspace} ${styles.workspaceEmbedded}`
    : styles.workspace;

  return (
    <main className={reviewShellClassName}>
      {!embedded ? (
        <aside className={styles.leftRail}>
          <div className={styles.brandBlock}>
            <strong>PILO Review</strong>
            <span>은재 / PR 분석</span>
          </div>

          <ReviewDomainNav
            activeView={activeView}
            hasSelection={Boolean(selectedPullRequest)}
            onViewChange={changeView}
          />

          <section className={styles.boundaryBox}>
            <span>연동 경계</span>
            <p>
              {providerBoundary ||
                "GitHub PR 원본은 현재 fixture/read model 경계로만 소비합니다."}
            </p>
          </section>
        </aside>
      ) : null}

      <section className={workspaceClassName}>
        {!embedded ? (
          <>
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>코드 리뷰룸</span>
                <h1>
                  {selectedPullRequest
                    ? `#${selectedPullRequest.number} ${selectedPullRequest.title}`
                    : "리뷰할 PR을 선택하세요"}
                </h1>
              </div>
              <div className={styles.headerActions}>
                <span className={styles.modePill}>
                  {formatClientMode(client.mode)}
                </span>
                {selectedPullRequest?.url ? (
                  <a
                    className={styles.secondaryButton}
                    href={selectedPullRequest.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    GitHub 원본 열기
                  </a>
                ) : null}
              </div>
            </header>

            <div className={styles.statusStrip} role="status">
              <span>{busy ? "처리 중" : "준비됨"}</span>
              <p>{error ?? notice}</p>
            </div>
          </>
        ) : null}

        {activeView === "prs" ? (
          <section className={styles.prGrid} aria-label="리뷰할 PR 목록">
            {pullRequests.length ? (
              pullRequests.map((pullRequest) => (
              <article className={styles.prCard} key={pullRequest.id}>
                <div className={styles.prCardHead}>
                  <span>#{pullRequest.number}</span>
                  <b>{stateLabels[pullRequest.state] ?? pullRequest.state}</b>
                </div>
                <h2>{pullRequest.title}</h2>
                <p>
                  {pullRequest.authorLogin ?? "unknown"} ·{" "}
                  {formatBranch(pullRequest.branch)} →{" "}
                  {formatBranch(pullRequest.baseBranch)}
                </p>
                <dl className={styles.metricGrid}>
                  <div>
                    <dt>파일</dt>
                    <dd>{pullRequest.changedFilesCount}</dd>
                  </div>
                  <div>
                    <dt>추가 / 삭제</dt>
                    <dd>
                      {pullRequest.additions} / {pullRequest.deletions}
                    </dd>
                  </div>
                  <div>
                    <dt>연결 Task</dt>
                    <dd>{pullRequest.linkedTaskIds.length}</dd>
                  </div>
                </dl>
                <button
                  className={styles.primaryButton}
                  disabled={busy === "open-room"}
                  onClick={() => selectPullRequest(pullRequest)}
                  type="button"
                >
                  리뷰룸 열기
                </button>
              </article>
              ))
            ) : (
              <article className={styles.emptyPanel}>
                <strong>리뷰할 PR이 없습니다.</strong>
                <p>
                  GitHub provider가 Deferred 상태라 현재는 제공된 PR fixture만 표시합니다.
                </p>
              </article>
            )}
          </section>
        ) : null}

        {requiresSelection ? (
          <SelectionRequiredPanel
            activeView={activeView}
            onSelectPullRequest={() => changeView("prs")}
          />
        ) : null}

        {activeView === "analysis" && selectedPullRequest ? (
          <section className={styles.analysisGrid}>
            <article className={styles.analysisHero}>
              <div className={styles.sectionHead}>
                <span className={styles.eyebrow}>PR 분석 요약</span>
                <span
                  className={`${styles.riskPill} ${
                    analysisForDisplay
                      ? riskClassName(analysisForDisplay.riskLevel)
                      : ""
                  }`}
                >
                  {analysisForDisplay
                    ? riskLabels[analysisForDisplay.riskLevel]
                    : "대기"}
                </span>
              </div>
              <h2>{analysisForDisplay?.purposeSummary ?? "분석 요약 없음"}</h2>
              <p>
                {analysisForDisplay?.impactSummary ??
                  "영향 범위 요약이 아직 없습니다."}
              </p>
              <p>
                {analysisForDisplay?.testRecommendation ??
                  "권장 테스트가 아직 정리되지 않았습니다."}
              </p>
              <p>{analysisForDisplay?.conclusion ?? "결론 대기 중입니다."}</p>
            </article>

            <article className={styles.panel}>
              <div className={styles.sectionHead}>
                <h3>분석 실행 상태</h3>
                <span>
                  {statusLabels[
                    runtimeAnalysis?.analysisStatus ??
                      analysisForDisplay?.analysisStatus ??
                      "pending"
                  ] ?? "대기"}
                </span>
              </div>
              <dl className={styles.metricGrid}>
                <div>
                  <dt>문제 없음</dt>
                  <dd>{analysisForDisplay?.okCount ?? 0}</dd>
                </div>
                <div>
                  <dt>논의 필요</dt>
                  <dd>{analysisForDisplay?.discussCount ?? 0}</dd>
                </div>
                <div>
                  <dt>위험</dt>
                  <dd>{analysisForDisplay?.riskCount ?? 0}</dd>
                </div>
              </dl>
              <div className={styles.buttonRow}>
                <button
                  className={styles.primaryButton}
                  disabled={busy === "analysis"}
                  onClick={requestAnalysis}
                  type="button"
                >
                  분석 실행
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={busy === "refresh-analysis"}
                  onClick={refreshAnalysisStatus}
                  type="button"
                >
                  상태 조회
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={busy === "refresh-summary"}
                  onClick={refreshSummaryAndGraph}
                  type="button"
                >
                  요약 새로고침
                </button>
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.sectionHead}>
                <h3>리뷰 순서</h3>
                <span>{graphNodes.length}개 노드</span>
              </div>
              <ol className={styles.orderList}>
                {graphNodes
                  .slice()
                  .sort((left, right) => left.reviewOrder - right.reviewOrder)
                  .map((node) => (
                    <li key={node.id}>
                      <button
                        onClick={() => {
                          setSelectedNodeId(node.id);
                          changeView("graph");
                        }}
                        type="button"
                      >
                        <strong>{node.label}</strong>
                        <small>{node.reviewReason}</small>
                      </button>
                    </li>
                  ))}
              </ol>
            </article>
          </section>
        ) : null}

        {activeView === "files" && selectedPullRequest ? (
          <section className={styles.filesLayout}>
            <div className={styles.filterBar}>
              <label>
                검색
                <input
                  onChange={(event) => setFileQuery(event.target.value)}
                  placeholder="파일 경로 또는 요약"
                  value={fileQuery}
                />
              </label>
              <label>
                변경
                <select
                  onChange={(event) => setChangeTypeFilter(event.target.value)}
                  value={changeTypeFilter}
                >
                  <option value="all">전체</option>
                  <option value="added">추가</option>
                  <option value="modified">수정</option>
                  <option value="deleted">삭제</option>
                  <option value="renamed">이름 변경</option>
                </select>
              </label>
              <label>
                위험도
                <select
                  onChange={(event) => setRiskFilter(event.target.value)}
                  value={riskFilter}
                >
                  <option value="all">전체</option>
                  <option value="low">낮음</option>
                  <option value="medium">중간</option>
                  <option value="high">높음</option>
                </select>
              </label>
              <span>{formatSource(changedFilesSource)}</span>
            </div>

            <div className={styles.fileList}>
              {filteredChangedFiles.length ? (
                filteredChangedFiles.map((file) => {
                const risk = fileRisk(file);

                return (
                  <button
                    className={
                      selectedFile?.id === file.id
                        ? `${styles.fileRow} ${styles.fileRowActive}`
                        : styles.fileRow
                    }
                    key={file.id}
                    onClick={() => setSelectedFileId(file.id)}
                    type="button"
                  >
                    <strong>{file.filePath}</strong>
                    <small>{file.summary}</small>
                    <span className={riskClassName(risk)}>
                      {changeTypeLabels[file.changeType] ?? file.changeType} ·
                      +{file.additions} -{file.deletions}
                    </span>
                  </button>
                );
                })
              ) : (
                <div className={styles.emptyPanel}>
                  <strong>조건에 맞는 변경 파일이 없습니다.</strong>
                  <p>검색어 또는 필터를 조정해 다시 확인하세요.</p>
                </div>
              )}
            </div>

            <aside className={styles.fileDetail}>
              {selectedFile ? (
                <>
                  <span className={styles.eyebrow}>변경 파일</span>
                  <h2>{selectedFile.filePath}</h2>
                  <p>{selectedFile.summary}</p>
                  <dl className={styles.metricGrid}>
                    <div>
                      <dt>추가</dt>
                      <dd>{selectedFile.additions}</dd>
                    </div>
                    <div>
                      <dt>삭제</dt>
                      <dd>{selectedFile.deletions}</dd>
                    </div>
                    <div>
                      <dt>위험도</dt>
                      <dd>{riskLabels[fileRisk(selectedFile)]}</dd>
                    </div>
                  </dl>
                  <div className={styles.functionList}>
                    {selectedFile.functions.map((fn) => (
                      <article key={fn.id}>
                        <strong>{fn.name}</strong>
                        <span>
                          {changeTypeLabels[fn.changeType] ?? fn.changeType}
                        </span>
                        <p>{fn.summary}</p>
                      </article>
                    ))}
                    {selectedFile.functions.length === 0 ? (
                      <p>함수 단위 분석은 patch가 있는 파일에서만 생성됩니다.</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p>필터 조건에 맞는 변경 파일이 없습니다.</p>
              )}
            </aside>
          </section>
        ) : null}

        {activeView === "graph" && selectedPullRequest ? (
          <section className={styles.graphLayout}>
            <div className={styles.graphStage}>
              <svg
                aria-hidden="true"
                className={styles.edgeLayer}
                viewBox="0 0 820 520"
              >
                {graphNodes.slice(1).map((node, index) => {
                  const previous = graphNodes[index];

                  if (!previous) {
                    return null;
                  }

                  return (
                    <line
                      key={`${previous.id}-${node.id}`}
                      x1={previous.position.x + 132}
                      x2={node.position.x + 132}
                      y1={previous.position.y + 42}
                      y2={node.position.y + 42}
                    />
                  );
                })}
              </svg>
              {graphNodes.map((node) => (
                <button
                  className={
                    selectedNode?.id === node.id
                      ? `${styles.graphNode} ${styles.graphNodeActive} ${riskClassName(
                          node.riskLevel,
                        )}`
                      : `${styles.graphNode} ${riskClassName(node.riskLevel)}`
                  }
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  style={
                    {
                      "--node-x": `${node.position.x}px`,
                      "--node-y": `${node.position.y}px`,
                    } as CSSProperties
                  }
                  type="button"
                >
                  <span>{node.reviewOrder}</span>
                  <strong>{node.label}</strong>
                  <small>{statusLabels[node.status]}</small>
                </button>
              ))}
              {graphNodes.length === 0 ? (
                <div className={styles.graphEmpty}>
                  <strong>리뷰 그래프가 아직 없습니다.</strong>
                  <p>PR을 선택한 뒤 분석 요약을 불러오면 노드가 표시됩니다.</p>
                </div>
              ) : null}
            </div>

            <aside className={styles.nodePanel}>
              {selectedNode ? (
                <>
                  <div className={styles.sectionHead}>
                    <span className={styles.eyebrow}>노드 상세</span>
                    <span
                      className={`${styles.riskPill} ${riskClassName(
                        selectedNode.riskLevel,
                      )}`}
                    >
                      {riskLabels[selectedNode.riskLevel]}
                    </span>
                  </div>
                  <h2>{selectedNode.label}</h2>
                  <p>{selectedNode.roleSummary}</p>
                  <p>{selectedNode.reviewReason}</p>
                  <textarea
                    onChange={(event) =>
                      setNodeDecisionComment(event.target.value)
                    }
                    placeholder="판단 근거 메모"
                    value={nodeDecisionComment}
                  />
                  <div className={styles.buttonRow}>
                    {(["ok", "discuss", "unknown"] as ReviewNodeStatus[]).map(
                      (status) => (
                        <button
                          className={
                            selectedNode.status === status
                              ? styles.primaryButton
                              : styles.secondaryButton
                          }
                          disabled={busy === "node-state"}
                          key={status}
                          onClick={() => saveNodeDecision(status)}
                          type="button"
                        >
                          {statusLabels[status]}
                        </button>
                      ),
                    )}
                  </div>
                  {nodeDetail ? (
                    <div className={styles.diffBox}>
                      <h3>{nodeDetail.filePath}</h3>
                      {nodeDetail.changeGroups.map((group) => (
                        <article key={group.id}>
                          <strong>{group.title}</strong>
                          <p>{group.summary}</p>
                          <span>
                            L{group.newStartLine}
                            {group.newEndLine ? `-L${group.newEndLine}` : ""}
                          </span>
                        </article>
                      ))}
                      {nodeDetail.diffHunks.map((hunk) => (
                        <div className={styles.diffColumns} key={hunk.id}>
                          <pre>
                            <code>{hunk.oldCode}</code>
                          </pre>
                          <pre>
                            <code>{hunk.newCode}</code>
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>노드 상세 diff API는 Deferred 상태라 fixture 상세 정보를 확인합니다.</p>
                  )}
                </>
              ) : (
                <p>그래프 노드를 선택하면 상태 저장과 diff 확인이 열립니다.</p>
              )}
            </aside>
          </section>
        ) : null}

        {activeView === "artifacts" && selectedPullRequest ? (
          <section className={styles.artifactsGrid}>
            <article className={styles.panel}>
              <div className={styles.sectionHead}>
                <h3>병합 체크리스트</h3>
                <span>{checklist.length}</span>
              </div>
              <div className={styles.inlineForm}>
                <input
                  onChange={(event) => setNewChecklistTitle(event.target.value)}
                  placeholder="새 체크리스트"
                  value={newChecklistTitle}
                />
                <button
                  className={styles.primaryButton}
                  disabled={busy === "checklist" || !newChecklistTitle.trim()}
                  onClick={addChecklistItem}
                  type="button"
                >
                  추가
                </button>
              </div>
              <div className={styles.checklist}>
                {checklist.map((item) => (
                  <button
                    className={
                      item.status === "done"
                        ? `${styles.checkItem} ${styles.checkItemDone}`
                        : styles.checkItem
                    }
                    key={item.id}
                    onClick={() => toggleChecklistItem(item)}
                      type="button"
                    >
                    <span>{checklistStatusLabels[item.status]}</span>
                    <strong>{item.title}</strong>
                    <small>{checklistTypeLabels[item.checklistType]}</small>
                  </button>
                ))}
                {checklist.length === 0 ? (
                  <div className={styles.emptyPanel}>
                    <strong>체크리스트가 없습니다.</strong>
                    <p>리뷰 중 확인할 항목을 추가해 관리하세요.</p>
                  </div>
                ) : null}
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.sectionHead}>
                <h3>리뷰 코멘트</h3>
                <span>{comments.length}</span>
              </div>
              <textarea
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="선택한 노드/파일에 남길 코멘트"
                value={commentBody}
              />
              <button
                className={styles.primaryButton}
                disabled={busy === "comment" || !commentBody.trim()}
                onClick={addComment}
                type="button"
              >
                코멘트 저장
              </button>
              <div className={styles.commentList}>
                {comments.map((comment) => (
                  <article key={comment.id}>
                    <strong>{comment.body}</strong>
                    <small>
                      {comment.nodeId ? "노드" : "파일"} ·{" "}
                      {new Date(comment.createdAt).toLocaleString("ko-KR")}
                    </small>
                  </article>
                ))}
                {comments.length === 0 ? (
                  <div className={styles.emptyPanel}>
                    <strong>저장된 코멘트가 없습니다.</strong>
                    <p>선택한 노드나 파일에 리뷰 메모를 남길 수 있습니다.</p>
                  </div>
                ) : null}
              </div>
            </article>
          </section>
        ) : null}
      </section>
    </main>
  );
}
