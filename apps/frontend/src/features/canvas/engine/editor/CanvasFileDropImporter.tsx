"use client";

import { useEffect, useRef, useState } from "react";
import { type TLShapeId, useEditor } from "tldraw";
import {
  hasCodeFileDrag,
  importCodeFilesFromDataTransfer,
  type PiloCodeFileImportResult,
} from "../../imports/canvas-code-file-import";
import type { PiloCanvasFreeformShape } from "../canvas-engine-types";
import {
  createImportedCodeBlockShape,
  createImportedCodeFolderShapes,
  PILO_IMPORTED_CODE_BLOCK_HEIGHT,
  PILO_IMPORTED_CODE_BLOCK_WIDTH,
  sortFreeformShapesForCreate,
} from "../shapes/pilo-canvas-shape-factory";

const PILO_CODE_IMPORT_GRID_GAP_X = 112;
const PILO_CODE_IMPORT_GRID_GAP_Y = 128;
const PILO_CODE_IMPORT_MAX_COLUMNS = 3;

function getCodeImportGridPosition({
  count,
  index,
  point,
}: {
  count: number;
  index: number;
  point: { x: number; y: number };
}) {
  const columns = Math.min(
    PILO_CODE_IMPORT_MAX_COLUMNS,
    Math.max(1, Math.ceil(Math.sqrt(count))),
  );
  const column = index % columns;
  const row = Math.floor(index / columns);
  const totalWidth =
    columns * PILO_IMPORTED_CODE_BLOCK_WIDTH +
    (columns - 1) * PILO_CODE_IMPORT_GRID_GAP_X;
  const x =
    point.x -
    totalWidth / 2 +
    column * (PILO_IMPORTED_CODE_BLOCK_WIDTH + PILO_CODE_IMPORT_GRID_GAP_X);
  const y =
    point.y -
    PILO_IMPORTED_CODE_BLOCK_HEIGHT / 2 +
    row * (PILO_IMPORTED_CODE_BLOCK_HEIGHT + PILO_CODE_IMPORT_GRID_GAP_Y);

  return { x, y };
}

function summarizeImportItems(items: { fileName: string; reason: string }[]) {
  if (!items.length) return "";

  const preview = items
    .slice(0, 3)
    .map((item) => item.fileName)
    .join(", ");
  const remainingCount = items.length - 3;

  return remainingCount > 0 ? `${preview} 외 ${remainingCount}개` : preview;
}

function getImportedFolderCodeBlockCount(
  folder: PiloCodeFileImportResult["folders"][number],
): number {
  return (
    folder.files.length +
    folder.folders.reduce(
      (count, childFolder) =>
        count + getImportedFolderCodeBlockCount(childFolder),
      0,
    )
  );
}

function getImportedCodeBlockCount(summary: PiloCodeFileImportResult) {
  return (
    summary.imported.length +
    summary.folders.reduce(
      (count, folder) => count + getImportedFolderCodeBlockCount(folder),
      0,
    )
  );
}

function getCodeFileDropSignature(dataTransfer: DataTransfer) {
  const files = Array.from(dataTransfer.files);

  if (files.length) {
    return files
      .map((file) => [file.name, file.size, file.lastModified].join(":"))
      .join("|");
  }

  return `items:${dataTransfer.items.length}`;
}

