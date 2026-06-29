"use client";

import { useState } from "react";
import { FrameShapeUtil, useEditor, type Editor } from "tldraw";
import { useValue } from "@tldraw/state-react";
import {
  isPiloFrameShape,
  type PiloFramePartial,
  type PiloFrameShape,
} from "./PiloCanvasShapeGuards";

const PILO_EMPTY_FRAME_NAME = "\u200B";

function isBlankFrameName(name: string) {
  return name.replaceAll(PILO_EMPTY_FRAME_NAME, "").trim() === "";
}

export function normalizeBlankFrameName(name: string) {
  return isBlankFrameName(name) ? PILO_EMPTY_FRAME_NAME : name;
}

const piloFrameDisplayColors: Partial<
  Record<
    PiloFrameShape["props"]["color"],
    {
      fill: string;
      stroke: string;
      headingText: string;
    }
  >
> = {
  black: {
    fill: "#edf0f4",
    stroke: "#5b6472",
    headingText: "#111827",
  },
  grey: {
    fill: "#d9dde4",
    stroke: "#7b8492",
    headingText: "#111827",
  },
  "light-violet": {
    fill: "#eadcff",
    stroke: "#a379e6",
    headingText: "#3b2470",
  },
  violet: {
    fill: "#dec8ff",
    stroke: "#7c4bd6",
    headingText: "#35176f",
  },
  blue: {
    fill: "#d4e2ff",
    stroke: "#4c6fe8",
    headingText: "#173a8a",
  },
  "light-blue": {
    fill: "#d6ecff",
    stroke: "#4595d9",
    headingText: "#0e4d78",
  },
  yellow: {
    fill: "#fff0a6",
    stroke: "#d79b1f",
    headingText: "#704900",
  },
  orange: {
    fill: "#ffd8b8",
    stroke: "#df7a28",
    headingText: "#783500",
  },
  green: {
    fill: "#cdf2db",
    stroke: "#2b9b55",
    headingText: "#10542c",
  },
  "light-green": {
    fill: "#d8f6cf",
    stroke: "#5dad45",
    headingText: "#285f1b",
  },
  "light-red": {
    fill: "#ffd2d2",
    stroke: "#e06b6b",
    headingText: "#831f1f",
  },
  red: {
    fill: "#ffc3c3",
    stroke: "#d94949",
    headingText: "#7a1111",
  },
  white: {
    fill: "#ffffff",
    stroke: "#cbd2df",
    headingText: "#111827",
  },
};

export const PiloFrameShapeUtil = FrameShapeUtil.configure({
  showColors: true,
  getCustomDisplayValues(_editor, shape) {
    const colors =
      piloFrameDisplayColors[shape.props.color] ?? piloFrameDisplayColors.black;

    if (!colors) return {};

    return {
      showColorsFillColor: colors.fill,
      showColorsStrokeColor: colors.stroke,
      showColorsHeadingFillColor: "transparent",
      showColorsHeadingStrokeColor: "transparent",
      showColorsHeadingTextColor: colors.headingText,
    };
  },
});
const frameColorOptions: {
  label: string;
  value: PiloFrameShape["props"]["color"];
}[] = [
  { label: "검정", value: "black" },
  { label: "회색", value: "grey" },
  { label: "연보라", value: "light-violet" },
  { label: "보라", value: "violet" },
  { label: "파랑", value: "blue" },
  { label: "연파랑", value: "light-blue" },
  { label: "노랑", value: "yellow" },
  { label: "주황", value: "orange" },
  { label: "초록", value: "green" },
  { label: "연초록", value: "light-green" },
  { label: "연빨강", value: "light-red" },
  { label: "빨강", value: "red" },
  { label: "흰색", value: "white" },
];

const frameRatioPresets = [
  { key: "custom", label: "사용자 지정", width: 360, height: 240 },
  { key: "a4", label: "A4", width: 297, height: 420 },
  { key: "letter", label: "레터", width: 330, height: 426 },
  { key: "16-9", label: "16 : 9", width: 480, height: 270 },
  { key: "4-3", label: "4 : 3", width: 400, height: 300 },
  { key: "1-1", label: "1 : 1", width: 320, height: 320 },
  { key: "phone", label: "전화", width: 210, height: 380 },
  { key: "tablet", label: "태블릿", width: 300, height: 400 },
  { key: "browser", label: "브라우저", width: 520, height: 325 },
];

