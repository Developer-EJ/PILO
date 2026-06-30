import Link from "next/link";
import styles from "./agent-workspace.module.css";

type AgentWorkspaceNavProps = {
  active: "planning" | "agent";
  workspaceId?: string;
};

function workspaceScopedHref(workspaceId: string | undefined, segment: string) {
  return workspaceId
    ? `/workspaces/${encodeURIComponent(workspaceId)}/${segment}`
    : `/${segment}`;
}

export function AgentWorkspaceNav({
  active,
  workspaceId,
}: AgentWorkspaceNavProps) {
  const planningHref = workspaceScopedHref(workspaceId, "planning");
  const agentHref = workspaceScopedHref(workspaceId, "agent");

  return (
    <nav className={styles.domainNav} aria-label="AI 에이전트와 계획 보조 메뉴">
      <Link
        aria-current={active === "planning" ? "page" : undefined}
        className={
          active === "planning" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
        }
        href={planningHref}
      >
        계획 초안
      </Link>
      <Link
        aria-current={active === "agent" ? "page" : undefined}
        className={
          active === "agent" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
        }
        href={agentHref}
      >
        실행 제안
      </Link>
    </nav>
  );
}
