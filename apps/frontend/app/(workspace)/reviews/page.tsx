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
    title: "Implement Google/GitHub login",
    status: "in_progress",
    priority: "high",
  },
];

const analysis = {
  id: "88888888-8888-4888-8888-888888888881",
  analysisStatus: "succeeded",
  riskLevel: "medium",
  purposeSummary: "Adds an OAuth callback page and redirect handling.",
  impactSummary: "Auth routes and session redirect flow are affected.",
  testRecommendation: "Verify success and failure redirect smoke tests.",
  okCount: 3,
  discussCount: 1,
  riskCount: 1,
  conclusion: "Ready to merge after reviewer confirmation.",
};

const stateLabels: Record<string, string> = {
  review_requested: "Review requested",
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};

const analysisStatusLabels: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
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
            Request analysis
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
                    {selectedPullRequest.branch} -&gt;{" "}
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
          </section>
        </section>
      </div>
    </main>
  );
}
