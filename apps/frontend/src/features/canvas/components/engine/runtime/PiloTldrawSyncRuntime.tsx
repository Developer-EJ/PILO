"use client";

import { useEffect } from "react";
import { TldrawSurface } from "@/shared/tldraw";
import type { CanvasBoardDetail } from "./canvas-runtime-types";
import type {
  PiloCanvasActions,
  PiloCanvasHistoryState,
} from "../surface/PiloTldrawCanvas";

type PiloTldrawSyncRuntimeProps = {
  board: CanvasBoardDetail;
  onHistoryStateChange: (state: PiloCanvasHistoryState) => void;
  onReady: (actions: PiloCanvasActions | null) => void;
};

export function PiloTldrawSyncRuntime({
  board,
  onHistoryStateChange,
  onReady,
}: PiloTldrawSyncRuntimeProps) {
  useEffect(() => {
    onReady(null);
    onHistoryStateChange({ canRedo: false, canUndo: false });

    return () => onReady(null);
  }, [onHistoryStateChange, onReady]);

  return (
    <div className="pilo-tldraw-sync-runtime">
      <TldrawSurface
        key={`${board.workspaceId}:${board.id}:tldraw-sync`}
        className="pilo-tldraw-canvas"
      />
      <div className="pilo-tldraw-sync-runtime__notice">
        <strong>{board.title}</strong>
        <span>
          실시간 동시편집 캔버스가 생성되었습니다. 다음 단계에서 sync document
          저장/복구를 연결합니다.
        </span>
      </div>
    </div>
  );
}
