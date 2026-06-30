"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  createReviewClient,
  normalizeReviewCanvas,
  REVIEW_FIXTURE_MEMBER_ID,
  resolveReviewClientMode,
  reviewFixture,
} from "../../lib/review/reviewClient.mjs";
import {
  buildWorkspaceFeatureTabs,
} from "../../lib/workspace/currentWorkspace.mjs";
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

export type ReviewRoomSession = {
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
type BusyAction = "node" | "checklist" | "comment" | null;

const riskToneClass: Record<ReviewRiskLevel, string> = {
  low: styles.riskLow,
  medium: styles.riskMedium,
  high: styles.riskHigh,
  critical: styles.riskCritical,
};

const analysisLabels: Record<ReviewAnalysisStatus, string> = {
  pending: "Pending",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
};

const nodeStatusLabels: Record<ReviewNodeStatus, string> = {
  ok: "OK",
  discuss: "Discuss",
  unknown: "Unreviewed",
};

function toRiskTone(riskLevel: string | null | undefined): string {
  return riskToneClass[(riskLevel as ReviewRiskLevel) ?? "low"] ?? styles.riskLow;
}

function sortNodes(nodes: ReviewCanvasNode[]) {
  return [...nodes].sort((left, right) => left.reviewOrder - right.reviewOrder);
}

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
  const [session, setSession] = useState<ReviewRoomSession | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
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
      } catch (error) {
        if (!allowFixtureFallback) {
          throw error;
        }

        const fallbackPullRequests =
          await fallbackClient.listPullRequests();

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
      } catch (error) {
        if (!allowFixtureFallback) {
          throw error;
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
      } catch (error) {
        try {
          analysis = await client.requestAnalysis(pullRequest.id);
          nextWarnings.push("Analysis was requested; runtime result is pending.");
        } catch (requestError) {
          if (!allowFixtureFallback) {
            throw requestError;
          }

          analysis = await fallbackClient.requestAnalysis(pullRequest.id);
          nextWarnings.push("Analysis result is backed by the review fixture.");
        }
      }

      try {
        canvas = await client.getCanvas(analysis.id);
      } catch (error) {
        if (!allowFixtureFallback) {
          throw error;
        }

        canvas = normalizeReviewCanvas(reviewFixture.canvas, analysis.id);
        nextWarnings.push("Canvas graph uses the fixture while graph data catches up.");
      }

      try {
        changedFiles = await client.listChangedFiles(analysis.id);
      } catch (error) {
        if (!allowFixtureFallback) {
          throw error;
        }

        changedFiles = await fallbackClient.listChangedFiles(analysis.id);
        nextWarnings.push("Changed files are backed by the review fixture.");
      }

      try {
        checklistItems = await client.listChecklistItems(analysis.id);
      } catch (error) {
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
      } catch (error) {
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
    } catch (error) {
      setStatus("error");
    }
  }

  async function updateNodeStatus(nextStatus: ReviewNodeStatus) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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

  if (status === "loading") {
    return (
      <ReviewWorkspaceFrame navItems={navItems}>
        <section className={styles.statusPanel} aria-live="polite">
          <strong>Loading review workspace</strong>
          <p>Preparing pull requests and the Review API client.</p>
        </section>
      </ReviewWorkspaceFrame>
    );
  }

  if (status === "error") {
    return (
      <ReviewWorkspaceFrame navItems={navItems}>
        <section className={styles.statusPanel} role="alert">
          <strong>Review workspace could not load</strong>
          <p>Refresh after the app server is available.</p>
        </section>
      </ReviewWorkspaceFrame>
    );
  }

  if (status === "selecting" || status === "opening" || !session) {
    return (
      <ReviewWorkspaceFrame navItems={navItems}>
        <header className={styles.reviewHeader}>
          <div>
            <span>Code Review</span>
            <h1>PR Review Room</h1>
          </div>
        </header>

        {warnings.length ? (
          <section className={styles.noticeList} aria-label="Review notices">
            {warnings.slice(-3).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </section>
        ) : null}

        <section className={styles.selectorGrid} aria-label="Pull requests">
          {pullRequests.length === 0 ? (
            <article className={styles.statusPanel}>
              <strong>No pull requests found</strong>
              <p>
                Connect or sync GitHub pull requests before opening a review
                room.
              </p>
            </article>
          ) : null}

          {pullRequests.map((pullRequest) => (
            <article className={styles.prCard} key={pullRequest.id}>
              <div className={styles.prCardHeader}>
                <span>#{pullRequest.number}</span>
                <b className={styles.statePill}>{pullRequest.state}</b>
              </div>
              <h2>{pullRequest.title}</h2>
              <p>
                {pullRequest.branch} into {pullRequest.baseBranch}
              </p>
              <dl className={styles.prStats}>
                <div>
                  <dt>Files</dt>
                  <dd>{pullRequest.changedFilesCount}</dd>
                </div>
                <div>
                  <dt>Add</dt>
                  <dd>+{pullRequest.additions}</dd>
                </div>
                <div>
                  <dt>Del</dt>
                  <dd>-{pullRequest.deletions}</dd>
                </div>
              </dl>
              <button
                disabled={status === "opening"}
                onClick={() => openPullRequest(pullRequest)}
                type="button"
              >
                {status === "opening" ? "Opening" : "Open review room"}
              </button>
            </article>
          ))}
        </section>
      </ReviewWorkspaceFrame>
    );
  }

  const { analysis, canvas, changedFiles, checklistItems, comments, room } =
    session;
  const pullRequest = room.pullRequest;
  const sortedNodes = sortNodes(canvas.nodes);

  return (
    <ReviewWorkspaceFrame navItems={navItems} className={styles.reviewWorkspace}>
      <header className={styles.roomTopbar}>
        <button
          className={styles.backButton}
          onClick={() => {
            setSession(null);
            setSelectedNodeId(null);
            setStatus("selecting");
          }}
          type="button"
        >
          PRs
        </button>
        <div className={styles.roomTitle}>
          <span>
            #{pullRequest.number} by {pullRequest.authorLogin ?? "unknown"}
          </span>
          <h1>{pullRequest.title}</h1>
        </div>
        <div className={styles.topbarMeta}>
          <span>{pullRequest.branch}</span>
          <b>{pullRequest.baseBranch}</b>
        </div>
      </header>

      <section className={styles.roomLayout}>
        <aside className={styles.leftRail} aria-label="Review summary">
          <section>
            <span className={styles.sectionEyebrow}>Analysis</span>
            <div className={styles.analysisStatus}>
              <b className={toRiskTone(analysis.riskLevel)}>
                {analysis.riskLevel}
              </b>
              <strong>{analysisLabels[analysis.analysisStatus]}</strong>
            </div>
            <p>{analysis.purposeSummary}</p>
            <p>{analysis.impactSummary}</p>
            <p>{analysis.testRecommendation}</p>
          </section>

          {warnings.length ? (
            <section className={styles.noticeList} aria-label="Review notices">
              {warnings.slice(-3).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </section>
          ) : null}

          <section>
            <span className={styles.sectionEyebrow}>Changed files</span>
            <div className={styles.fileList}>
              {changedFiles.map((file) => (
                <article className={styles.fileItem} key={file.id}>
                  <strong>{file.filePath}</strong>
                  <span>
                    {file.changeType} +{file.additions} -{file.deletions}
                  </span>
                  {file.functions.map((fn) => (
                    <small key={fn.id}>{fn.name}</small>
                  ))}
                </article>
              ))}
            </div>
          </section>
        </aside>

        <section className={styles.canvasArea} aria-label="Review graph">
          <div className={styles.canvasIntro}>
            <span className={styles.sectionEyebrow}>Review order</span>
            <h2>{canvas.intentSummary}</h2>
            <p>{canvas.reviewStrategy}</p>
          </div>

          <div className={styles.canvasStage}>
            <svg aria-hidden="true" className={styles.edgeLayer}>
              {canvas.edges.map((edge) => {
                const source = canvas.nodes.find(
                  (node) => node.id === edge.sourceNodeId,
                );
                const target = canvas.nodes.find(
                  (node) => node.id === edge.targetNodeId,
                );

                if (!source || !target) return null;

                return (
                  <line
                    key={edge.id}
                    x1={source.position.x + 120}
                    x2={target.position.x + 120}
                    y1={source.position.y + 44}
                    y2={target.position.y + 44}
                  />
                );
              })}
            </svg>

            {sortedNodes.map((node) => (
              <button
                className={`${styles.reviewNode} ${toRiskTone(node.riskLevel)} ${
                  selectedNodeId === node.id ? styles.reviewNodeActive : ""
                }`}
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                }}
                type="button"
              >
                <span>{node.reviewOrder}</span>
                <strong>{node.label}</strong>
                <small>
                  {node.nodeType} / {nodeStatusLabels[node.status]}
                </small>
              </button>
            ))}
          </div>
        </section>

        <aside className={styles.rightPanel} aria-label="Review actions">
          <section>
            <span className={styles.sectionEyebrow}>Selected node</span>
            {selectedNode ? (
              <div className={styles.nodeDetail}>
                <h2>{selectedNode.label}</h2>
                <b className={toRiskTone(selectedNode.riskLevel)}>
                  {selectedNode.riskLevel}
                </b>
                <p>{selectedNode.roleSummary}</p>
                <p>{selectedNode.reviewReason}</p>
                {selectedNode.filePath ? <code>{selectedNode.filePath}</code> : null}
                <div className={styles.nodeActions}>
                  <button
                    disabled={busyAction === "node"}
                    onClick={() => updateNodeStatus("ok")}
                    type="button"
                  >
                    Mark OK
                  </button>
                  <button
                    disabled={busyAction === "node"}
                    onClick={() => updateNodeStatus("discuss")}
                    type="button"
                  >
                    Discuss
                  </button>
                </div>
                <button className={styles.disabledButton} disabled type="button">
                  Node detail deferred
                </button>
              </div>
            ) : (
              <p className={styles.emptyState}>Select a node to review it.</p>
            )}
          </section>

          <section>
            <div className={styles.sectionTitleRow}>
              <span className={styles.sectionEyebrow}>Checklist</span>
              <button
                disabled={busyAction === "checklist"}
                onClick={addChecklistItem}
                type="button"
              >
                Add
              </button>
            </div>
            <div className={styles.checklist}>
              {checklistItems.map((item) => (
                <label key={item.id}>
                  <input checked={item.status === "done"} readOnly type="checkbox" />
                  <span>{item.title}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <span className={styles.sectionEyebrow}>Comments</span>
            <div className={styles.commentList}>
              {comments.map((comment) => (
                <article key={comment.id}>
                  <p>{comment.body}</p>
                  <time dateTime={comment.createdAt}>
                    {new Date(comment.createdAt).toLocaleString()}
                  </time>
                </article>
              ))}
            </div>
            <div className={styles.commentComposer}>
              <textarea
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Leave a review note"
                rows={3}
                value={commentDraft}
              />
              <button
                disabled={busyAction === "comment" || !commentDraft.trim()}
                onClick={addComment}
                type="button"
              >
                Comment
              </button>
            </div>
          </section>
        </aside>
      </section>
    </ReviewWorkspaceFrame>
  );
}
