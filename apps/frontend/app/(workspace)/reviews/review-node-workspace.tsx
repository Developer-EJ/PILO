"use client";

import { type CSSProperties, useMemo, useState } from "react";
import styles from "./page.module.css";

export type ReviewDecision = "ok" | "discuss" | "unknown";
export type ReviewLoadStatus =
  | "loading"
  | "selecting"
  | "opening"
  | "ready"
  | "error";
export type ReviewBusyAction = "node" | "checklist" | "comment" | null;

export type PullRequestSummary = {
  id: string;
  number: number;
  title: string;
  authorLogin?: string | null;
  state: string;
  branch: string;
  baseBranch: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  linkedTaskIds: string[];
};

export type ReviewTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
};

export type ReviewAnalysis = {
  id: string;
  analysisStatus: string;
  riskLevel: string;
  purposeSummary: string | null;
  impactSummary: string | null;
  testRecommendation: string | null;
  conclusion: string | null;
  reviewNotes?: string[];
};

export type ReviewChangedFunction = {
  id: string;
  name: string;
  changeType: string;
  summary: string | null;
};

export type ReviewChangedFile = {
  id: string;
  filePath: string;
  changeType: string;
  additions: number;
  deletions: number;
  summary: string | null;
  functions: ReviewChangedFunction[];
};

export type ReviewChecklistItem = {
  id: string;
  analysisId: string;
  checklistType: "review" | "merge";
  title: string;
  status: "todo" | "done" | "skipped";
  checkedByMemberId: string | null;
  checkedAt: string | null;
  sortOrder: number;
};

export type ReviewComment = {
  id: string;
  roomId: string;
  authorMemberId: string;
  nodeId: string | null;
  body: string;
  createdAt: string;
};

export type ReviewCanvasNode = {
  id: string;
  analysisId?: string;
  label: string;
  nodeType: string;
  filePath?: string | null;
  functionName?: string | null;
  riskLevel: string;
  status?: ReviewDecision;
  reviewOrder: number;
  roleSummary: string;
  reviewReason?: string | null;
  position: { x: number; y: number };
  detail?: {
    filePath: string;
    modificationReason: string;
    changeGroups: Array<{
      id: string;
      title: string;
      summary: string;
      newStartLine: number;
      newEndLine: number;
      diffHunkId: string;
    }>;
    diffHunks: Array<{
      id: string;
      oldStartLine: number;
      newStartLine: number;
      oldCode: string;
      newCode: string;
    }>;
  };
};

export type ReviewCanvas = {
  intentSummary: string;
  reviewStrategy: string;
  nodes: ReviewCanvasNode[];
  edges: Array<{
    id?: string;
    from?: string;
    to?: string;
    sourceNodeId?: string;
    targetNodeId?: string;
    label?: string | null;
  }>;
};

export type ReviewSession = {
  pullRequest: PullRequestSummary;
  linkedTasks: ReviewTask[];
  analysis: ReviewAnalysis;
  canvas: ReviewCanvas;
  changedFiles?: ReviewChangedFile[];
  checklistItems?: ReviewChecklistItem[];
  comments?: ReviewComment[];
};

type ReviewNodeWorkspaceProps = {
  sessions: ReviewSession[];
  status?: ReviewLoadStatus;
  warnings?: string[];
  selectedSessionId?: string | null;
  selectedNodeId?: string | null;
  busyAction?: ReviewBusyAction;
  commentDraft?: string;
  onCommentDraftChange?: (value: string) => void;
  onSelectSession?: (session: ReviewSession) => void;
  onBackToSelector?: () => void;
  onSelectNode?: (nodeId: string | null) => void;
  onNodeDecision?: (decision: ReviewDecision) => void;
  onAddChecklistItem?: () => void;
  onToggleChecklistItem?: (item: ReviewChecklistItem) => void;
  onAddComment?: () => void;
};

const riskClassNames: Record<string, string> = {
  low: styles.nodeLow,
  medium: styles.nodeMedium,
  high: styles.nodeHigh,
  critical: styles.nodeCritical,
};

