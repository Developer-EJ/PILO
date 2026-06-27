"use client";

import { useState } from "react";

type CanvasItem = {
  id: string;
  kind: "note" | "code" | "task" | "pr" | "meeting" | "file";
  title: string;
  meta: string;
  x: number | string;
  y: number | string;
  rotate: number;
};

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
};

const initialItems: CanvasItem[] = [
  {
    id: "note-scope",
    kind: "note",
    title: "오늘 결정",
    meta: "Canvas는 원본 데이터를 수정하지 않는다",
    x: "calc(50% - 506px)",
    y: "14vh",
    rotate: -4,
  },
  {
    id: "code-auth",
    kind: "code",
    title: "auth.guard.ts",
    meta: "if (!session) redirect('/login')",
    x: "calc(50% + 286px)",
    y: "14vh",
    rotate: 3,
  },
  {
    id: "task-login",
    kind: "task",
    title: "로그인 API 연동",
    meta: "동현 · 오늘",
    x: "calc(50% - 506px)",
    y: "65vh",
    rotate: 3,
  },
  {
    id: "pr-review",
    kind: "pr",
    title: "PR #42",
    meta: "리뷰 대기 · 3 files",
    x: "calc(50% + 286px)",
    y: "65vh",
    rotate: -3,
  },
  {
    id: "meeting-report",
    kind: "meeting",
    title: "회의록",
    meta: "Task 2개 생성 예정",
    x: "calc(50% - 506px)",
    y: "39vh",
    rotate: 2,
  },
  {
    id: "file-spec",
    kind: "file",
    title: "기능 명세",
    meta: "Workspace / Canvas",
    x: "calc(50% + 286px)",
    y: "39vh",
    rotate: -2,
  },
];

export function DraggableCanvasItems() {
  const [items, setItems] = useState(initialItems);
  const [drag, setDrag] = useState<DragState | null>(null);

  return (
    <section
      className="login-canvas-layer"
      aria-hidden="true"
      onPointerMove={(event) => {
        if (!drag) return;

        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id === drag.id
              ? {
                  ...item,
                  x: event.clientX - drag.offsetX,
                  y: event.clientY - drag.offsetY,
                }
              : item,
          ),
        );
      }}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
    >
      <div className="login-canvas-line line-a" />
      <div className="login-canvas-line line-b" />
      <div className="login-canvas-line line-c" />

      {items.map((item) => (
        <div
          className={`canvas-float canvas-${item.kind}`}
          key={item.id}
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({
              id: item.id,
              offsetX: event.clientX - rect.left,
              offsetY: event.clientY - rect.top,
            });
          }}
          style={{
            left: item.x,
            top: item.y,
            transform: `rotate(${item.rotate}deg)`,
          }}
        >
          <span className="canvas-float-kind">{labelForKind(item.kind)}</span>
          <strong>{item.title}</strong>
          <small>{item.meta}</small>
        </div>
      ))}
    </section>
  );
}

function labelForKind(kind: CanvasItem["kind"]) {
  const labels = {
    code: "CODE",
    file: "FILE",
    meeting: "MEET",
    note: "NOTE",
    pr: "PR",
    task: "TASK",
  };

  return labels[kind];
}
