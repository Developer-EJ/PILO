"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ReviewNodeWorkspace,
  createReviewSelectorSession,
  type ReviewBusyAction,
  type ReviewDecision,
  type ReviewSession,
} from "../../app/(workspace)/reviews/review-node-workspace";
import {
  createReviewClient,
  resolveReviewClientMode,
} from "../../lib/review/reviewClient.mjs";
import {
  reviewMockMemberId,
  reviewMockWorkspaceId,
} from "../../lib/review/reviewFixtures.mjs";
import styles from "./ReviewRoomWorkspace.module.css";

type ReviewRiskLevel = "low" | "medium" | "high" | "critical";
type ReviewAnalysisStatus = "pending" | "running" | "succeeded" | "failed";
type ReviewNodeStatus = "ok" | "discuss" | "unknown";

type ReviewPullRequestSummary = {
  id: string;
  repositoryId?: string;
  number: number;
  title: string;
  authorLogin?: string | null;
  state: string;
  branch: string | null;
  baseBranch: string | null;
  url?: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  linkedTaskIds: string[];
  syncedAt?: string | null;
};

type ReviewRoomSummary = {
  id: string;
  workspaceId: string;
  pullRequestId: string;
  status: string;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
  pullRequest: ReviewPullRequestSummary;
};

type ReviewAnalysis = {
  id: string;
  pullRequestId: string;
  purposeSummary: string | null;
  impactSummary: string | null;
  testRecommendation: string | null;
  riskLevel: ReviewRiskLevel;
  analysisStatus: ReviewAnalysisStatus;
  okCount: number;
  discussCount: number;
  riskCount: number;
  conclusion: string | null;
};

type ReviewNodeDetail = NonNullable<
  ReviewSession["canvas"]["nodes"][number]["detail"]
>;

type ReviewCanvasNode = {
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
  reviewReason: string | null;
  position: { x: number; y: number };
  detail?: ReviewNodeDetail;
};

type ReviewCanvas = {
  id: string;
  analysisId: string;
  summary: string | null;
  intentSummary: string;
  reviewStrategy: string;
  reviewOrder: string[];
  nodes: ReviewCanvasNode[];
  edges?: Array<{
    id?: string;
    sourceNodeId?: string;
    targetNodeId?: string;
    from?: string;
    to?: string;
    label?: string | null;
  }>;
};

type ChangedFile = NonNullable<ReviewSession["changedFiles"]>[number];
type ReviewChecklistItem = NonNullable<ReviewSession["checklistItems"]>[number];
type ReviewComment = NonNullable<ReviewSession["comments"]>[number];

type RuntimeReviewRoomSession = {
  room: ReviewRoomSummary;
  analysis: ReviewAnalysis;
  canvas: ReviewCanvas;
  changedFiles: ChangedFile[];
  checklistItems: ReviewChecklistItem[];
  comments: ReviewComment[];
};

type ReviewRoomWorkspaceProps = {
  workspaceId?: string | null;
  memberId?: string;
};

type ReviewSourceResponse<T> = {
  items?: T[];
  source?: string;
  boundary?: string;
};

type LoadStatus = "loading" | "selecting" | "opening" | "ready" | "error";

function sourceWarning(source?: string, boundary?: string) {
  if (boundary) {
    return boundary;
  }

  if (source === "github_fixture") {
    return "GitHub PR 목록 API가 Deferred 상태라 PullRequestSummary fixture를 표시합니다.";
  }

  if (source === "github_changed_files_fixture") {
    return "GitHub changed files API가 Deferred 상태라 변경 파일 fixture를 표시합니다.";
  }

  if (source === "review_artifacts_fixture") {
    return "리뷰 아티팩트 조회 API가 없어 fixture/fallback으로 표시합니다.";
  }

  return null;
}

function unwrapItems<T>(response: T[] | ReviewSourceResponse<T>): {
  items: T[];
  warnings: string[];
} {
  if (Array.isArray(response)) {
    return { items: response, warnings: [] };
  }

  const warning = sourceWarning(response.source, response.boundary);

  return {
    items: Array.isArray(response.items) ? response.items : [],
    warnings: warning ? [warning] : [],
  };
}

function dedupeWarnings(messages: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const message of messages) {
    const normalized = message.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(message);
  }

  return result;
}

function appendWarning(current: string[], warning: string) {
  return dedupeWarnings([...current, warning]);
}