const decisionLabels: Record<ReviewDecision, string> = {
  ok: "OK",
  discuss: "Discuss",
  unknown: "Unreviewed",
};

const stateLabels: Record<string, string> = {
  review_requested: "Review requested",
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};

const analysisStatusLabels: Record<string, string> = {
  pending: "Analysis pending",
  running: "Analysis running",
  succeeded: "Analysis complete",
  failed: "Analysis failed",
};

function riskClassName(riskLevel: string) {
  return riskClassNames[riskLevel] ?? styles.nodeLow;
}

function sortNodes(nodes: ReviewCanvasNode[]) {
  return [...nodes].sort((left, right) => left.reviewOrder - right.reviewOrder);
}

function edgeEndpoints(edge: ReviewCanvas["edges"][number]) {
  return {
    from: edge.from ?? edge.sourceNodeId ?? "",
    to: edge.to ?? edge.targetNodeId ?? "",
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function defaultEmptyAnalysis(pullRequest: PullRequestSummary): ReviewAnalysis {
  return {
    id: `pending-${pullRequest.id}`,
    analysisStatus: "pending",
    riskLevel: "low",
    purposeSummary: null,
    impactSummary: null,
    testRecommendation: null,
    conclusion: null,
    reviewNotes: [],
  };
}

function defaultEmptyCanvas(): ReviewCanvas {
  return {
    intentSummary: "Open a review room to load the review graph.",
    reviewStrategy: "The runtime Review API will provide the node order.",
    nodes: [],
    edges: [],
  };
}

export function createReviewSelectorSession(
  pullRequest: PullRequestSummary,
): ReviewSession {
  return {
    pullRequest,
    linkedTasks: [],
    analysis: defaultEmptyAnalysis(pullRequest),
    canvas: defaultEmptyCanvas(),
    changedFiles: [],
    checklistItems: [],
    comments: [],
  };
}

export function ReviewNodeWorkspace({
  sessions,
  status = "selecting",
  warnings = [],
  selectedSessionId,
  selectedNodeId,
  busyAction = null,
  commentDraft,
  onCommentDraftChange,
  onSelectSession,
  onBackToSelector,
  onSelectNode,
  onNodeDecision,
  onAddChecklistItem,
  onToggleChecklistItem,
  onAddComment,
}: ReviewNodeWorkspaceProps) {
  const [internalSelectedSessionId, setInternalSelectedSessionId] = useState<
    string | null
  >(null);
  const [internalSelectedNodeId, setInternalSelectedNodeId] = useState<
    string | null
  >(null);
  const [highlightedHunkId, setHighlightedHunkId] = useState<string | null>(
    null,
  );
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(
    {},
  );
  const [internalCommentDraft, setInternalCommentDraft] = useState("");
  const [contextPanelWidth, setContextPanelWidth] = useState(460);

  const activeSessionId =
    selectedSessionId === undefined
      ? internalSelectedSessionId
      : selectedSessionId;
  const activeNodeId =
    selectedNodeId === undefined ? internalSelectedNodeId : selectedNodeId;
  const activeCommentDraft =
    commentDraft === undefined ? internalCommentDraft : commentDraft;

  const selectedSession =
    sessions.find((session) => session.pullRequest.id === activeSessionId) ??
    null;

  const sortedNodes = useMemo(
    () => sortNodes(selectedSession?.canvas.nodes ?? []),
    [selectedSession],
  );

  const selectedNode = useMemo(() => {
    if (!selectedSession) {
      return null;
    }

    return (
      selectedSession.canvas.nodes.find((node) => node.id === activeNodeId) ??
      null
    );
  }, [activeNodeId, selectedSession]);

  const changedFiles = selectedSession?.changedFiles ?? [];
  const checklistItems = selectedSession?.checklistItems ?? [];
  const comments = selectedSession?.comments ?? [];
  const notes = selectedSession?.analysis.reviewNotes ?? [];
  const relevantChangedFiles = selectedNode?.filePath
    ? changedFiles.filter((file) => file.filePath === selectedNode.filePath)
    : changedFiles;
  const relevantComments = selectedNode
    ? comments.filter(
        (comment) => comment.nodeId === null || comment.nodeId === selectedNode.id,
      )
    : comments;

  const selectSession = (session: ReviewSession) => {
    setInternalSelectedSessionId(session.pullRequest.id);
    setInternalSelectedNodeId(null);
    setHighlightedHunkId(null);
    onSelectSession?.(session);
  };

  const selectNode = (nodeId: string | null) => {
    setInternalSelectedNodeId(nodeId);
    setHighlightedHunkId(null);
    onSelectNode?.(nodeId);
  };

  const setDraft = (value: string) => {
    setInternalCommentDraft(value);
    onCommentDraftChange?.(value);
  };

  const handleTopbarBack = () => {
    if (selectedNode) {
      selectNode(null);
      return;
    }

    setInternalSelectedSessionId(null);
    setInternalSelectedNodeId(null);
    setHighlightedHunkId(null);
    onBackToSelector?.();
  };

  const handleDecision = (decision: ReviewDecision) => {
    if (!selectedNode) {
      return;
    }

    setDecisions((current) => ({
      ...current,
      [selectedNode.id]: decision,
    }));
    onNodeDecision?.(decision);
  };

  const handleAddComment = () => {
    onAddComment?.();

    if (!onCommentDraftChange) {
      setInternalCommentDraft("");
    }
  };

  if (status === "loading") {
    return (
      <main className={styles.selectorPage}>
        <section className={styles.statusPanel} aria-live="polite">
          <strong>Loading review workspace</strong>
          <p>Preparing pull requests and the Review API client.</p>
        </section>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className={styles.selectorPage}>
        <section className={styles.statusPanel} role="alert">
          <strong>Review workspace could not load</strong>
          <p>Refresh after the app server is available.</p>
        </section>
      </main>
    );
  }

  if (!selectedSession) {
    return (
      <main className={styles.selectorPage}>
        <section className={styles.selectorPanel} aria-label="PR selector">
          <div className={styles.selectorHeader}>
            <span className={styles.eyebrow}>CODE REVIEW</span>
            <h1>Select a pull request</h1>
          </div>

          {warnings.length ? (
            <div className={styles.noticeList} aria-label="Review notices">
              {warnings.slice(-3).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className={styles.selectorList}>
            {sessions.length === 0 ? (
              <article className={styles.emptyState}>
                <strong>No pull requests found</strong>
                <p>
                  Connect or sync GitHub pull requests before opening a review
                  room.
                </p>
              </article>
            ) : null}

            {sessions.map((session) => (
              <button
                className={styles.selectorItem}
                disabled={status === "opening"}
                key={session.pullRequest.id}
                onClick={() => selectSession(session)}
                type="button"
              >
                <span className={styles.number}>
                  #{session.pullRequest.number}
                </span>
                <strong>{session.pullRequest.title}</strong>
                <small>
                  {session.pullRequest.authorLogin ?? "unknown"} /{" "}
                  {stateLabels[session.pullRequest.state] ??
                    session.pullRequest.state}{" "}
                  / {session.pullRequest.changedFilesCount} files
                </small>
                <small className={styles.branchLine}>
                  {session.pullRequest.branch} into{" "}
                  {session.pullRequest.baseBranch}
                </small>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const { analysis, canvas, linkedTasks, pullRequest } = selectedSession;

  return (
    <main className={styles.reviewApp}>
      <header className={styles.topbar}>
        <button
          className={styles.topbarBack}
          onClick={handleTopbarBack}
          type="button"
        >
          {selectedNode ? "Canvas" : "Pull requests"}
        </button>
        <div className={styles.topbarGroup}>
          <span>BRANCH</span>
          <strong>
            {pullRequest.branch} into {pullRequest.baseBranch}
          </strong>
        </div>
        <div className={styles.topbarGroup}>
          <span>PR</span>
          <strong>
            #{pullRequest.number} {pullRequest.title}
          </strong>
        </div>
        <button className={styles.mergeButton} disabled type="button">
          Merge
        </button>
      </header>

      {selectedNode ? (
        <section className={styles.detailWorkspace}>
          <div className={styles.diffPane} aria-label="Changed files">
            <div className={styles.diffTitle}>
              <span className={styles.eyebrow}>SELECTED NODE</span>
              <strong>{selectedNode.filePath ?? selectedNode.label}</strong>
            </div>

            <div className={styles.changedFileStack}>
              {selectedNode.detail?.diffHunks.map((hunk) => (
                <section
                  className={
                    highlightedHunkId === hunk.id
                      ? `${styles.diffHunk} ${styles.diffHunkActive}`
                      : styles.diffHunk
                  }
                  id={hunk.id}
                  key={hunk.id}
                >
                  <div className={styles.diffColumn}>
                    <div className={styles.diffColumnHead}>
                      <span>Before</span>
                      <small>L{hunk.oldStartLine}</small>
                    </div>
                    <pre>
                      <code>{hunk.oldCode}</code>
                    </pre>
                  </div>
                  <div className={styles.diffColumn}>
                    <div className={styles.diffColumnHead}>
                      <span>After</span>
                      <small>L{hunk.newStartLine}</small>
                    </div>
                    <pre>
                      <code>{hunk.newCode}</code>
                    </pre>
                  </div>
                </section>
              ))}

              {selectedNode.detail?.diffHunks.length ? null : (
                <>
                  {relevantChangedFiles.length ? (
                    relevantChangedFiles.map((file) => (
                      <article className={styles.changedFileCard} key={file.id}>
                        <div>
                          <strong>{file.filePath}</strong>
                          <span>
                            {file.changeType} +{file.additions} -{file.deletions}
                          </span>
                        </div>
                        {file.summary ? <p>{file.summary}</p> : null}
                        {file.functions.length ? (
                          <ul>
                            {file.functions.map((fn) => (
                              <li key={fn.id}>
                                <b>{fn.name}</b>
                                {fn.summary ? <span>{fn.summary}</span> : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <article className={styles.emptyState}>
                      <strong>No changed files for this node</strong>
                      <p>
                        The Review API returned a graph node without matching
                        changed-file detail.
                      </p>
                    </article>
                  )}
                </>
              )}
            </div>
          </div>

          <aside className={styles.detailSidePanel} aria-label="Node review">
            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>NODE</span>
              <h2>{selectedNode.label}</h2>
              <span
                className={`${styles.riskPill} ${riskClassName(
                  selectedNode.riskLevel,
                )}`}
              >
                {selectedNode.riskLevel}
              </span>
            </section>

            <section className={styles.sideSection}>
              <h3>Role in this review</h3>
              <p>{selectedNode.roleSummary}</p>
            </section>

            <section className={styles.sideSection}>
              <h3>Reason to inspect</h3>
              <p>
                {selectedNode.detail?.modificationReason ??
                  selectedNode.reviewReason ??
                  "The runtime graph marked this node as part of the review order."}
              </p>
            </section>

            {selectedNode.detail?.changeGroups.length ? (
              <section className={styles.sideSection}>
                <h3>Code areas</h3>
                <div className={styles.changeGroups}>
                  {selectedNode.detail.changeGroups.map((group) => (
                    <article className={styles.changeGroup} key={group.id}>
                      <strong>{group.title}</strong>
                      <p>{group.summary}</p>
                      <div className={styles.changeGroupActions}>
                        <button
                          onClick={() => setHighlightedHunkId(group.diffHunkId)}
                          type="button"
                        >
                          Show code
                        </button>
                        <span>
                          L{group.newStartLine}-L{group.newEndLine}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className={styles.sideSection}>
              <h3>Comments</h3>
              <div className={styles.commentList}>
                {relevantComments.length ? (
                  relevantComments.map((comment) => (
                    <article key={comment.id}>
                      <p>{comment.body}</p>
                      <time dateTime={comment.createdAt}>
                        {formatDateTime(comment.createdAt)}
                      </time>
                    </article>
                  ))
                ) : (
                  <p>No comments yet.</p>
                )}
              </div>
              <div className={styles.commentComposer}>
                <textarea
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Leave a review note"
                  rows={3}
                  value={activeCommentDraft}
                />
                <button
                  disabled={busyAction === "comment" || !activeCommentDraft.trim()}
                  onClick={handleAddComment}
                  type="button"
                >
                  Comment
                </button>
              </div>
            </section>

            <div className={styles.decisionBar}>
              {(Object.keys(decisionLabels) as ReviewDecision[]).map(
                (decision) => (
                  <button
                    className={
                      (decisions[selectedNode.id] ?? selectedNode.status) ===
                      decision
                        ? `${styles.decisionButton} ${styles.decisionButtonActive}`
                        : styles.decisionButton
                    }
                    disabled={busyAction === "node"}
                    key={decision}
                    onClick={() => handleDecision(decision)}
                    type="button"
                  >
                    {decisionLabels[decision]}
                  </button>
                ),
              )}
            </div>
          </aside>
        </section>
      ) : (
        <section
          aria-label="Review canvas"
          className={styles.canvasWorkspace}
          style={
            {
              "--context-panel-width": `${contextPanelWidth}px`,
            } as CSSProperties
          }
        >
          <div className={styles.canvasStage}>
            <svg
              aria-hidden="true"
              className={styles.edgeLayer}
              viewBox="0 0 920 660"
            >
              <defs>
                <marker
                  id="review-arrow"
                  markerHeight="8"
                  markerWidth="8"
                  orient="auto"
                  refX="7"
                  refY="4"
                >
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>
              {canvas.edges.map((edge, index) => {
                const { from, to } = edgeEndpoints(edge);
                const fromNode = canvas.nodes.find((node) => node.id === from);
                const toNode = canvas.nodes.find((node) => node.id === to);

                if (!fromNode || !toNode) {
                  return null;
                }

                return (
                  <line
                    key={edge.id ?? `${from}-${to}-${index}`}
                    markerEnd="url(#review-arrow)"
                    x1={fromNode.position.x + 125}
                    x2={toNode.position.x + 125}
                    y1={fromNode.position.y + 44}
                    y2={toNode.position.y + 44}
                  />
                );
              })}
            </svg>

            {sortedNodes.length ? (
              sortedNodes.map((node) => (
                <button
                  className={`${styles.canvasNode} ${riskClassName(
                    node.riskLevel,
                  )}`}
                  key={node.id}
                  onClick={() => selectNode(node.id)}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                  }}
                  type="button"
                >
                  <span>{node.reviewOrder}</span>
                  <strong>{node.label}</strong>
                  <small>
                    {node.nodeType}
                    {decisions[node.id] ?? node.status
                      ? ` / ${
                          decisionLabels[
                            decisions[node.id] ?? node.status ?? "unknown"
                          ]
                        }`
                      : ""}
                  </small>
                </button>
              ))
            ) : (
              <article className={styles.canvasEmptyState}>
                <strong>No graph nodes yet</strong>
                <p>
                  Analysis exists, but the Review API has not returned a
                  populated canvas graph.
                </p>
              </article>
            )}
          </div>

          <button
            aria-label="Resize PR context panel"
            aria-valuemax={620}
            aria-valuemin={360}
            aria-valuenow={contextPanelWidth}
            className={styles.panelResizeHandle}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                setContextPanelWidth((current) => Math.min(620, current + 24));
              }

              if (event.key === "ArrowRight") {
                setContextPanelWidth((current) => Math.max(360, current - 24));
              }
            }}
            onPointerDown={(event) => {
              event.preventDefault();

              const startX = event.clientX;
              const startWidth = contextPanelWidth;

              const handlePointerMove = (moveEvent: PointerEvent) => {
                const dragDistance = moveEvent.clientX - startX;

                setContextPanelWidth(
                  Math.min(620, Math.max(360, startWidth - dragDistance)),
                );
              };

              const handlePointerUp = () => {
                window.removeEventListener("pointermove", handlePointerMove);
                window.removeEventListener("pointerup", handlePointerUp);
              };

              window.addEventListener("pointermove", handlePointerMove);
              window.addEventListener("pointerup", handlePointerUp, {
                once: true,
              });
            }}
            role="separator"
            title="Drag to resize the PR context panel"
            type="button"
          />

          <aside className={styles.sidePanel}>
            {warnings.length ? (
              <section
                className={`${styles.sideSection} ${styles.noticeList}`}
                aria-label="Review notices"
              >
                <span className={styles.eyebrow}>NOTICES</span>
                {warnings.slice(-3).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </section>
            ) : null}

            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>PR INTENT</span>
              <h2>{canvas.intentSummary}</h2>
              <p>{canvas.reviewStrategy}</p>
            </section>

            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>AI ANALYSIS</span>
              <div className={styles.sectionTitleRow}>
                <h3>
                  {analysisStatusLabels[analysis.analysisStatus] ??
                    analysis.analysisStatus}
                </h3>
                <span
                  className={`${styles.riskPill} ${riskClassName(
                    analysis.riskLevel,
                  )}`}
                >
                  {analysis.riskLevel}
                </span>
              </div>
              {analysis.purposeSummary ? <p>{analysis.purposeSummary}</p> : null}
              {analysis.impactSummary ? <p>{analysis.impactSummary}</p> : null}
              {analysis.testRecommendation ? (
                <p>{analysis.testRecommendation}</p>
              ) : null}
              {analysis.conclusion ? <p>{analysis.conclusion}</p> : null}
            </section>

            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>REVIEW ORDER</span>
              {sortedNodes.length ? (
                <ol className={styles.reviewOrder}>
                  {sortedNodes.map((node) => (
                    <li key={node.id}>{node.roleSummary}</li>
                  ))}
                </ol>
              ) : (
                <p>No review nodes are available yet.</p>
              )}
            </section>

            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>CHANGED FILES</span>
              <div className={styles.fileList}>
                {changedFiles.length ? (
                  changedFiles.map((file) => (
                    <article className={styles.fileItem} key={file.id}>
                      <strong>{file.filePath}</strong>
                      <span>
                        {file.changeType} +{file.additions} -{file.deletions}
                      </span>
                      {file.functions.map((fn) => (
                        <small key={fn.id}>{fn.name}</small>
                      ))}
                    </article>
                  ))
                ) : (
                  <p>No changed files were returned.</p>
                )}
              </div>
            </section>

            <section className={styles.sideSection}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.eyebrow}>CHECKLIST</span>
                <button
                  className={styles.inlineActionButton}
                  disabled={busyAction === "checklist"}
                  onClick={onAddChecklistItem}
                  type="button"
                >
                  Add
                </button>
              </div>
              <div className={styles.checklist}>
                {checklistItems.length ? (
                  checklistItems.map((item) => (
                    <label key={item.id}>
                      <input
                        checked={item.status === "done"}
                        disabled={busyAction === "checklist"}
                        onChange={() => onToggleChecklistItem?.(item)}
                        type="checkbox"
                      />
                      <span>{item.title}</span>
                    </label>
                  ))
                ) : (
                  <p>No checklist items yet.</p>
                )}
              </div>
            </section>

            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>LINKED TASKS</span>
              {linkedTasks.length > 0 ? (
                <div className={styles.linkedTasks}>
                  {linkedTasks.map((task) => (
                    <article className={styles.linkedTask} key={task.id}>
                      <span>{task.priority}</span>
                      <strong>{task.title}</strong>
                      <small>{task.status}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No linked tasks were returned.</p>
              )}
            </section>

            {notes.length ? (
              <section className={styles.sideSection}>
                <span className={styles.eyebrow}>NOTES</span>
                <ul className={styles.noteList}>
                  {notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </section>
      )}
    </main>
  );
}
