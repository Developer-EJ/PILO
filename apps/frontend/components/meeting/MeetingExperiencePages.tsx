"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./meeting.module.css";

type ParticipantFixture = {
  id: string;
  initials: string;
  name: string;
  role: string;
  status: "speaking" | "muted" | "listening";
  tone: "blue" | "gray" | "green" | "dark";
};

type ReportFixture = {
  id: string;
  no: string;
  date: string;
  dateLabel: string;
  title: string;
  duration: string;
  summary: string;
  status: string;
  actionCount: number;
  participants: ParticipantFixture[];
};

const baseParticipants: ParticipantFixture[] = [
  {
    id: "alex",
    initials: "AL",
    name: "Alex Linderman",
    role: "Lead Designer",
    status: "speaking",
    tone: "blue",
  },
  {
    id: "sarah",
    initials: "SK",
    name: "Sarah Kinski",
    role: "DevOps",
    status: "muted",
    tone: "gray",
  },
  {
    id: "marcus",
    initials: "MJ",
    name: "Marcus Jenson",
    role: "Project Manager",
    status: "muted",
    tone: "gray",
  },
];

const reportFixtures: ReportFixture[] = [
  {
    id: "report-082",
    no: "#082",
    date: "2029. 09. 24",
    dateLabel: "Oct 24, 2023",
    title: "Sprint Planning: Q4 Infra",
    duration: "58m",
    summary: "v2.4 배포 범위와 인프라 점검 순서를 확정했습니다.",
    status: "AI Summary Ready",
    actionCount: 3,
    participants: [
      baseParticipants[0],
      baseParticipants[1],
      baseParticipants[2],
      {
        id: "jane",
        initials: "JN",
        name: "Jane Noel",
        role: "Frontend",
        status: "listening",
        tone: "green",
      },
    ],
  },
  {
    id: "report-081",
    no: "#081",
    date: "2029. 09. 22",
    dateLabel: "Oct 22, 2023",
    title: "Code Review: API Auth Layer",
    duration: "1h 12m",
    summary: "인증 콜백과 세션 경계에서 확인할 액션 4개를 정리했습니다.",
    status: "4 Actions",
    actionCount: 4,
    participants: [baseParticipants[0], baseParticipants[1]],
  },
  {
    id: "report-080",
    no: "#080",
    date: "2029. 09. 20",
    dateLabel: "Oct 21, 2023",
    title: "Weekly All Hands",
    duration: "45m",
    summary: "주간 진행률과 위험 상태를 공유하고 다음 우선순위를 조정했습니다.",
    status: "AI Summary Ready",
    actionCount: 2,
    participants: [
      baseParticipants[2],
      {
        id: "nina",
        initials: "NP",
        name: "Nina Park",
        role: "Product",
        status: "listening",
        tone: "dark",
      },
    ],
  },
  {
    id: "report-079",
    no: "#079",
    date: "2029. 09. 18",
    dateLabel: "Oct 19, 2023",
    title: "Client Onboarding: Studio.Flow",
    duration: "32m",
    summary:
      "클라이언트 온보딩 흐름의 누락 화면과 transcript 오류를 확인했습니다.",
    status: "Transcript Error",
    actionCount: 1,
    participants: [
      baseParticipants[0],
      baseParticipants[2],
      {
        id: "ken",
        initials: "KH",
        name: "Ken Han",
        role: "Backend",
        status: "listening",
        tone: "green",
      },
    ],
  },
];

function reportHref(workspaceId: string, reportId?: string) {
  const baseHref = `/workspaces/${encodeURIComponent(workspaceId)}/meetings/reports`;

  if (!reportId) return baseHref;

  const params = new URLSearchParams({ reportId });
  return `${baseHref}?${params.toString()}`;
}

function statusText(status: ParticipantFixture["status"]) {
  if (status === "speaking") return "Speaking";
  if (status === "muted") return "Muted";

  return "Listening";
}

function Avatar({
  participant,
  compact = false,
}: {
  participant: ParticipantFixture;
  compact?: boolean;
}) {
  return (
    <span
      className={`${styles.fixtureAvatar} ${styles[`avatarTone${participant.tone}`]} ${
        compact ? styles.fixtureAvatarCompact : ""
      }`}
      title={`${participant.name} · ${participant.role}`}
    >
      {participant.initials}
    </span>
  );
}

function AvatarStack({ participants }: { participants: ParticipantFixture[] }) {
  const visibleParticipants = participants.slice(0, 3);
  const hiddenCount = Math.max(
    participants.length - visibleParticipants.length,
    0,
  );

  return (
    <div
      className={styles.avatarStack}
      aria-label={`${participants.length}명 참여`}
    >
      {visibleParticipants.map((participant) => (
        <Avatar compact key={participant.id} participant={participant} />
      ))}
      {hiddenCount > 0 ? (
        <span className={styles.avatarMore}>+{hiddenCount}</span>
      ) : null}
    </div>
  );
}

