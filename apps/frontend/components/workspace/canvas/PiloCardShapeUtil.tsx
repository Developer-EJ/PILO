"use client";

import type { CSSProperties } from "react";
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  type TLResizeInfo,
  type TLShape,
} from "tldraw";

export type PiloCardKind =
  | "task"
  | "pull_request"
  | "meeting_report"
  | "github_issue"
  | "document"
  | "file"
  | "code"
  | "decision"
  | "risk"
  | "memo";

export type PiloCardShapeProps = {
  w: number;
  h: number;
  kind: PiloCardKind;
  canvasShapeId: string;
  entityType: string;
  title: string;
  subtitle: string;
  body: string;
  status: string;
  accent: string;
  entityId: string;
};

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "pilo-card": PiloCardShapeProps;
  }
}

export type PiloCardShape = Extract<TLShape, { type: "pilo-card" }>;

const kindLabels: Record<PiloCardKind, string> = {
  task: "Task",
  pull_request: "PR",
  meeting_report: "Meeting",
  github_issue: "Issue",
  document: "Document",
  file: "File",
  code: "Code",
  decision: "Decision",
  risk: "Risk",
  memo: "Memo",
};

export function resolvePiloCardLabel(kind: PiloCardKind) {
  return kindLabels[kind] ?? "Card";
}

export class PiloCardShapeUtil extends ShapeUtil<PiloCardShape> {
  static override type = "pilo-card" as const;

  static override props = {
    w: T.number,
    h: T.number,
    kind: T.literalEnum(
      "task",
      "pull_request",
      "meeting_report",
      "github_issue",
      "document",
      "file",
      "code",
      "decision",
      "risk",
      "memo",
    ),
    canvasShapeId: T.string,
    entityType: T.string,
    title: T.string,
    subtitle: T.string,
    body: T.string,
    status: T.string,
    accent: T.string,
    entityId: T.string,
  };

  override canEdit() {
    return false;
  }

  override getDefaultProps(): PiloCardShape["props"] {
    return {
      w: 288,
      h: 164,
      kind: "task",
      canvasShapeId: "local",
      entityType: "task",
      title: "Untitled card",
      subtitle: "Canvas entity",
      body: "Project object summary",
      status: "Open",
      accent: "#6d5bd6",
      entityId: "local",
    };
  }

  override getGeometry(shape: PiloCardShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(_shape: PiloCardShape, info: TLResizeInfo<PiloCardShape>) {
    return {
      props: {
        w: Math.max(220, info.initialShape.props.w * Math.abs(info.scaleX)),
        h: Math.max(132, info.initialShape.props.h * Math.abs(info.scaleY)),
      },
    };
  }

  override component(shape: PiloCardShape) {
    const {
      accent,
      body,
      canvasShapeId,
      entityId,
      h,
      kind,
      status,
      subtitle,
      title,
      w,
    } = shape.props;

    return (
      <HTMLContainer
        className={`pilo-card-shape pilo-card-shape-${kind}`}
        style={
          {
            width: w,
            height: h,
            "--pilo-card-accent": accent,
          } as CSSProperties
        }
      >
        <article className="pilo-card">
          <div className="pilo-card-head">
            <span className="pilo-card-kind">{resolvePiloCardLabel(kind)}</span>
            <span className="pilo-card-status">{status}</span>
          </div>
          <strong>{title}</strong>
          <p>{body}</p>
          <footer>
            <span>{subtitle}</span>
            <code>{canvasShapeId || entityId}</code>
          </footer>
        </article>
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: PiloCardShape) {
    const path = new Path2D();

    path.rect(0, 0, shape.props.w, shape.props.h);

    return path;
  }
}
