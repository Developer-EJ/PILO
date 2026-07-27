# Canvas Styles

`canvas.css`는 Canvas route에서 한 번만 불러오는 전역 스타일 진입점이다.

`canvas.css`는 아래 하위 파일을 고정된 순서로 불러와 tldraw override와 Canvas
component 스타일의 cascade를 보존한다.

1. `canvas-shell.css`: route shell과 공통 floating panel
2. `canvas-file-node.css`: file node와 PDF/code preview
3. `canvas-screen.css`: toolbar, popover, runtime notice와 tldraw override
4. `canvas-selection.css`: group/frame selection toolbar
5. `canvas-editor-overlays.css`: background grid와 realtime editor overlay
6. `canvas-code-block.css`: code block shape와 CodeMirror
7. `canvas-controls.css`: zoom, trash와 responsive rule

route import는 `canvas.css` 하나로 유지한다. 하위 파일의 import 순서를 바꾸면
전역 tldraw selector 우선순위가 달라질 수 있으므로 함께 시각 회귀를 확인한다.
