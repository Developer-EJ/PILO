"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ReviewNodeWorkspace,
  createReviewSelectorSession,
  type ReviewBusyAction,
  type ReviewDecision,
  type ReviewSession,
} from "../../app/(workspace)/reviews/review-node-workspace";
import {
  createReviewClient,
  normalizeReviewCanvas,
  REVIEW_FIXTURE_MEMBER_ID,
  resolveReviewClientMode,
  reviewFixture,
} from "../../lib/review/reviewClient.mjs";
import { buildWorkspaceFeatureTabs } from "../../lib/workspace/currentWorkspace.mjs";
import { WorkspaceSidebar } from "../workspace/WorkspaceSidebar";
import styles from "./ReviewRoomWorkspace.module.css";

type ReviewRiskLevel = "low" | "medium" | "high" | "critical";
type ReviewAnalysisStatus = "pending" | "running" | "succeeded" | "failed";
type ReviewNodeStatus = "ok" | "discuss" | "unknown";

export type ReviewPullRequestSummary = {
  id: string;
  repositoryId?: string;
  number: number;
  title: string;
  authorLogin?: string | null;
  state: string;
  branch: string;
  baseBranch: string;
  url?: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  linkedTaskIds: string[];
  syncedAt?: string;
};

type ReviewRoomSummary = {
  id: string;
  workspaceId: string;
  pullRequestId: string;
  status: string;
  createdByMemberId: string;
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
  reviewReason: string;
  position: { x: number; y: number };
};

type ReviewCanvasEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
};

type ReviewCanvas = {
  id: string;
  analysisId: string;
  summary: string | null;
  intentSummary: string;
  reviewStrategy: string;
  reviewOrder: string[];
  nodes: ReviewCanvasNode[];
  edges: ReviewCanvasEdge[];
};

type ChangedFunction = {
  id: string;
  name: string;
  changeType: string;
  summary: string | null;
};

type ChangedFile = {
  id: string;
  filePath: string;
  changeType: string;
  additions: number;
  deletions: number;
  summary: string | null;
  functions: ChangedFunction[];
};

type ReviewChecklistItem = {
  id: string;
  analysisId: string;
  checklistType: "review" | "merge";
  title: string;
  status: "todo" | "done" | "skipped";
  checkedByMemberId: string | null;
  checkedAt: string | null;
  sortOrder: number;
};

type ReviewComment = {
  id: string;
  roomId: string;
  authorMemberId: string;
  nodeId: string | null;
  body: string;
  createdAt: string;
};

type RuntimeReviewRoomSession = {
  room: ReviewRoomSummary;
  analysis: ReviewAnalysis;
  canvas: ReviewCanvas;
  changedFiles: ChangedFile[];
  checklistItems: ReviewChecklistItem[];
  comments: ReviewComment[];
};

type ReviewRoomWorkspaceProps = {
  workspaceId: string;
  memberId?: string;
};

type ReviewNavItem = ReturnType<typeof buildWorkspaceFeatureTabs>[number];
type LoadStatus = "loading" | "selecting" | "opening" | "ready" | "error";

