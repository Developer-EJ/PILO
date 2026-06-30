"use client";

import Link from "next/link";
import { meetingStatusLabel } from "../../lib/meeting/meetingLabels";
import type {
  MeetingRecord,
  MeetingReportSummary,
} from "../../lib/meeting/meetingTypes";
import styles from "./meeting.module.css";

export type MeetingView = "meeting" | "voice" | "report";

const viewLabels: Array<{
  key: MeetingView;
  label: string;
  description: string;
}> = [
  {
    key: "meeting",
    label: "회의",
    description: "아젠다, 메모, 전사",
  },
  {
    key: "voice",
    label: "음성",
    description: "방, 세션, 녹음",
  },
  {
    key: "report",
    label: "리포트",
    description: "결정, 리스크, 후속 작업",
  },
];

function compactDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MeetingSidebar({
  activeView,
  homeHref,
  meetings,
  onRefresh,
  onSelectMeeting,
  onViewChange,
  recentReports,
  selectedMeetingId,
  workspaceId,
}: {
  activeView: MeetingView;
  homeHref: string;
  meetings: MeetingRecord[];
  onRefresh: () => void;
  onSelectMeeting: (meetingId: string) => void;
  onViewChange: (view: MeetingView) => void;
  recentReports: MeetingReportSummary[];
  selectedMeetingId: string | null;
  workspaceId: string;
}) {
  return (
    <aside className={styles.domainSidebar} aria-label="회의 보조 탐색">
      <div className={styles.sideBrand}>
        <strong>회의 작업</strong>
        <span>음성, 전사, 리포트</span>
      </div>

      <nav className={styles.domainNav} aria-label="회의 작업 보기">
        {viewLabels.map((item) => (
          <button
            aria-current={activeView === item.key ? "page" : undefined}
            className={
              activeView === item.key
                ? `${styles.domainNavItem} ${styles.domainNavItemActive}`
                : styles.domainNavItem
            }
            key={item.key}
            onClick={() => onViewChange(item.key)}
            type="button"
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        ))}
      </nav>

      <div className={styles.sideActions}>
        <Link className={styles.homeLink} href={homeHref}>
          워크스페이스 홈
        </Link>
        <button className={styles.secondaryButton} onClick={onRefresh} type="button">
          새로고침
        </button>
      </div>

      <section className={styles.sideSection} aria-label="워크스페이스 범위">
        <span className={styles.sectionKicker}>워크스페이스</span>
        <code>{workspaceId}</code>
      </section>

      <section className={styles.sideSection} aria-label="회의 목록">
        <div className={styles.sideSectionHeader}>
          <span className={styles.sectionKicker}>회의 목록</span>
          <b>{meetings.length}</b>
        </div>
        <div className={styles.meetingList}>
          {meetings.length ? (
            meetings.map((meeting) => (
              <button
                className={
                  meeting.id === selectedMeetingId
                    ? `${styles.meetingListItem} ${styles.meetingListItemActive}`
                    : styles.meetingListItem
                }
                key={meeting.id}
                onClick={() => onSelectMeeting(meeting.id)}
                type="button"
              >
                <strong>{meeting.title}</strong>
                <span>{meetingStatusLabel(meeting.status)}</span>
                <small>{compactDate(meeting.startedAt ?? meeting.createdAt)}</small>
              </button>
            ))
          ) : (
            <p className={styles.emptyText}>회의가 아직 없습니다.</p>
          )}
        </div>
      </section>

      <section className={styles.sideSection} aria-label="최근 리포트">
        <div className={styles.sideSectionHeader}>
          <span className={styles.sectionKicker}>최근 리포트</span>
          <b>{recentReports.length}</b>
        </div>
        <div className={styles.reportMiniList}>
          {recentReports.slice(0, 3).map((report) => (
            <button
              className={styles.reportMiniItem}
              key={report.id}
              onClick={() => {
                onSelectMeeting(report.meetingId);
                onViewChange("report");
              }}
              type="button"
            >
              <strong>{report.title}</strong>
              <span>
                결정 {report.decisionCount}개 · 후속 작업 {report.actionItemCount}개 ·
                리스크 {report.riskCount}개
              </span>
            </button>
          ))}
          {!recentReports.length ? (
            <p className={styles.emptyText}>생성된 리포트가 없습니다.</p>
          ) : null}
        </div>
      </section>
    </aside>
  );
}
