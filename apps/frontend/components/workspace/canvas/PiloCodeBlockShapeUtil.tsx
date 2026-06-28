"use client";

import type { PointerEvent } from "react";
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  useEditor,
  type TLBaseShape,
  type TLResizeInfo,
} from "tldraw";
import { useValue } from "@tldraw/state-react";

export const piloCodeLanguages = [
  "tsx",
  "ts",
  "jsx",
  "js",
  "json",
  "css",
  "html",
  "md",
  "sql",
  "py",
] as const;

export type PiloCodeLanguage = (typeof piloCodeLanguages)[number];

type PiloCodeBlockShapeProps = {
  w: number;
  h: number;
  fileName: string;
  language: PiloCodeLanguage;
  code: string;
};

export type PiloCodeBlockShape = TLBaseShape<
  "pilo-code-block",
  PiloCodeBlockShapeProps
>;

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "pilo-code-block": PiloCodeBlockShapeProps;
  }
}

function PiloCodeBlockComponent({ shape }: { shape: PiloCodeBlockShape }) {
  const editor = useEditor();
  const isEditing = useValue(
    "pilo-code-block-editing",
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id],
  );

  function updateProps(props: Partial<PiloCodeBlockShapeProps>) {
    editor.updateShapes([
      {
        id: shape.id,
        type: shape.type,
        props,
      },
    ]);
  }

  function handleEditorPointerDown(event: PointerEvent<HTMLElement>) {
    editor.markEventAsHandled(event);
    event.stopPropagation();
  }

  return (
    <HTMLContainer
      className="pilo-code-block-shape"
      style={{
        width: shape.props.w,
        height: shape.props.h,
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        editor.setEditingShape(shape.id);
      }}
    >
      <article className="pilo-code-block">
        <header>
          <span className="pilo-code-dot is-red" />
          <span className="pilo-code-dot is-yellow" />
          <span className="pilo-code-dot is-green" />
          {isEditing ? (
            <>
              <input
                aria-label="파일 이름"
                value={shape.props.fileName}
                onChange={(event) =>
                  updateProps({ fileName: event.target.value })
                }
                onPointerDown={handleEditorPointerDown}
              />
              <select
                aria-label="파일 형식"
                value={shape.props.language}
                onChange={(event) =>
                  updateProps({
                    language: event.target.value as PiloCodeLanguage,
                  })
                }
                onPointerDown={handleEditorPointerDown}
              >
                {piloCodeLanguages.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <strong>{shape.props.fileName || "untitled.tsx"}</strong>
              <small>{shape.props.language}</small>
            </>
          )}
        </header>
        {isEditing ? (
          <textarea
            autoFocus
            aria-label="코드 내용"
            value={shape.props.code}
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                editor.setEditingShape(null);
              }
            }}
            onChange={(event) => updateProps({ code: event.target.value })}
            onPointerDown={handleEditorPointerDown}
          />
        ) : (
          <pre>
            <code>{shape.props.code}</code>
          </pre>
        )}
      </article>
    </HTMLContainer>
  );
}

export class PiloCodeBlockShapeUtil extends ShapeUtil<PiloCodeBlockShape> {
  static override type = "pilo-code-block" as const;

  static override props = {
    w: T.number,
    h: T.number,
    fileName: T.string,
    language: T.literalEnum(
      "tsx",
      "ts",
      "jsx",
      "js",
      "json",
      "css",
      "html",
      "md",
      "sql",
      "py",
    ),
    code: T.string,
  };

  override canEdit() {
    return true;
  }

  override getDefaultProps(): PiloCodeBlockShape["props"] {
    return {
      w: 420,
      h: 260,
      fileName: "canvas-node.tsx",
      language: "tsx",
      code: "export function CanvasNode() {\n  return <div>PILO</div>;\n}",
    };
  }

  override getGeometry(shape: PiloCodeBlockShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(
    _shape: PiloCodeBlockShape,
    info: TLResizeInfo<PiloCodeBlockShape>,
  ) {
    return {
      props: {
        w: Math.max(300, info.initialShape.props.w * Math.abs(info.scaleX)),
        h: Math.max(190, info.initialShape.props.h * Math.abs(info.scaleY)),
      },
    };
  }

  override component(shape: PiloCodeBlockShape) {
    return <PiloCodeBlockComponent shape={shape} />;
  }

  override getIndicatorPath(shape: PiloCodeBlockShape) {
    const path = new Path2D();

    path.rect(0, 0, shape.props.w, shape.props.h);

    return path;
  }
}
