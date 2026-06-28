"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type ReviewDecision = "ok" | "discuss" | "unknown";

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

type ReviewCanvas = {
  intentSummary: string;
  reviewStrategy: string;
  nodes: ReviewCanvasNode[];
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

export function ReviewNodeWorkspace({
  reviewCanvas,
}: {
  reviewCanvas: ReviewCanvas;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(
    {},
  );
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(
    null,
  );

  const selectedNode = useMemo(
    () => reviewCanvas.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [reviewCanvas.nodes, selectedNodeId],
  );

  if (selectedNode) {
    return (
      <section className={styles.detailPanel} aria-label="Review node detail">
        <div className={styles.detailHeader}>
          <button
            className={styles.backButton}
            onClick={() => setSelectedNodeId(null)}
            type="button"
          >
            ← 선택 파일: {selectedNode.detail.filePath}
          </button>
          <span
            className={`${styles.pill} ${riskClassNames[selectedNode.riskLevel]}`}
          >
            {selectedNode.riskLevel}
          </span>
        </div>

        <div className={styles.detailGrid}>
          <div className={styles.diffViewer}>
            {selectedNode.detail.diffHunks.map((hunk) => (
              <div
                className={
                  highlightedGroupId
                    ? `${styles.diffHunk} ${styles.diffHunkActive}`
                    : styles.diffHunk
                }
                key={hunk.id}
              >
                <div className={styles.diffColumn}>
                  <span className={styles.caption}>이전 코드</span>
                  <pre>
                    <code>{hunk.oldCode}</code>
                  </pre>
                </div>
                <div className={styles.diffColumn}>
                  <span className={styles.caption}>변경 코드</span>
                  <pre>
                    <code>{hunk.newCode}</code>
                  </pre>
                </div>
              </div>
            ))}
          </div>

          <aside className={styles.explainPanel}>
            <section>
              <h2>이 노드의 역할</h2>
              <p>{selectedNode.roleSummary}</p>
            </section>
            <section>
              <h2>이 PR에서 수정한 이유</h2>
              <p>{selectedNode.detail.modificationReason}</p>
            </section>
            <section>
              <h2>실제 수정된 부분</h2>
              <div className={styles.changeGroups}>
                {selectedNode.detail.changeGroups.map((group) => (
                  <article className={styles.changeGroup} key={group.id}>
                    <strong>{group.title}</strong>
                    <p>{group.summary}</p>
                    <button
                      onClick={() => setHighlightedGroupId(group.id)}
                      type="button"
                    >
                      코드 보기
                    </button>
                    <span>
                      L{group.newStartLine}-L{group.newEndLine}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <div className={styles.decisionBar}>
          {(Object.keys(decisionLabels) as ReviewDecision[]).map((decision) => (
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
              }}
              type="button"
            >
              {decisionLabels[decision]}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.canvasPanel} aria-label="Review canvas">
      <div className={styles.canvas}>
        {reviewCanvas.nodes.map((node) => (
          <button
            className={`${styles.canvasNode} ${riskClassNames[node.riskLevel]}`}
            key={node.id}
            onClick={() => {
              setHighlightedGroupId(null);
              setSelectedNodeId(node.id);
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

      <aside className={styles.intentPanel}>
        <span className={styles.eyebrow}>PR intent</span>
        <h2>{reviewCanvas.intentSummary}</h2>
        <p>{reviewCanvas.reviewStrategy}</p>
        <ol className={styles.reviewOrder}>
          {reviewCanvas.nodes.map((node) => (
            <li key={node.id}>
              <strong>{node.reviewOrder}. </strong>
              {node.roleSummary}
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}
