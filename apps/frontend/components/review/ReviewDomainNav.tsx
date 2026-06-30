"use client";

import styles from "./ReviewWorkspace.module.css";

export type ReviewView = "prs" | "analysis" | "files" | "graph" | "artifacts";

const navItems: Array<{
  id: ReviewView;
  label: string;
  description: string;
}> = [
  {
    id: "prs",
    label: "PR 선택",
    description: "리뷰할 PR 고르기",
  },
  {
    id: "analysis",
    label: "분석",
    description: "요약과 실행 상태",
  },
  {
    id: "files",
    label: "변경 파일",
    description: "검색과 필터",
  },
  {
    id: "graph",
    label: "리뷰 그래프",
    description: "노드 판단 저장",
  },
  {
    id: "artifacts",
    label: "아티팩트",
    description: "코멘트와 체크리스트",
  },
];

export function ReviewDomainNav({
  activeView,
  hasSelection,
  onViewChange,
}: {
  activeView: ReviewView;
  hasSelection: boolean;
  onViewChange: (view: ReviewView) => void;
}) {
  return (
    <nav className={styles.domainNav} aria-label="리뷰 작업 영역 탭">
      {navItems.map((item) => {
        const disabled = item.id !== "prs" && !hasSelection;

        return (
          <button
            aria-current={activeView === item.id ? "page" : undefined}
            className={
              activeView === item.id
                ? `${styles.navButton} ${styles.navButtonActive}`
                : styles.navButton
            }
            disabled={disabled}
            key={item.id}
            onClick={() => onViewChange(item.id)}
            type="button"
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        );
      })}
    </nav>
  );
}
