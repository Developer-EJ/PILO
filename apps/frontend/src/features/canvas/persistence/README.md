# Canvas Persistence

## 담당하는 것

- local Canvas 저장소
- shape diff와 API payload 변환
- shape batch queue, retry, fallback

## 담당하지 않는 것

- Socket.IO roomState 전송
- tldraw editor rendering
- toolbar와 overlay

## 시작해서 읽을 파일

1. `canvas-shape-sync.ts`
2. `canvas-shape-operations.ts`
3. `canvas-storage.ts`
4. `../engine/runtime/useCanvasShapePersistence.ts`

`canvas-shape-operations.ts`는 snapshot diff, API payload 변환과 create/update/delete
operation 생성을 담당하는 순수 계산 모듈이다. `canvas-shape-sync.ts`는 이 operation을
batch API, retry와 직렬 queue에 연결하며 기존 persistence public import 경로를 유지한다.