function AudioBars() {
  return (
    <div className={styles.audioBars} aria-hidden="true">
      {Array.from({ length: 11 }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export function VoiceMeetingsPage({ workspaceId }: { workspaceId: string }) {
  const [joined, setJoined] = useState(false);
  const participants = joined
    ? [
        ...baseParticipants,
        {
          id: "current-user",
          initials: "JD",
          name: "John Doe",
          role: "You",
          status: "listening",
          tone: "dark",
        } satisfies ParticipantFixture,
      ]
    : baseParticipants;

  return (
    <section className={styles.experiencePage}>
      <div className={styles.experienceHeader}>
        <div>
          <span className={styles.sectionKicker}>ACTIVE COLLABORATION</span>
          <h2>음성 회의 & 회의록</h2>
        </div>
        <aside className={styles.metricCard} aria-label="이번 주 회의 시간">
          <span>⏱</span>
          <div>
            <small>이번 주 누적</small>
            <strong>12.4 hrs</strong>
          </div>
        </aside>
      </div>

      <div className={styles.voiceDashboardGrid}>
        <div className={styles.voiceMainColumn}>
          <section className={styles.voiceRoomCard}>
            <header className={styles.voiceRoomHeader}>
              <div>
                <span className={styles.liveDot} />
                <strong>Active: Core Sync #102</strong>
              </div>
              <code>54:53</code>
            </header>

            <div className={styles.voiceRoomBody}>
              <span className={styles.tableKicker}>PARTICIPANTS</span>
              <div className={styles.participantList}>
                {participants.map((participant) => (
                  <article
                    className={styles.participantRow}
                    key={participant.id}
                  >
                    <Avatar participant={participant} />
                    <div>
                      <strong>{participant.name}</strong>
                      <small>{participant.role}</small>
                    </div>
                    <span
                      className={
                        participant.status === "speaking"
                          ? styles.participantStatusActive
                          : styles.participantStatus
                      }
                    >
                      {participant.status === "speaking" ? "● " : ""}
                      {statusText(participant.status)}
                    </span>
                  </article>
                ))}
              </div>

              <button
                className={styles.primaryWideButton}
                onClick={() => setJoined((current) => !current)}
                type="button"
              >
                {joined ? "음성 회의 나가기" : "음성 회의 참여"}
              </button>
            </div>
          </section>

          <section className={styles.audioAnalyticsCard}>
            <AudioBars />
            <span className={styles.tableKicker}>
              REAL-TIME AUDIO ANALYTICS
            </span>
          </section>
        </div>

        <aside className={styles.previousReportsPanel}>
          <header className={styles.panelHeaderLine}>
            <h3>이전 회의록</h3>
            <Link href={reportHref(workspaceId)}>전체 보기 →</Link>
          </header>
          <div className={styles.previousReportList}>
            {reportFixtures.map((report) => (
              <Link
                className={styles.previousReportCard}
                href={reportHref(workspaceId, report.id)}
                key={report.id}
              >
                <div className={styles.reportCardTopline}>
                  <code>{report.date}</code>
                  <AvatarStack participants={report.participants} />
                </div>
                <strong>{report.title}</strong>
                <p>{report.summary}</p>
                <div className={styles.reportMetaRow}>
                  <span>{report.duration}</span>
                  <span>{report.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function MeetingReportsBoardPage({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const selectedReportId = searchParams.get("reportId");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredReports = useMemo(() => {
    if (!normalizedQuery) return reportFixtures;

    return reportFixtures.filter((report) => {
      const haystack = [
        report.no,
        report.title,
        report.summary,
        report.dateLabel,
        ...report.participants.map((participant) => participant.name),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);
  const selectedReport =
    reportFixtures.find((report) => report.id === selectedReportId) ?? null;

  return (
    <section className={styles.experiencePage}>
      <div className={styles.reportBoardHeader}>
        <div>
          <span className={styles.sectionKicker}>MEETING ARCHIVE</span>
          <h2>회의록 게시판</h2>
        </div>
        <Link
          className={styles.blackActionButton}
          href={`/workspaces/${workspaceId}/meetings/voice`}
        >
          새 회의 시작
        </Link>
      </div>

      {selectedReport ? (
        <section className={styles.selectedReportBanner}>
          <div>
            <span>{selectedReport.no}</span>
            <strong>{selectedReport.title}</strong>
            <p>{selectedReport.summary}</p>
          </div>
          <AvatarStack participants={selectedReport.participants} />
        </section>
      ) : null}

      <section className={styles.reportToolbar} aria-label="회의록 필터">
        <label className={styles.reportSearchField}>
          <span>검색</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="회의록, 참석자, 키워드 검색"
            value={query}
          />
        </label>
        <div className={styles.reportFilterGroup}>
          <button type="button">최근 30일</button>
          <button type="button">전체 참석자</button>
          <button aria-label="필터 열기" type="button">
            필터
          </button>
        </div>
      </section>

      <section className={styles.reportTableCard}>
        <div className={styles.reportTableScroll}>
          <table className={styles.reportTable}>
            <thead>
              <tr>
                <th>No.</th>
                <th>Date</th>
                <th>Title</th>
                <th>Participants</th>
                <th>Key Summary</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => (
                <tr
                  className={
                    report.id === selectedReportId
                      ? styles.selectedReportRow
                      : undefined
                  }
                  key={report.id}
                >
                  <td>
                    <Link href={reportHref(workspaceId, report.id)}>
                      {report.no}
                    </Link>
                  </td>
                  <td>{report.dateLabel}</td>
                  <td>
                    <Link href={reportHref(workspaceId, report.id)}>
                      {report.title}
                    </Link>
                  </td>
                  <td>
                    <AvatarStack participants={report.participants} />
                  </td>
                  <td>{report.summary}</td>
                  <td>
                    <div className={styles.tableActionGroup}>
                      <Link href={reportHref(workspaceId, report.id)}>
                        열기
                      </Link>
                      <button type="button">편집</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className={styles.reportTableFooter}>
          <span>
            Showing 1 - {filteredReports.length} of {reportFixtures.length}{" "}
            results
          </span>
          <nav aria-label="회의록 페이지">
            <button disabled type="button">
              ‹
            </button>
            <b>1</b>
            <button type="button">2</button>
            <button type="button">3</button>
            <span>...</span>
            <button type="button">21</button>
            <button type="button">›</button>
          </nav>
        </footer>
      </section>
    </section>
  );
}
