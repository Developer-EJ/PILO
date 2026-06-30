"use client";

import { FormEvent, useState } from "react";
import {
  agendaStatusLabel,
  decisionStatusLabel,
  riskSeverityLabel,
  transcriptSourceLabel,
} from "../../lib/meeting/meetingLabels";
import type {
  MeetingAgendaStatus,
  MeetingDecisionStatus,
  MeetingRiskSeverity,
  TranscriptSource,
} from "../../lib/meeting/meetingTypes";
import styles from "./meeting.module.css";

type AsyncSubmit<T> = (value: T) => Promise<void> | void;

const decisionStatuses: MeetingDecisionStatus[] = [
  "decided",
  "pending",
  "reopened",
];

const riskSeverities: MeetingRiskSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

const transcriptSources: TranscriptSource[] = ["text", "stt"];

function resetForm(event: FormEvent<HTMLFormElement>) {
  event.currentTarget.reset();
}

export function CreateMeetingForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: AsyncSubmit<{ title: string; purpose: string | null }>;
}) {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");

  return (
    <form
      className={styles.compactForm}
      onSubmit={async (event) => {
        event.preventDefault();
        const nextTitle = title.trim();

        if (!nextTitle) return;

        await onSubmit({
          title: nextTitle,
          purpose: purpose.trim() || null,
        });
        setTitle("");
        setPurpose("");
      }}
    >
      <label>
        <span>회의 제목</span>
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: MVP 범위 동기화"
          value={title}
        />
      </label>
      <label>
        <span>목적</span>
        <input
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="예: 오늘 결정할 범위"
          value={purpose}
        />
      </label>
      <button disabled={busy || title.trim().length === 0} type="submit">
        회의 만들기
      </button>
    </form>
  );
}

export function ParticipantForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: AsyncSubmit<{ memberId: string; role: string | null }>;
}) {
  return (
    <form
      className={styles.inlineForm}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const memberId = String(form.get("memberId") ?? "").trim();

        if (!memberId) return;

        await onSubmit({
          memberId,
          role: String(form.get("role") ?? "").trim() || null,
        });
        resetForm(event);
      }}
    >
      <label>
        <span>멤버 ID</span>
        <input name="memberId" placeholder="workspace member id" />
      </label>
      <label>
        <span>역할</span>
        <input name="role" placeholder="예: 진행자" />
      </label>
      <button disabled={busy} type="submit">
        추가
      </button>
    </form>
  );
}

export function AgendaForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: AsyncSubmit<{ title: string }>;
}) {
  return (
    <form
      className={styles.inlineForm}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const title = String(form.get("title") ?? "").trim();

        if (!title) return;

        await onSubmit({ title });
        resetForm(event);
      }}
    >
      <label>
        <span>아젠다</span>
        <input name="title" placeholder="논의할 안건 추가" />
      </label>
      <button disabled={busy} type="submit">
        추가
      </button>
    </form>
  );
}

export function MemoForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: AsyncSubmit<{ body: string }>;
}) {
  return (
    <form
      className={styles.stackForm}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = String(form.get("body") ?? "").trim();

        if (!body) return;

        await onSubmit({ body });
        resetForm(event);
      }}
    >
      <label>
        <span>회의 메모</span>
        <textarea name="body" placeholder="결정, 근거, 논의 내용을 남기세요" />
      </label>
      <button disabled={busy} type="submit">
        메모 저장
      </button>
    </form>
  );
}

