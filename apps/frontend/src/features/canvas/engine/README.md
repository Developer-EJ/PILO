# Canvas Engine

## 담당하는 것

- classic Canvas runtime 조립
- tldraw editor와 Canvas 전용 shape 연결
- local interaction, editor patch, overlay 구성

## 담당하지 않는 것

- Canvas API 요청 구현
- Socket.IO transport 구현
- 다른 도메인의 source of truth

## 읽는 순서

1. `runtime/ClassicCanvasRuntime.tsx`
2. `runtime/useCanvasViewportQueries.ts`
3. `runtime/canvas-viewport-load-policy.ts`
4. `editor/CanvasEditor.tsx`
5. `canvas-engine-types.ts`
6. `shapes/`

`ClassicCanvasRuntime`은 저장과 collaboration 모듈을 연결하고,
`CanvasEditor`는 tldraw editor 안에서 발생하는 동작을 조립한다.

## editor 내부 책임

`CanvasEditor.tsx`는 tldraw surface와 아래 모듈을 조립하는 진입점이다.

- `canvas-editor-shape-hydration.ts`: 최초 hydrate, 증분 Shape patch, binding·asset 복원
- `realtime/CanvasRealtimePreviewApplier.tsx`: 원격 Shape preview를 editor store에 임시 반영하고 확정 상태로 복원
- `reporters/CanvasPresenceReporter.tsx`: cursor, selection, editing intent를 presence payload로 보고
- `CanvasFileDropImporter.tsx`: code file/folder drag-and-drop을 tldraw Shape 생성으로 연결
- `reporters/CanvasStateReporter.tsx`: 로컬 Store 변경을 snapshot과 persistence callback으로 보고

파일과 폴더 읽기·검증은 `imports/`가 담당하고, `CanvasFileDropImporter`는 editor 좌표와
Shape 배치만 담당한다. Socket 연결과 room lifecycle은 `collaboration/`에 남긴다.

## runtime 내부 책임

`ClassicCanvasRuntime.tsx`는 hook과 상태 ref를 조립하고 effect/callback 실행 순서를
유지한다. 원격 변경을 보호하는 규칙은 `canvas-deferred-remote-operations.ts`,
roomState에 revision과 content hash를 보존하는 변환은
`canvas-room-shape-serialization.ts`가 담당한다.

`useCanvasViewportQueries.ts`는 viewport와 frame 자식의 실제 요청 순서를 소유한다.
`canvas-viewport-load-policy.ts`는 이미 불러온 viewport 범위 판정, frame 자식 조회 대상
판정, persisted metadata 읽기처럼 요청 순서와 무관한 순수 규칙만 제공한다.
