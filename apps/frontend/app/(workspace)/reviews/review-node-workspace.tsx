"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type ReviewDecision = "ok" | "discuss" | "unknown";

export type PullRequestSummary = {
  id: string;
  number: number;
  title: string;
  authorLogin: string;
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
  purposeSummary: string;
  impactSummary: string;
  testRecommendation: string;
  conclusion: string;
  reviewNotes: string[];
};

type ReviewCanvasNode = {
  id: string;
  label: string;
  nodeType: string;
  riskLevel: string;
  reviewOrder: number;
  roleSummary: string;
  position: { x: number; y: number };
  detail: {
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
  edges: Array<{ from: string; to: string }>;
};

export type ReviewSession = {
  pullRequest: PullRequestSummary;
  linkedTasks: ReviewTask[];
  analysis: ReviewAnalysis;
  canvas: ReviewCanvas;
};

const riskClassNames: Record<string, string> = {
  low: styles.nodeLow,
  medium: styles.nodeMedium,
  high: styles.nodeHigh,
  critical: styles.nodeCritical,
};

const decisionLabels: Record<ReviewDecision, string> = {
  ok: "문제 없음",
  discuss: "논의 필요",
  unknown: "판단 불가",
};

const stateLabels: Record<string, string> = {
  review_requested: "리뷰 요청",
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};

const analysisStatusLabels: Record<string, string> = {
  pending: "분석 대기",
  running: "분석 중",
  succeeded: "분석 완료",
  failed: "분석 실패",
};

export function ReviewNodeWorkspace({
  sessions,
}: {
  sessions: ReviewSession[];
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedHunkId, setHighlightedHunkId] = useState<string | null>(
    null,
  );
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(
    {},
  );

  const selectedSession =
    sessions.find((session) => session.pullRequest.id === selectedSessionId) ??
    null;

  const selectedNode = useMemo(() => {
    if (!selectedSession) {
      return null;
    }

    return (
      selectedSession.canvas.nodes.find((node) => node.id === selectedNodeId) ??
      null
    );
  }, [selectedNodeId, selectedSession]);

  if (!selectedSession) {
    return (
      <main className={styles.selectorPage}>
        <section className={styles.selectorPanel} aria-label="PR selector">
          <div className={styles.selectorHeader}>
            <span className={styles.eyebrow}>CODE REVIEW</span>
            <h1>리뷰할 PR을 선택</h1>
          </div>

          <div className={styles.selectorList}>
            {sessions.map((session) => (
              <button
                className={styles.selectorItem}
                key={session.pullRequest.id}
                onClick={() => {
                  setSelectedSessionId(session.pullRequest.id);
                  setSelectedNodeId(null);
                  setHighlightedHunkId(null);
                }}
                type="button"
              >
                <span className={styles.number}>
                  #{session.pullRequest.number}
                </span>
                <strong>{session.pullRequest.title}</strong>
                <small>
                  {session.pullRequest.authorLogin} ·{" "}
                  {stateLabels[session.pullRequest.state]} ·{" "}
                  {session.pullRequest.changedFilesCount} files
                </small>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const { analysis, canvas, linkedTasks, pullRequest } = selectedSession;

  const handleTopbarBack = () => {
    if (selectedNode) {
      setSelectedNodeId(null);
      setHighlightedHunkId(null);
      return;
    }

    setSelectedSessionId(null);
  };

  return (
    <main className={styles.reviewApp}>
      <header className={styles.topbar}>
        <button
          className={styles.topbarBack}
          onClick={handleTopbarBack}
          type="button"
        >
          {selectedNode ? "← 워크플로우" : "← PR 선택"}
        </button>
        <div className={styles.topbarGroup}>
          <span>BRANCH</span>
          <strong>
            {pullRequest.branch} → {pullRequest.baseBranch}
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
          <div className={styles.diffPane} aria-label="Code diff">
            <div className={styles.diffTitle}>
              <span className={styles.eyebrow}>SELECTED FILE</span>
              <strong>{selectedNode.detail.filePath}</strong>
            </div>

            <div className={styles.diffHunks}>
              {selectedNode.detail.diffHunks.map((hunk) => (
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
                      <span>이전 코드</span>
                      <small>L{hunk.oldStartLine}</small>
                    </div>
                    <pre>
                      <code>{hunk.oldCode}</code>
                    </pre>
                  </div>
                  <div className={styles.diffColumn}>
                    <div className={styles.diffColumnHead}>
                      <span>변경 코드</span>
                      <small>L{hunk.newStartLine}</small>
                    </div>
                    <pre>
                      <code>{hunk.newCode}</code>
                    </pre>
                  </div>
                </section>
              ))}
            </div>
          </div>

          <aside className={styles.detailSidePanel} aria-label="Node review">
            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>NODE</span>
              <h2>{selectedNode.label}</h2>
              <span
                className={`${styles.riskPill} ${riskClassNames[selectedNode.riskLevel]}`}
              >
                {selectedNode.riskLevel}
              </span>
            </section>

            <section className={styles.sideSection}>
              <h3>이 노드의 역할</h3>
              <p>{selectedNode.roleSummary}</p>
            </section>

            <section className={styles.sideSection}>
              <h3>이 PR에서 수정한 이유</h3>
              <p>{selectedNode.detail.modificationReason}</p>
            </section>

            <section className={styles.sideSection}>
              <h3>실제 수정된 부분</h3>
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
                        코드 보기
                      </button>
                      <span>
                        L{group.newStartLine}-L{group.newEndLine}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className={styles.decisionBar}>
              {(Object.keys(decisionLabels) as ReviewDecision[]).map(
                (decision) => (
                  <button
                    className={
                      decisions[selectedNode.id] === decision
                        ? `${styles.decisionButton} ${styles.decisionButtonActive}`
                        : styles.decisionButton
                    }
                    key={decision}
                    onClick={() => {
                      setDecisions((current) => ({
                        ...current,
                        [selectedNode.id]: decision,
                      }));
                      setSelectedNodeId(null);
                      setHighlightedHunkId(null);
                    }}
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
        <section className={styles.canvasWorkspace} aria-label="Review canvas">
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
              {canvas.edges.map((edge) => {
                const fromNode = canvas.nodes.find(
                  (node) => node.id === edge.from,
                );
                const toNode = canvas.nodes.find((node) => node.id === edge.to);

                if (!fromNode || !toNode) {
                  return null;
                }

                return (
                  <line
                    key={`${edge.from}-${edge.to}`}
                    markerEnd="url(#review-arrow)"
                    x1={fromNode.position.x + 125}
                    x2={toNode.position.x + 125}
                    y1={fromNode.position.y + 44}
                    y2={toNode.position.y + 44}
                  />
                );
              })}
            </svg>

            {canvas.nodes.map((node) => (
              <button
                className={`${styles.canvasNode} ${riskClassNames[node.riskLevel]}`}
                key={node.id}
                onClick={() => {
                  setSelectedNodeId(node.id);
                  setHighlightedHunkId(null);
                }}
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
                  {decisions[node.id]
                    ? ` · ${decisionLabels[decisions[node.id]]}`
                    : ""}
                </small>
              </button>
            ))}
          </div>

          <aside className={styles.sidePanel}>
            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>PR INTENT</span>
              <h2>{canvas.intentSummary}</h2>
              <p>{canvas.reviewStrategy}</p>
            </section>

            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>AI ANALYSIS</span>
              <div className={styles.sectionTitleRow}>
                <h3>{analysisStatusLabels[analysis.analysisStatus]}</h3>
                <span
                  className={`${styles.riskPill} ${riskClassNames[analysis.riskLevel]}`}
                >
                  {analysis.riskLevel}
                </span>
              </div>
              <p>{analysis.purposeSummary}</p>
              <p>{analysis.impactSummary}</p>
              <p>{analysis.testRecommendation}</p>
              <p>{analysis.conclusion}</p>
            </section>

            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>REVIEW ORDER</span>
              <ol className={styles.reviewOrder}>
                {canvas.nodes.map((node) => (
                  <li key={node.id}>{node.roleSummary}</li>
                ))}
              </ol>
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
                <p>연결된 task가 없습니다.</p>
              )}
            </section>

            <section className={styles.sideSection}>
              <span className={styles.eyebrow}>NOTES</span>
              <ul className={styles.noteList}>
                {analysis.reviewNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          </aside>
        </section>
      )}
    </main>
  );
}