function buildFrameSizePartial(
  shape: PiloFrameShape,
  preset: (typeof frameRatioPresets)[number],
): PiloFramePartial {
  const center = {
    x: shape.x + shape.props.w / 2,
    y: shape.y + shape.props.h / 2,
  };

  return {
    id: shape.id,
    type: shape.type,
    x: center.x - preset.width / 2,
    y: center.y - preset.height / 2,
    props: {
      w: preset.width,
      h: preset.height,
      name: normalizeBlankFrameName(shape.props.name),
    },
  };
}

function updateFrame(
  editor: Editor,
  shape: PiloFrameShape,
  partial: PiloFramePartial,
) {
  editor.updateShapes([partial]);
  editor.select(shape.id);
}

export function resolveNextFrameName(editor: Editor) {
  const usedFrameNumbers = new Set<number>();

  editor.getCurrentPageShapes().forEach((shape) => {
    if (!isPiloFrameShape(shape)) return;

    const match = isBlankFrameName(shape.props.name)
      ? null
      : shape.props.name.match(/^프레임\s+(\d+)$/);
    const frameNumber = match ? Number(match[1]) : NaN;

    if (Number.isFinite(frameNumber) && frameNumber > 0) {
      usedFrameNumbers.add(frameNumber);
    }
  });

  let nextFrameNumber = 1;

  while (usedFrameNumbers.has(nextFrameNumber)) {
    nextFrameNumber += 1;
  }

  return `프레임 ${nextFrameNumber}`;
}