function normalizePullRequest(
  pullRequest: ReviewPullRequestSummary,
): ReviewSession["pullRequest"] {
  return {
    ...pullRequest,
    branch: pullRequest.branch ?? "unknown",
    baseBranch: pullRequest.baseBranch ?? "unknown",
    linkedTaskIds: Array.isArray(pullRequest.linkedTaskIds)
      ? pullRequest.linkedTaskIds
      : [],
  };
}

function fallbackEdgesFromNodes(nodes: ReviewCanvasNode[]) {
  return nodes.slice(1).map((node, index) => ({
    id: `review-edge-${nodes[index].id}-${node.id}`,
    sourceNodeId: nodes[index].id,
    targetNodeId: node.id,
    label: null,
  }));
}

function normalizeNodeDetail(detail: unknown): ReviewNodeDetail | undefined {
  if (!detail || typeof detail !== "object") {
    return undefined;
  }

  const record = detail as {
    filePath?: string;
    modificationReason?: string;
    changeGroups?: Array<{
      id: string;
      title: string;
      summary: string;
      newStartLine: number;
      newEndLine?: number | null;
      diffHunkId?: string;
    }>;
    diffHunks?: Array<{
      id: string;
      oldStartLine: number;
      newStartLine: number;
      oldCode: string;
      newCode: string;
    }>;
  };

  return {
    filePath: record.filePath ?? "알 수 없는 파일",
    modificationReason:
      record.modificationReason ??
      "Review API가 이 노드를 확인 대상으로 표시했습니다.",
    changeGroups: Array.isArray(record.changeGroups)
      ? record.changeGroups.map((group, index) => ({
          id: group.id,
          title: group.title,
          summary: group.summary,
          newStartLine: group.newStartLine,
          newEndLine: group.newEndLine ?? group.newStartLine,
          diffHunkId:
            group.diffHunkId ??
            record.diffHunks?.[index]?.id ??
            record.diffHunks?.[0]?.id ??
            group.id,
        }))
      : [],
    diffHunks: Array.isArray(record.diffHunks) ? record.diffHunks : [],
  };
}

async function withFallback<T>({
  primary,
  fallback,
  warning,
  addWarning,
}: {
  primary: () => Promise<T>;
  fallback: () => Promise<T>;
  warning: string;
  addWarning: (warning: string) => void;
}) {
  try {
    return await primary();
  } catch (error) {
    addWarning(warning);
    return fallback();
  }
}

function toPresentationalSession(
  session: RuntimeReviewRoomSession,
): ReviewSession {
  return {
    pullRequest: normalizePullRequest(session.room.pullRequest),
    linkedTasks: [],
    analysis: {
      id: session.analysis.id,
      analysisStatus: session.analysis.analysisStatus,
      riskLevel: session.analysis.riskLevel,
      purposeSummary: session.analysis.purposeSummary,
      impactSummary: session.analysis.impactSummary,
      testRecommendation: session.analysis.testRecommendation,
      conclusion: session.analysis.conclusion,
      reviewNotes: [
        `현재 판정: 승인 ${session.analysis.okCount}개, 논의 필요 ${session.analysis.discussCount}개, 위험 신호 ${session.analysis.riskCount}개`,
      ],
    },
    canvas: {
      intentSummary: session.canvas.intentSummary,
      reviewStrategy: session.canvas.reviewStrategy,
      nodes: session.canvas.nodes,
      edges:
        session.canvas.edges && session.canvas.edges.length
          ? session.canvas.edges
          : fallbackEdgesFromNodes(session.canvas.nodes),
    },
    changedFiles: session.changedFiles,
    checklistItems: session.checklistItems,
    comments: session.comments,
  };
}

function mergeRuntimeSession(
  pullRequests: ReviewPullRequestSummary[],
  session: RuntimeReviewRoomSession | null,
) {
  const selectorSessions = pullRequests
    .map(normalizePullRequest)
    .map(createReviewSelectorSession);

  if (!session) {
    return selectorSessions;
  }

  const runtimeSession = toPresentationalSession(session);
  const nextSessions = selectorSessions.map((entry) =>
    entry.pullRequest.id === runtimeSession.pullRequest.id
      ? runtimeSession
      : entry,
  );

  return nextSessions.some(
    (entry) => entry.pullRequest.id === runtimeSession.pullRequest.id,
  )
    ? nextSessions
    : [runtimeSession, ...nextSessions];
}

