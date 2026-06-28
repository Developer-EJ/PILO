import styles from "./page.module.css";

const pullRequests = [
  {
    id: "66666666-6666-4666-8666-666666666661",
    number: 7,
    title: "Add OAuth callback shell",
    authorLogin: "Developer-EJ",
    state: "review_requested",
    branch: "feature/donghyun/auth-login",
    baseBranch: "dev",
    changedFilesCount: 4,
    additions: 180,
    deletions: 12,
    linkedTaskIds: ["44444444-4444-4444-8444-444444444441"],
  },
  {
    id: "66666666-6666-4666-8666-666666666662",
    number: 8,
    title: "Persist review checklist items",
    authorLogin: "Developer-EJ",
    state: "open",
    branch: "feature/eunjae/review-checklist",
    baseBranch: "dev",
    changedFilesCount: 3,
    additions: 96,
    deletions: 18,
    linkedTaskIds: [],
  },
];

const selectedPullRequest = pullRequests[0];

const linkedTasks = [
  {
    id: "44444444-4444-4444-8444-444444444441",
    title: "Google/GitHub 로그인 구현",
    status: "in_progress",
    priority: "high",
  },
];

const analysis = {
  id: "88888888-8888-4888-8888-888888888881",
  analysisStatus: "succeeded",
  riskLevel: "medium",
  purposeSummary: "OAuth callback 화면 골격을 추가했다.",
  impactSummary: "Auth route와 session redirect flow에 영향이 있다.",
  testRecommendation: "성공/실패 redirect smoke test를 확인한다.",
  okCount: 3,
  discussCount: 1,
  riskCount: 1,
  conclusion: "리뷰 후 merge 가능",
};

const reviewCanvas = {
  intentSummary:
    "로그인 callback 진입점을 만들고 provider error 상태를 사용자에게 보여준다.",
  reviewStrategy:
    "라우트 진입점, callback 상태 해석, redirect 영향 순서로 확인한다.",
  nodes: [
    {
      id: "88888888-8888-4888-8888-888888888891",
      label: "apps/frontend/app/auth/callback/page.tsx",
      nodeType: "file",
      riskLevel: "medium",
      reviewOrder: 1,
      roleSummary:
        "OAuth provider가 돌려준 callback query를 읽어 성공/실패 화면으로 연결한다.",
      position: { x: 84, y: 72 },
    },
    {
      id: "88888888-8888-4888-8888-888888888892",
      label: "session redirect flow",
      nodeType: "impact",
      riskLevel: "low",
      reviewOrder: 2,
      roleSummary:
        "callback 결과가 기존 session redirect 흐름과 충돌하지 않는지 확인한다.",
      position: { x: 380, y: 190 },
    },
  ],
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

const riskClassNames: Record<string, string> = {
  low: styles.nodeLow,
  medium: styles.nodeMedium,
  high: styles.nodeHigh,
  critical: styles.nodeCritical,
};

export default function ReviewsPage() {
  const tasks = linkedTasks.filter((task) =>
    selectedPullRequest.linkedTaskIds.includes(task.id),
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <span className={styles.eyebrow}>CODE REVIEW</span>
            <h1>PR review queue</h1>
          </div>
          <button className={styles.primaryButton} type="button">
            분석 요청
          </button>
        </header>

        <section className={styles.workspace} aria-label="PR review queue">
          <aside className={styles.queue} aria-label="Pull request list">
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>Pull requests</span>
              <strong>{pullRequests.length}</strong>
            </div>

            <div className={styles.prList}>
              {pullRequests.map((pullRequest) => {
                const isSelected = pullRequest.id === selectedPullRequest.id;

                return (
                  <article
                    className={
                      isSelected
                        ? `${styles.prItem} ${styles.prItemSelected}`
                        : styles.prItem
                    }
                    key={pullRequest.id}
                  >
                    <div>
                      <span className={styles.number}>
                        #{pullRequest.number}
                      </span>
                      <strong>{pullRequest.title}</strong>
                    </div>
                    <div className={styles.meta}>
                      <span>{pullRequest.authorLogin}</span>
                      <span>{stateLabels[pullRequest.state]}</span>
                      <span>{pullRequest.changedFilesCount} files</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>

          <section className={styles.reviewPanel} id="analysis">
            <div className={styles.summary}>
              <div className={styles.prTitle}>
                <span className={styles.eyebrow}>Selected PR</span>
                <strong>
                  #{selectedPullRequest.number} {selectedPullRequest.title}
                </strong>
                <div className={styles.meta}>
                  <span>{selectedPullRequest.authorLogin}</span>
                  <span>{stateLabels[selectedPullRequest.state]}</span>
                  <span>
                    {selectedPullRequest.branch} →{" "}
                    {selectedPullRequest.baseBranch}
                  </span>
                </div>
              </div>

              <div className={styles.metrics}>
                <div className={styles.metric}>
                  <span className={styles.caption}>Additions</span>
                  <strong>+{selectedPullRequest.additions}</strong>
                </div>
                <div className={styles.metric}>
                  <span className={styles.caption}>Deletions</span>
                  <strong>-{selectedPullRequest.deletions}</strong>
                </div>
                <div className={styles.metric}>
                  <span className={styles.caption}>Risk</span>
                  <strong>{analysis.riskLevel}</strong>
                </div>
              </div>
            </div>

            <div className={styles.panelGrid}>
              <section className={styles.panel}>
                <div className={styles.panelTitle}>
                  <h2>AI analysis</h2>
                  <span className={`${styles.pill} ${styles.riskMedium}`}>
                    {analysisStatusLabels[analysis.analysisStatus]}
                  </span>
                </div>
                <p>{analysis.purposeSummary}</p>
                <p>{analysis.impactSummary}</p>
                <p>{analysis.testRecommendation}</p>
                <p>{analysis.conclusion}</p>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelTitle}>
                  <h2>Linked tasks</h2>
                  <span className={styles.pill}>{tasks.length}</span>
                </div>
                {tasks.map((task) => (
                  <article className={styles.task} key={task.id}>
                    <span className={styles.taskLabel}>{task.priority}</span>
                    <strong>{task.title}</strong>
                    <p>{task.status}</p>
                  </article>
                ))}
              </section>
            </div>

            <section className={styles.canvasPanel} aria-label="Review canvas">
              <div className={styles.canvas}>
                {reviewCanvas.nodes.map((node) => (
                  <button
                    className={`${styles.canvasNode} ${
                      riskClassNames[node.riskLevel]
                    }`}
                    key={node.id}
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                    }}
                    type="button"
                  >
                    <span>{node.reviewOrder}</span>
                    <strong>{node.label}</strong>
                    <small>{node.nodeType}</small>
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
          </section>
        </section>
      </div>
    </main>
  );
}
