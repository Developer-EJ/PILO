# PILO Design Guide

이 문서는 `PILO_프로토타입_polished.html`의 대시보드 화면에서 추출한 디자인 규칙이다. 모든 기능 화면은 아래 토큰과 레이아웃 원칙을 기준으로 개발한다.

## 디자인 방향

PILO는 AI 기반 프로젝트 협업 도구이므로, 화면은 SaaS 운영 툴처럼 조용하고 밀도 있게 구성한다. 장식적인 랜딩 페이지보다 반복 사용, 빠른 스캔, 상태 비교, 업무 전환을 우선한다.

## 컬러 토큰

| 용도 | 값 | 사용처 |
|---|---|---|
| Ink | `#0f1422` | 사이드바, 주요 텍스트 |
| Background | `#eceef3` | 전체 앱 배경 |
| Surface | `#ffffff` | 카드, 패널, 헤더 |
| Primary | `#6d5bd6` | 활성 메뉴, 주요 액션, Agent |
| Primary 2 | `#8b5cf6` | 브랜드 그라디언트, 활성 강조 |
| Muted | `#8a93a6` | 보조 텍스트, 라벨 |
| Soft Text | `#5b6478` | 메타 정보 |
| Success | `#2e9e5b` | 완료, 결정, 정상 |
| Warning | `#d9941f` | 리뷰 대기, D-1 |
| Danger | `#e5484d` | 오늘 마감, blocked, live |
| Line | `rgba(15, 20, 34, 0.09)` | 일반 border |
| Strong Line | `rgba(15, 20, 34, 0.14)` | 강조 border |

## 배경

- 기본 배경은 `#eceef3` 위에 28px 간격의 아주 옅은 grid를 사용한다.
- 화면 상단에는 보라색과 초록색 radial highlight를 약하게 깔아 깊이를 만든다.
- 큰 그라디언트 hero나 장식용 blob은 사용하지 않는다.

```css
background:
  radial-gradient(circle at 18% 8%, rgba(109, 91, 214, 0.085), transparent 26%),
  radial-gradient(circle at 86% 18%, rgba(16, 185, 129, 0.052), transparent 24%),
  linear-gradient(rgba(15, 20, 34, 0.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(15, 20, 34, 0.025) 1px, transparent 1px),
  #eceef3;
background-size: auto, auto, 28px 28px, 28px 28px, auto;
```

## 타이포그래피

- 기본 폰트는 `Pretendard`, fallback은 system sans-serif를 사용한다.
- 숫자, 타이머, 로그성 값은 `JetBrains Mono` 또는 `ui-monospace`를 사용한다.
- 카드 제목은 15px, 목록 본문은 13px~13.5px, 보조 라벨은 11px~12.5px 범위를 기준으로 한다.
- letter spacing은 기본값을 유지하고, 큰 제목을 제외하면 과한 display type을 쓰지 않는다.

## 레이아웃

- 앱은 좌측 사이드바 248px + 우측 workspace 구조를 기본으로 한다.
- 상단 헤더는 약 74px 높이, 배경은 반투명 흰색과 blur를 사용한다.
- 메인 컨텐츠 max-width는 1204px, 내부 padding은 desktop 기준 `26px 28px 72px`이다.
- 대시보드 본문은 `1.55fr 1fr` 2컬럼으로 구성한다.
- 카드 간격은 14px~16px를 기본으로 한다.

## 사이드바

- 배경은 `#0f1422`에 보라색 상단 그라디언트를 아주 약하게 추가한다.
- 활성 메뉴는 `#262e48` 위에 primary 계열 좌측 inset bar를 사용한다.
- 비활성 메뉴는 클릭 가능한 상세 페이지가 준비되기 전까지 link가 아닌 preview item으로 둔다.
- badge는 작은 pill 형태로 표시한다.

## 카드와 패널

- 반복 카드 radius는 14px~16px를 사용한다.
- border는 `#e4e7ee`, shadow는 아주 약하게 `0 1px 2px rgba(16,24,40,.04)` 또는 soft shadow를 사용한다.
- 카드 내부 padding은 15px~18px 범위로 맞춘다.
- 중첩 카드 구조는 피하고, 패널 안 반복 row 또는 작은 item만 둔다.

## 상태 표현

- 오늘 마감, live, blocked는 danger red를 사용한다.
- 리뷰 대기, D-1은 warning amber를 사용한다.
- 완료, 정상, 결정사항은 success green을 사용한다.
- AI/Agent 추천, 활성 상태, 주요 액션은 primary purple을 사용한다.

## Dashboard 필수 구성

- Stat row: 진행 중 Task, 리뷰 대기 PR, 이번 주 마감, 막힌 작업
- Left column: 오늘 해야 할 일, 리뷰 대기 PR
- Right column: Agent 다음 제안, 최근 회의 결정
- Header: 현재 화면 제목, 회의 중 chip, 사용자 avatar
- Sidebar: 도메인 메뉴 preview

## 상세 페이지 제거 원칙

현재 MVP 첫 화면은 대시보드 레이아웃만 제공한다.

- 카드, 메뉴, CTA는 상세 페이지로 이동하지 않는다.
- 상세 route, modal, board, canvas, review room은 구현하지 않는다.
- 향후 상세 화면이 생기면 해당 도메인의 contract와 owner 규칙을 먼저 확정한다.

## 구현 규칙

- 색상은 위 토큰에서 가져오고 임의 색상 추가를 최소화한다.
- 기능 화면도 대시보드와 같은 sidebar, topbar, card radius, spacing 체계를 유지한다.
- 화면 설명용 텍스트를 길게 붙이지 말고, 실제 업무 정보가 먼저 보이게 한다.
- 한 화면에서 과한 보라색 사용을 피하고 success/warning/danger 상태색을 함께 사용한다.
- 모바일에서는 sidebar를 상단 block으로 전환하고, 본문 grid는 1컬럼으로 접는다.