export function ReviewRoomWorkspace({
  workspaceId = reviewMockWorkspaceId,
  memberId = reviewMockMemberId,
}: ReviewRoomWorkspaceProps) {
  const effectiveWorkspaceId = workspaceId ?? reviewMockWorkspaceId;
  const reviewMode = useMemo(() => resolveReviewClientMode(), []);
  const client = useMemo(
    () => createReviewClient({ mode: reviewMode }),
    [reviewMode],
  );
  const fallbackClient = useMemo(
    () => createReviewClient({ mode: "mock" }),
    [],
  );
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [pullRequests, setPullRequests] = useState<ReviewPullRequestSummary[]>(
    [],
  );
  const [session, setSession] = useState<RuntimeReviewRoomSession | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<ReviewBusyAction>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const reviewSessions = useMemo(
    () => mergeRuntimeSession(pullRequests, session),
    [pullRequests, session],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPullRequests() {
      setStatus("loading");
      setWarnings([]);

      try {
        const response = await client.listPullRequests();
        const nextPullRequests =
          unwrapItems<ReviewPullRequestSummary>(response);

        if (!cancelled) {
          setPullRequests(nextPullRequests.items);
          setWarnings(
            dedupeWarnings([
              ...(reviewMode === "api"
                ? []
                : ["Mock Review client로 PR 리뷰 흐름을 체험합니다."]),
              ...nextPullRequests.warnings,
              ...(nextPullRequests.items.length
                ? []
                : ["불러온 PR이 없어 fallback PR fixture를 표시합니다."]),
            ]),
          );
          setStatus("selecting");
        }
      } catch (error) {
        const fallbackResponse = await fallbackClient.listPullRequests();
        const fallbackPullRequests =
          unwrapItems<ReviewPullRequestSummary>(fallbackResponse);

        if (!cancelled) {
          setPullRequests(fallbackPullRequests.items);
          setWarnings(
            dedupeWarnings([
              "Review/GitHub PR 목록 API가 없어 PullRequestSummary fixture로 대체했습니다.",
              ...fallbackPullRequests.warnings,
            ]),
          );
          setStatus("selecting");
        }
      }
    }

    loadPullRequests().catch(() => {
      if (!cancelled) {
        setStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client, effectiveWorkspaceId, fallbackClient, reviewMode]);

  const selectedNode = useMemo(() => {
    if (!session || !selectedNodeId) {
      return null;
    }

    return (
      session.canvas.nodes.find((node) => node.id === selectedNodeId) ?? null
    );
  }, [selectedNodeId, session]);

  async function enrichCanvasWithDetails(
    canvas: ReviewCanvas,
    addWarning: (warning: string) => void,
  ): Promise<ReviewCanvas> {
    const nodes = await Promise.all(
      canvas.nodes.map(async (node) => {
        try {
          const detail = await client.getNodeDetail(node.id);
          return {
            ...node,
            detail: normalizeNodeDetail(detail) ?? node.detail,
          };
        } catch (error) {
          try {
            const detail = await fallbackClient.getNodeDetail(node.id);
            return {
              ...node,
              detail: normalizeNodeDetail(detail) ?? node.detail,
            };
          } catch (fallbackError) {
            return node;
          }
        }
      }),
    );

    if (
      nodes.some((node, index) => node.detail !== canvas.nodes[index].detail)
    ) {
      addWarning(
        "노드 diff 상세는 Review node detail fixture/fallback을 함께 사용합니다.",
      );
    }

    return {
      ...canvas,
      nodes,
      edges:
        canvas.edges && canvas.edges.length
          ? canvas.edges
          : fallbackEdgesFromNodes(nodes),
    };
  }

  async function openPullRequest(pullRequest: ReviewPullRequestSummary) {
    const nextWarnings: string[] = [];
    const addWarning = (warning: string) => {
      if (!nextWarnings.includes(warning)) {
        nextWarnings.push(warning);
      }
    };

    setStatus("opening");
    setSelectedNodeId(null);
    setCommentDraft("");

    try {
      const normalizedPullRequest = normalizePullRequest(pullRequest);
      const room = await withFallback<ReviewRoomSummary>({
        primary: () =>
          client.openRoom(pullRequest.id, {
            workspaceId: effectiveWorkspaceId,
            memberId,
            pullRequest: normalizedPullRequest,
          }),
        fallback: () =>
          fallbackClient.openRoom(pullRequest.id, {
            workspaceId: effectiveWorkspaceId,
            memberId,
            pullRequest: normalizedPullRequest,
          }),
        warning: "Review room API가 없어 mock 리뷰룸으로 열었습니다.",
        addWarning,
      });
      const analysis = await withFallback<ReviewAnalysis>({
        primary: async () => {
          try {
            return await client.getAnalysisSummary(pullRequest.id);
          } catch (error) {
            try {
              return await client.getAnalysis(pullRequest.id);
            } catch (analysisError) {
              return client.requestAnalysis(pullRequest.id);
            }
          }
        },
        fallback: () => fallbackClient.requestAnalysis(pullRequest.id),
        warning: "PR 분석 API가 없어 분석 fixture/fallback을 표시합니다.",
        addWarning,
      });
      const canvas = await withFallback<ReviewCanvas>({
        primary: () => client.getGraph(analysis.id),
        fallback: () => fallbackClient.getGraph(analysis.id),
        warning: "리뷰 그래프 API가 없어 그래프 fixture/fallback을 표시합니다.",
        addWarning,
      });
      const enrichedCanvas = await enrichCanvasWithDetails(canvas, addWarning);
      const changedFilesResponse = await withFallback<
        ReviewSourceResponse<ChangedFile> | ChangedFile[]
      >({
        primary: () => client.listChangedFiles(analysis.id),
        fallback: () => fallbackClient.listChangedFiles(analysis.id),
        warning:
          "GitHub changed files API가 Deferred라 변경 파일 fixture를 표시합니다.",
        addWarning,
      });
      const changedFiles = unwrapItems<ChangedFile>(changedFilesResponse);
      const checklistResponse = await withFallback<
        ReviewSourceResponse<ReviewChecklistItem> | ReviewChecklistItem[]
      >({
        primary: () => client.listChecklistItems(analysis.id),
        fallback: () => fallbackClient.listChecklistItems(analysis.id),
        warning:
          "체크리스트 조회 API가 없어 review artifact fixture를 표시합니다.",
        addWarning,
      });
      const checklistItems =
        unwrapItems<ReviewChecklistItem>(checklistResponse);
      const commentsResponse = await withFallback<
        ReviewSourceResponse<ReviewComment> | ReviewComment[]
      >({
        primary: () => client.listComments(room.id),
        fallback: () => fallbackClient.listComments(room.id),
        warning: "코멘트 조회 API가 없어 review artifact fixture를 표시합니다.",
        addWarning,
      });
      const comments = unwrapItems<ReviewComment>(commentsResponse);

      setSession({
        room: {
          ...room,
          workspaceId: room.workspaceId ?? effectiveWorkspaceId,
          pullRequest: normalizePullRequest(room.pullRequest ?? pullRequest),
        },
        analysis,
        canvas: enrichedCanvas,
        changedFiles: changedFiles.items,
        checklistItems: checklistItems.items,
        comments: comments.items,
      });
      setWarnings(
        dedupeWarnings([
          ...nextWarnings,
          ...changedFiles.warnings,
          ...checklistItems.warnings,
          ...comments.warnings,
        ]),
      );
      setStatus("ready");
    } catch (error) {
      setWarnings([
        "리뷰룸을 여는 중 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.",
      ]);
      setStatus("error");
    }
  }

  function updateSessionNodeStatus(nodeId: string, nextStatus: ReviewDecision) {
    setSession((current) =>
      current
        ? {
            ...current,
            canvas: {
              ...current.canvas,
              nodes: current.canvas.nodes.map((node) =>
                node.id === nodeId ? { ...node, status: nextStatus } : node,
              ),
            },
          }
        : current,
    );
  }

  async function updateNodeStatus(nextStatus: ReviewDecision) {
    if (!session || !selectedNode) {
      return;
    }

    const targetNodeId = selectedNode.id;
    const previousStatus = selectedNode.status ?? "unknown";

    setBusyAction("node");
    updateSessionNodeStatus(targetNodeId, nextStatus);

    try {
      const savedState = await withFallback<{
        status: ReviewDecision;
      }>({
        primary: () =>
          client.updateNodeState(targetNodeId, {
            reviewerMemberId: memberId,
            status: nextStatus,
            changedAt: new Date().toISOString(),
          }),
        fallback: () =>
          fallbackClient.updateNodeState(targetNodeId, {
            reviewerMemberId: memberId,
            status: nextStatus,
            changedAt: new Date().toISOString(),
          }),
        warning:
          "Review API가 없어 노드 판정을 mock/fallback 상태로 반영했습니다.",
        addWarning: (warning) =>
          setWarnings((current) => appendWarning(current, warning)),
      });

      updateSessionNodeStatus(targetNodeId, savedState.status);
    } catch (error) {
      updateSessionNodeStatus(targetNodeId, previousStatus);
      setWarnings((current) =>
        appendWarning(
          current,
          "Review API가 없어 노드 판정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        ),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function addChecklistItem() {
    if (!session) {
      return;
    }

    setBusyAction("checklist");

    const title = selectedNode
      ? `${selectedNode.label} 리뷰 확인`
      : "남은 핵심 리뷰 노드 확인";
    const body = {
      checklistType: "review",
      title,
      status: "todo",
      sortOrder: session.checklistItems.length,
    };

    try {
      const item = await withFallback<ReviewChecklistItem>({
        primary: () => client.createChecklistItem(session.analysis.id, body),
        fallback: () =>
          fallbackClient.createChecklistItem(session.analysis.id, body),
        warning:
          "Review API가 없어 체크리스트를 mock/fallback으로 추가했습니다.",
        addWarning: (warning) =>
          setWarnings((current) => appendWarning(current, warning)),
      });

      setSession((current) =>
        current
          ? {
              ...current,
              checklistItems: [...current.checklistItems, item],
            }
          : current,
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleChecklistItem(item: ReviewChecklistItem) {
    if (!session) {
      return;
    }

    setBusyAction("checklist");

    const nextStatus = item.status === "done" ? "todo" : "done";
    const body = {
      checklistType: item.checklistType,
      title: item.title,
      status: nextStatus,
      checkedByMemberId: nextStatus === "done" ? memberId : undefined,
      sortOrder: item.sortOrder,
      changedAt: new Date().toISOString(),
    };

    try {
      const updatedItem = await withFallback<ReviewChecklistItem>({
        primary: () => client.createChecklistItem(session.analysis.id, body),
        fallback: () =>
          fallbackClient.createChecklistItem(session.analysis.id, body),
        warning:
          "Review API가 없어 체크리스트 상태를 mock/fallback으로 반영했습니다.",
        addWarning: (warning) =>
          setWarnings((current) => appendWarning(current, warning)),
      });

      setSession((current) =>
        current
          ? {
              ...current,
              checklistItems: current.checklistItems.map((entry) =>
                entry.id === updatedItem.id ? updatedItem : entry,
              ),
            }
          : current,
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function addComment() {
    if (!session) {
      return;
    }

    const bodyText = commentDraft.trim();

    if (!bodyText) {
      return;
    }

    setBusyAction("comment");

    const body = {
      authorMemberId: memberId,
      nodeId: selectedNode?.id ?? null,
      changedFileId: null,
      body: bodyText,
      createdAt: new Date().toISOString(),
    };

    try {
      const comment = await withFallback<ReviewComment>({
        primary: () => client.createComment(session.room.id, body),
        fallback: () => fallbackClient.createComment(session.room.id, body),
        warning: "Review API가 없어 코멘트를 mock/fallback으로 추가했습니다.",
        addWarning: (warning) =>
          setWarnings((current) => appendWarning(current, warning)),
      });

      setSession((current) =>
        current
          ? {
              ...current,
              comments: [comment, ...current.comments],
            }
          : current,
      );
      setCommentDraft("");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className={styles.reviewRoomWorkspace}>
      <ReviewNodeWorkspace
        busyAction={busyAction}
        commentDraft={commentDraft}
        onAddChecklistItem={() => void addChecklistItem()}
        onAddComment={() => void addComment()}
        onBackToSelector={() => {
          setSession(null);
          setSelectedNodeId(null);
          setCommentDraft("");
          setStatus("selecting");
        }}
        onCommentDraftChange={setCommentDraft}
        onNodeDecision={(decision) => void updateNodeStatus(decision)}
        onSelectNode={setSelectedNodeId}
        onSelectSession={(nextSession) =>
          void openPullRequest(nextSession.pullRequest)
        }
        onToggleChecklistItem={(item) => void toggleChecklistItem(item)}
        selectedNodeId={selectedNodeId}
        selectedSessionId={session?.room.pullRequestId ?? null}
        sessions={reviewSessions}
        status={status}
        warnings={warnings}
      />
    </section>
  );
}
