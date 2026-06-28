import styles from "./page.module.css";

const pullRequest = {
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
};

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
  purposeSummary: "OAuth callback 화면 골격 추가",
  impactSummary: "Auth route와 session redirect flow에 영향",
  testRecommendation: "로그인 실패와 성공 redirect smoke test",
  okCount: 3,
  discussCount: 1,
  riskCount: 1,
  conclusion: "리뷰 가능",
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

export default function ReviewsPage() {
  const tasks = linkedTasks.filter((task) =>
    pullRequest.linkedTaskIds.includes(task.id),
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <span className={styles.eyebrow}>CODE REVIEW</span>
            <h1>Review room</h1>
          </div>
          <div className={styles.actions}>
            <span className={styles.pill}>
              {analysisStatusLabels[analysis.analysisStatus]}
            </span>
            <button className={styles.button} type="button">
              분석 요청
            </button>
          </div>
        </header>

        <section className={styles.grid} aria-label="Review room summary">
          <article className={styles.summary}>
            <div className={styles.prTitle}>
              <span className={styles.eyebrow}>PullRequestSummary</span>
              <strong>
                #{pullRequest.number} {pullRequest.title}
              </strong>
              <div className={styles.meta}>
                <span>{pullRequest.authorLogin}</span>
                <span>{stateLabels[pullRequest.state]}</span>
                <span>{pullRequest.changedFilesCount} files changed</span>
              </div>
            </div>

            <div className={styles.branchGrid}>
              <div className={styles.branchBox}>
                <span className={styles.label}>Branch</span>
                <code>{pullRequest.branch}</code>
              </div>
              <div className={styles.branchBox}>
                <span className={styles.label}>Base</span>
                <code>{pullRequest.baseBranch}</code>
              </div>
            </div>

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <span className={styles.caption}>Additions</span>
                <strong>+{pullRequest.additions}</strong>
              </div>
              <div className={styles.metric}>
                <span className={styles.caption}>Deletions</span>
                <strong>-{pullRequest.deletions}</strong>
              </div>
              <div className={styles.metric}>
                <span className={styles.caption}>Risk</span>
                <strong>{analysis.riskLevel}</strong>
              </div>
            </div>
          </article>

          <aside className={styles.side}>
            <section className={styles.panel}>
              <h2>Analysis summary</h2>
              <div className={styles.analysis}>
                <span className={`${styles.pill} ${styles.riskMedium}`}>
                  {analysis.riskLevel}
                </span>
                <p>{analysis.purposeSummary}</p>
                <p>{analysis.impactSummary}</p>
                <p>{analysis.testRecommendation}</p>
              </div>
            </section>

            <section className={styles.panel}>
              <h2>Linked tasks</h2>
              {tasks.map((task) => (
                <article className={styles.task} key={task.id}>
                  <span className={styles.taskLabel}>{task.priority}</span>
                  <strong>{task.title}</strong>
                  <p>{task.status}</p>
                </article>
              ))}
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