function ReviewWorkspaceFrame({
  navItems,
  className = styles.reviewShell,
  children,
}: {
  navItems: ReviewNavItem[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <main className="dashboard-shell">
      <WorkspaceSidebar items={navItems} />
      <section className={`workspace ${className}`}>{children}</section>
    </main>
  );
}

function toPresentationalSession(
  session: RuntimeReviewRoomSession,
): ReviewSession {
  return {
    pullRequest: session.room.pullRequest,
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
        `${session.analysis.okCount} OK / ${session.analysis.discussCount} discuss / ${session.analysis.riskCount} risk`,
      ],
    },
    canvas: {
      intentSummary: session.canvas.intentSummary,
      reviewStrategy: session.canvas.reviewStrategy,
      nodes: session.canvas.nodes,
      edges: session.canvas.edges,
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
  const selectorSessions = pullRequests.map(createReviewSelectorSession);

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
  workspaceId,
  memberId = REVIEW_FIXTURE_MEMBER_ID,
}: ReviewRoomWorkspaceProps) {
  const reviewMode = useMemo(() => resolveReviewClientMode(), []);
  const allowFixtureFallback = reviewMode !== "api";
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
  const navItems = useMemo(
    () =>
      buildWorkspaceFeatureTabs(workspaceId, {
        active: "reviews",
        badges: {
          reviews: pullRequests.length || undefined,
        },
      }),
    [pullRequests.length, workspaceId],
  );
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
        const nextPullRequests = await client.listPullRequests(workspaceId);

        if (!cancelled) {
          setPullRequests(nextPullRequests);
          setWarnings(
            nextPullRequests.length
              ? []
              : ["No pull requests are available from the Review API yet."],
          );
          setStatus("selecting");
        }
      } catch {
        if (!allowFixtureFallback) {
          throw new Error("Review API PR list failed in api mode");
        }

        const fallbackPullRequests = await fallbackClient.listPullRequests();

        if (!cancelled) {
          setPullRequests(fallbackPullRequests);
          setWarnings([
            "Using the PR fixture while the GitHub PR list is unavailable.",
          ]);
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
  }, [allowFixtureFallback, client, fallbackClient, workspaceId]);

  const selectedNode = useMemo(() => {
    if (!session || !selectedNodeId) return null;

    return (
      session.canvas.nodes.find((node) => node.id === selectedNodeId) ?? null
    );
  }, [selectedNodeId, session]);

  async function openPullRequest(pullRequest: ReviewPullRequestSummary) {
    const nextWarnings: string[] = [];

    setStatus("opening");
    setSelectedNodeId(null);
    setCommentDraft("");

    try {
      let room: ReviewRoomSummary;
      let analysis: ReviewAnalysis;
      let canvas: ReviewCanvas;
      let changedFiles: ChangedFile[];
      let checklistItems: ReviewChecklistItem[];
      let comments: ReviewComment[];

      try {
        room = await client.openReviewRoom(pullRequest.id, {
          workspaceId,
          memberId,
          pullRequest,
        });
      } catch {
        if (!allowFixtureFallback) {
          throw new Error("Review room API failed in api mode");
        }

        room = await fallbackClient.openReviewRoom(pullRequest.id, {
          workspaceId,
          memberId,
          pullRequest,
        });
        nextWarnings.push("Review room is backed by the PR fixture.");
      }

      try {
        analysis = await client.getAnalysis(pullRequest.id);
      } catch {
        try {
          analysis = await client.requestAnalysis(pullRequest.id);
          nextWarnings.push(
            "Analysis was requested; runtime result is pending.",
          );
        } catch {
          if (!allowFixtureFallback) {
            throw new Error("Review analysis API failed in api mode");
          }

          analysis = await fallbackClient.requestAnalysis(pullRequest.id);
          nextWarnings.push("Analysis result is backed by the review fixture.");
        }
      }

      try {
        canvas = await client.getCanvas(analysis.id);
      } catch {
        if (!allowFixtureFallback) {
          throw new Error("Review canvas API failed in api mode");
        }

        canvas = normalizeReviewCanvas(reviewFixture.canvas, analysis.id);
        nextWarnings.push(
          "Canvas graph uses the fixture while graph data catches up.",
        );
      }

      try {
        changedFiles = await client.listChangedFiles(analysis.id);
      } catch {
        if (!allowFixtureFallback) {
          throw new Error("Changed files API failed in api mode");
        }

        changedFiles = await fallbackClient.listChangedFiles(analysis.id);
        nextWarnings.push("Changed files are backed by the review fixture.");
      }

      try {
        checklistItems = await client.listChecklistItems(analysis.id);
      } catch {
        if (allowFixtureFallback) {
          checklistItems = await fallbackClient.listChecklistItems(analysis.id);
        } else {
          checklistItems = [];
          nextWarnings.push(
            "Checklist items could not be loaded from the Review API.",
          );
        }
      }

      try {
        comments = await client.listComments(room.id);
      } catch {
        if (allowFixtureFallback) {
          comments = await fallbackClient.listComments(room.id);
        } else {
          comments = [];
          nextWarnings.push(
            "Comments could not be loaded from the Review API.",
          );
        }
      }

      setSession({
        room,
        analysis,
        canvas,
        changedFiles,
        checklistItems,
        comments,
      });
      setWarnings(nextWarnings);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  async function updateNodeStatus(nextStatus: ReviewDecision) {
    if (!session || !selectedNode) return;

    setBusyAction("node");

    try {
      const savedState = await client.setNodeState(selectedNode.id, {
        reviewerMemberId: memberId,
        status: nextStatus,
        changedAt: new Date().toISOString(),
      });

      setSession((current) =>
        current
          ? {
              ...current,
              canvas: {
                ...current.canvas,
                nodes: current.canvas.nodes.map((node) =>
                  node.id === selectedNode.id
                    ? { ...node, status: savedState.status }
                    : node,
                ),
              },
            }
          : current,
      );
    } catch {
      if (!allowFixtureFallback) {
        setWarnings((current) => [
          ...current,
          "Node state was not saved because the Review API was unavailable.",
        ]);
        setBusyAction(null);
        return;
      }

      setSession((current) =>
        current
          ? {
              ...current,
              canvas: {
                ...current.canvas,
                nodes: current.canvas.nodes.map((node) =>
                  node.id === selectedNode.id
                    ? { ...node, status: nextStatus }
                    : node,
                ),
              },
            }
          : current,
      );
      setWarnings((current) => [
        ...current,
        "Node state was applied locally because the Review API was unavailable.",
      ]);
    } finally {
      setBusyAction(null);
    }
  }

  async function addChecklistItem() {
    if (!session) return;

    setBusyAction("checklist");

    const title = selectedNode
      ? `Review ${selectedNode.label}`
      : "Review remaining high-signal nodes";
    const body = {
      checklistType: "review",
      title,
      status: "todo",
      sortOrder: session.checklistItems.length,
    };

    try {
      const item = await client.createChecklistItem(session.analysis.id, body);

      setSession((current) =>
        current
          ? {
              ...current,
              checklistItems: [...current.checklistItems, item],
            }
          : current,
      );
    } catch {
      if (!allowFixtureFallback) {
        setWarnings((current) => [
          ...current,
          "Checklist item was not added because the Review API was unavailable.",
        ]);
        setBusyAction(null);
        return;
      }

      const item = await fallbackClient.createChecklistItem(
        session.analysis.id,
        body,
      );

      setSession((current) =>
        current
          ? {
              ...current,
              checklistItems: [...current.checklistItems, item],
            }
          : current,
      );
      setWarnings((current) => [
        ...current,
        "Checklist item was added locally because the Review API was unavailable.",
      ]);
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleChecklistItem(item: ReviewChecklistItem) {
    if (!session) return;

    setBusyAction("checklist");

    const nextStatus = item.status === "done" ? "todo" : "done";
    const body = {
      status: nextStatus,
      checkedByMemberId: nextStatus === "done" ? memberId : null,
    };

    try {
      const updatedItem = await client.updateChecklistItem(item.id, body);

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
    } catch {
      if (!allowFixtureFallback) {
        setWarnings((current) => [
          ...current,
          "Checklist item was not updated because the Review API was unavailable.",
        ]);
        setBusyAction(null);
        return;
      }

      const updatedItem = await fallbackClient.updateChecklistItem(
        item.id,
        body,
      );

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
      setWarnings((current) => [
        ...current,
        "Checklist item was updated locally because the Review API was unavailable.",
      ]);
    } finally {
      setBusyAction(null);
    }
  }

  async function addComment() {
    if (!session) return;

    const bodyText = commentDraft.trim();

    if (!bodyText) return;

    setBusyAction("comment");

    const body = {
      authorMemberId: memberId,
      nodeId: selectedNode?.id ?? null,
      body: bodyText,
      createdAt: new Date().toISOString(),
    };

    try {
      const comment = await client.createComment(session.room.id, body);

      setSession((current) =>
        current
          ? {
              ...current,
              comments: [...current.comments, comment],
            }
          : current,
      );
    } catch {
      if (!allowFixtureFallback) {
        setWarnings((current) => [
          ...current,
          "Comment was not added because the Review API was unavailable.",
        ]);
        setCommentDraft("");
        setBusyAction(null);
        return;
      }

      const comment = await fallbackClient.createComment(session.room.id, body);

      setSession((current) =>
        current
          ? {
              ...current,
              comments: [...current.comments, comment],
            }
          : current,
      );
      setWarnings((current) => [
        ...current,
        "Comment was added locally because the Review API was unavailable.",
      ]);
    } finally {
      setCommentDraft("");
      setBusyAction(null);
    }
  }

  return (
    <ReviewWorkspaceFrame
      navItems={navItems}
      className={session ? styles.reviewWorkspace : styles.reviewShell}
    >
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
    </ReviewWorkspaceFrame>
  );
}