export function CanvasFileDropImporter() {
  const editor = useEditor();
  const importIndexRef = useRef(0);
  const dragDepthRef = useRef(0);
  const lastDropRef = useRef<{ signature: string; time: number } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<PiloCodeFileImportResult | null>(null);

  useEffect(() => {
    if (!summary) return undefined;

    const timer = window.setTimeout(() => setSummary(null), 6000);

    return () => window.clearTimeout(timer);
  }, [summary]);

  useEffect(() => {
    const container = editor.getContainer();
    const dropTarget = (container.closest(".pilo-tldraw-canvas") ??
      container) as HTMLElement;
    const listenerOptions: AddEventListenerOptions = { capture: true };

    function handleDragEnter(event: globalThis.DragEvent) {
      if (!hasCodeFileDrag(event.dataTransfer)) return;

      event.stopImmediatePropagation();
      dragDepthRef.current += 1;
      setIsDraggingFile(true);
    }

    function handleDragOver(event: globalThis.DragEvent) {
      if (!hasCodeFileDrag(event.dataTransfer)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    }

    function handleDragLeave(event: globalThis.DragEvent) {
      if (!hasCodeFileDrag(event.dataTransfer)) return;

      event.stopImmediatePropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

      if (dragDepthRef.current === 0) {
        setIsDraggingFile(false);
      }
    }

    async function handleDrop(event: globalThis.DragEvent) {
      if (!hasCodeFileDrag(event.dataTransfer)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const dataTransfer = event.dataTransfer;
      const signature = getCodeFileDropSignature(dataTransfer);
      const now = Date.now();
      const lastDrop = lastDropRef.current;

      if (
        lastDrop &&
        lastDrop.signature === signature &&
        now - lastDrop.time < 900
      ) {
        return;
      }

      lastDropRef.current = {
        signature,
        time: now,
      };
      dragDepthRef.current = 0;
      setIsDraggingFile(false);
      setIsImporting(true);
      setSummary(null);

      try {
        const result = await importCodeFilesFromDataTransfer(dataTransfer);

        if (result.imported.length || result.folders.length) {
          const pagePoint = editor.screenToPage({
            x: event.clientX,
            y: event.clientY,
          });
          const rootFilePoint = result.folders.length
            ? {
                x: pagePoint.x,
                y:
                  pagePoint.y +
                  PILO_IMPORTED_CODE_BLOCK_HEIGHT +
                  PILO_CODE_IMPORT_GRID_GAP_Y,
              }
            : pagePoint;
          const rootFileShapes = result.imported.map((file, index) =>
            createImportedCodeBlockShape(
              importIndexRef.current + index,
              getCodeImportGridPosition({
                count: result.imported.length,
                index,
                point: rootFilePoint,
              }),
              file,
            ),
          );
          const folderShapes: PiloCanvasFreeformShape[] = [];
          const topLevelFrames: PiloCanvasFreeformShape[] = [];
          let nextFolderCenterX = pagePoint.x;
          let folderShapeIndex = importIndexRef.current + rootFileShapes.length;

          result.folders.forEach((folder) => {
            const createdFolder = createImportedCodeFolderShapes(
              folderShapeIndex,
              {
                x: nextFolderCenterX,
                y: pagePoint.y,
              },
              folder,
            );

            topLevelFrames.push(createdFolder.frame);
            folderShapes.push(...createdFolder.shapes);
            nextFolderCenterX += createdFolder.frameSize.w + 96;
            folderShapeIndex += createdFolder.shapes.length;
          });
          const shapes = [...folderShapes, ...rootFileShapes];
          const selectedShapes = topLevelFrames.length
            ? [...topLevelFrames, ...rootFileShapes]
            : shapes;

          editor.createShapes(sortFreeformShapesForCreate(shapes));
          editor.select(...selectedShapes.map((shape) => shape.id as TLShapeId));
          importIndexRef.current += shapes.length;
        }

        setSummary({
          ...result,
        });
      } catch {
        setSummary({
          failed: [
            {
              fileName: "파일 드롭",
              reason: "파일 import 처리 중 오류가 발생했습니다.",
            },
          ],
          folders: [],
          imported: [],
          skipped: [],
        });
      } finally {
        setIsImporting(false);
      }
    }

    dropTarget.addEventListener("dragenter", handleDragEnter, listenerOptions);
    dropTarget.addEventListener("dragover", handleDragOver, listenerOptions);
    dropTarget.addEventListener("dragleave", handleDragLeave, listenerOptions);
    dropTarget.addEventListener("drop", handleDrop, listenerOptions);

    return () => {
      dropTarget.removeEventListener(
        "dragenter",
        handleDragEnter,
        listenerOptions,
      );
      dropTarget.removeEventListener(
        "dragover",
        handleDragOver,
        listenerOptions,
      );
      dropTarget.removeEventListener(
        "dragleave",
        handleDragLeave,
        listenerOptions,
      );
      dropTarget.removeEventListener("drop", handleDrop, listenerOptions);
    };
  }, [editor]);

  return (
    <>
      {isDraggingFile ? (
        <div className="pilo-code-file-drop-overlay" aria-hidden="true">
          <strong>Code Block으로 가져오기</strong>
        </div>
      ) : null}
      {isImporting || summary ? (
        <div
          className="pilo-code-file-import-toast"
          role="status"
          aria-live="polite"
        >
          {isImporting ? (
            <strong>파일을 읽는 중</strong>
          ) : summary ? (
            <>
              <strong>
                Code Block {getImportedCodeBlockCount(summary)}개 생성
              </strong>
              {summary.skipped.length ? (
                <span>
                  제외 {summary.skipped.length}개:{" "}
                  {summarizeImportItems(summary.skipped)}
                </span>
              ) : null}
              {summary.failed.length ? (
                <span>
                  실패 {summary.failed.length}개:{" "}
                  {summarizeImportItems(summary.failed)}
                </span>
              ) : null}
              <button type="button" onClick={() => setSummary(null)}>
                닫기
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