export function TranscriptForm({
  busy,
  defaultSource = "text",
  onSubmit,
}: {
  busy: boolean;
  defaultSource?: TranscriptSource;
  onSubmit: AsyncSubmit<{
    body: string;
    source: TranscriptSource;
    startedAt: string | null;
    endedAt: string | null;
  }>;
}) {
  const [source, setSource] = useState<TranscriptSource>(defaultSource);

  return (
    <form
      className={styles.stackForm}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = String(form.get("body") ?? "").trim();

        if (!body) return;

        await onSubmit({
          body,
          source,
          startedAt: String(form.get("startedAt") ?? "").trim() || null,
          endedAt: String(form.get("endedAt") ?? "").trim() || null,
        });
        resetForm(event);
      }}
    >
      <div className={styles.formGrid}>
        <label>
          <span>입력 방식</span>
          <select
            onChange={(event) => setSource(event.target.value as TranscriptSource)}
            value={source}
          >
            {transcriptSources.map((candidate) => (
              <option key={candidate} value={candidate}>
                {transcriptSourceLabel(candidate)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>시작 시각</span>
          <input name="startedAt" placeholder="2026-06-30T10:00:00.000Z" />
        </label>
        <label>
          <span>종료 시각</span>
          <input name="endedAt" placeholder="2026-06-30T10:00:12.000Z" />
        </label>
      </div>
      <label>
        <span>전사 내용</span>
        <textarea name="body" placeholder="확인된 전사 내용을 입력하세요" />
      </label>
      <button disabled={busy} type="submit">
        전사 저장
      </button>
    </form>
  );
}

export function DecisionForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: AsyncSubmit<{ content: string; status: MeetingDecisionStatus }>;
}) {
  const [status, setStatus] = useState<MeetingDecisionStatus>("decided");

  return (
    <form
      className={styles.inlineForm}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const content = String(form.get("content") ?? "").trim();

        if (!content) return;

        await onSubmit({ content, status });
        resetForm(event);
      }}
    >
      <label>
        <span>결정사항</span>
        <input name="content" placeholder="결정된 내용을 추가" />
      </label>
      <label>
        <span>상태</span>
        <select
          onChange={(event) => setStatus(event.target.value as MeetingDecisionStatus)}
          value={status}
        >
          {decisionStatuses.map((candidate) => (
            <option key={candidate} value={candidate}>
              {decisionStatusLabel(candidate)}
            </option>
          ))}
        </select>
      </label>
      <button disabled={busy} type="submit">
        저장
      </button>
    </form>
  );
}

export function RiskForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: AsyncSubmit<{ content: string; severity: MeetingRiskSeverity }>;
}) {
  const [severity, setSeverity] = useState<MeetingRiskSeverity>("medium");

  return (
    <form
      className={styles.inlineForm}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const content = String(form.get("content") ?? "").trim();

        if (!content) return;

        await onSubmit({ content, severity });
        resetForm(event);
      }}
    >
      <label>
        <span>리스크</span>
        <input name="content" placeholder="확인된 리스크 추가" />
      </label>
      <label>
        <span>심각도</span>
        <select
          onChange={(event) => setSeverity(event.target.value as MeetingRiskSeverity)}
          value={severity}
        >
          {riskSeverities.map((candidate) => (
            <option key={candidate} value={candidate}>
              {riskSeverityLabel(candidate)}
            </option>
          ))}
        </select>
      </label>
      <button disabled={busy} type="submit">
        저장
      </button>
    </form>
  );
}

export function NextAgendaForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: AsyncSubmit<{ title: string }>;
}) {
  return (
    <form
      className={styles.inlineForm}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const title = String(form.get("title") ?? "").trim();

        if (!title) return;

        await onSubmit({ title });
        resetForm(event);
      }}
    >
      <label>
        <span>다음 아젠다</span>
        <input name="title" placeholder="다음 회의에서 다룰 안건" />
      </label>
      <button disabled={busy} type="submit">
        저장
      </button>
    </form>
  );
}

export function ActionItemForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: AsyncSubmit<{
    title: string;
    description: string | null;
    assigneeSuggestionMemberId: string | null;
    dueDateSuggestion: string | null;
  }>;
}) {
  return (
    <form
      className={styles.stackForm}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const title = String(form.get("title") ?? "").trim();

        if (!title) return;

        await onSubmit({
          title,
          description: String(form.get("description") ?? "").trim() || null,
          assigneeSuggestionMemberId:
            String(form.get("assigneeSuggestionMemberId") ?? "").trim() || null,
          dueDateSuggestion:
            String(form.get("dueDateSuggestion") ?? "").trim() || null,
        });
        resetForm(event);
      }}
    >
      <div className={styles.formGrid}>
        <label>
          <span>작업 제목</span>
          <input name="title" placeholder="후속 작업 제목" />
        </label>
        <label>
          <span>담당자 후보</span>
          <input name="assigneeSuggestionMemberId" placeholder="member id" />
        </label>
        <label>
          <span>마감 후보</span>
          <input name="dueDateSuggestion" placeholder="2026-07-03" />
        </label>
      </div>
      <label>
        <span>작업 설명</span>
        <textarea name="description" placeholder="작업 초안으로 넘길 설명" />
      </label>
      <button disabled={busy} type="submit">
        후속 작업 저장
      </button>
    </form>
  );
}

export function statusLabel(status: MeetingAgendaStatus) {
  return agendaStatusLabel(status);
}