export function FrameSelectionToolbar() {
  const editor = useEditor();
  const [openMenu, setOpenMenu] = useState<"ratio" | "color" | null>(null);
  const toolbarState = useValue(
    "pilo-selected-frame-toolbar",
    () => {
      const selectedFrame = editor.getSelectedShapes().find(isPiloFrameShape);

      if (!selectedFrame) return null;

      const bounds = editor.getShapePageBounds(selectedFrame.id);

      if (!bounds) return null;

      const viewportBounds = editor.getViewportScreenBounds();
      const topCenter = editor.pageToViewport({
        x: bounds.x + bounds.w / 2,
        y: bounds.y + bounds.h,
      });
      const toolbarHalfWidth = 132;
      const clampedLeft = Math.min(
        Math.max(topCenter.x, toolbarHalfWidth + 12),
        Math.max(
          toolbarHalfWidth + 12,
          viewportBounds.w - toolbarHalfWidth - 12,
        ),
      );

      return {
        frame: selectedFrame,
        left: clampedLeft,
        top: topCenter.y + 12,
      };
    },
    [editor],
  );

  if (!toolbarState) return null;

  const selectedFrame = toolbarState.frame;

  function toggleMenu(menu: "ratio" | "color") {
    setOpenMenu((currentMenu) => (currentMenu === menu ? null : menu));
  }

  function applyFramePreset(preset: (typeof frameRatioPresets)[number]) {
    updateFrame(
      editor,
      selectedFrame,
      buildFrameSizePartial(selectedFrame, preset),
    );
    setOpenMenu(null);
  }

  function applyFrameColor(color: PiloFrameShape["props"]["color"]) {
    updateFrame(editor, selectedFrame, {
      id: selectedFrame.id,
      type: selectedFrame.type,
      props: {
        color,
      },
    });
    setOpenMenu(null);
  }

  function toggleFrameLock() {
    setOpenMenu(null);
    editor.toggleLock([selectedFrame.id]);
    editor.select(selectedFrame.id);
  }

  function toggleFrameVisibility() {
    setOpenMenu(null);
    updateFrame(editor, selectedFrame, {
      id: selectedFrame.id,
      type: selectedFrame.type,
      opacity: selectedFrame.opacity < 0.35 ? 1 : 0.18,
    });
  }

  return (
    <div
      className="pilo-frame-toolbar"
      style={{
        left: toolbarState.left,
        top: toolbarState.top,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="pilo-frame-toolbar-ratio"
        data-tooltip="비율 선택"
        onClick={() => toggleMenu("ratio")}
      >
        <span>비율</span>
      </button>
      <button
        type="button"
        aria-label={`${isBlankFrameName(selectedFrame.props.name) ? "프레임" : selectedFrame.props.name} 색상`}
        data-tooltip="색상 선택"
        onClick={() => toggleMenu("color")}
      >
        <span
          className={`pilo-frame-toolbar-swatch is-${selectedFrame.props.color}`}
        />
      </button>
      <button
        type="button"
        aria-label="프레임 잠금"
        data-tooltip={selectedFrame.isLocked ? "잠금 해제" : "잠금"}
        onClick={toggleFrameLock}
      >
        <FrameToolbarIcon type={selectedFrame.isLocked ? "unlock" : "lock"} />
      </button>
      <button
        type="button"
        aria-label="프레임 표시"
        data-tooltip={selectedFrame.opacity < 0.35 ? "다시 표시" : "흐리게"}
        onClick={toggleFrameVisibility}
      >
        <FrameToolbarIcon
          type={selectedFrame.opacity < 0.35 ? "eye-off" : "eye"}
        />
      </button>
      {openMenu === "ratio" ? (
        <div className="pilo-frame-dropdown pilo-frame-ratio-menu">
          {frameRatioPresets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`pilo-frame-ratio-option is-${preset.key}`}
              data-tooltip={preset.label}
              onClick={() => applyFramePreset(preset)}
            >
              <span aria-hidden="true" />
              <strong>{preset.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
      {openMenu === "color" ? (
        <div className="pilo-frame-dropdown pilo-frame-color-menu">
          <header>
            <span>브랜드 색상</span>
            <b>↟</b>
          </header>
          <button
            type="button"
            className="pilo-frame-add-color"
            data-tooltip="색상 추가"
            onClick={() => applyFrameColor("violet")}
          >
            + 색상 추가
          </button>
          <strong>모든 색상</strong>
          <div className="pilo-frame-color-grid">
            {frameColorOptions.map((color) => (
              <button
                key={color.value}
                type="button"
                className={`pilo-frame-color-option is-${color.value}`}
                data-tooltip={color.label}
                aria-label={`${color.label} 적용`}
                onClick={() => applyFrameColor(color.value)}
              >
                {selectedFrame.props.color === color.value ? (
                  <span aria-hidden="true">✓</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FrameToolbarIcon({
  type,
}: {
  type: "lock" | "unlock" | "eye" | "eye-off";
}) {
  const commonProps = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (type === "lock") {
    return (
      <svg {...commonProps}>
        <rect x="5.5" y="10" width="13" height="10" rx="2.4" />
        <path d="M8.5 10V7.2a3.5 3.5 0 0 1 7 0V10" />
      </svg>
    );
  }

  if (type === "unlock") {
    return (
      <svg {...commonProps}>
        <rect x="5.5" y="10" width="13" height="10" rx="2.4" />
        <path d="M8.5 10V7.2a3.5 3.5 0 0 1 6.4-2" />
      </svg>
    );
  }

  if (type === "eye-off") {
    return (
      <svg {...commonProps}>
        <path d="M3.5 3.5 20.5 20.5" />
        <path d="M9.6 5.1A8.7 8.7 0 0 1 12 4.8c5 0 8.4 4.6 9.4 7.2a12.4 12.4 0 0 1-2.4 3.6" />
        <path d="M6.2 6.8A12.2 12.2 0 0 0 2.6 12c1 2.6 4.4 7.2 9.4 7.2a8.5 8.5 0 0 0 4.1-1" />
        <path d="M10.3 10.3a2.4 2.4 0 0 0 3.4 3.4" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M2.6 12c1-2.6 4.4-7.2 9.4-7.2s8.4 4.6 9.4 7.2c-1 2.6-4.4 7.2-9.4 7.2S3.6 14.6 2.6 12z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}
