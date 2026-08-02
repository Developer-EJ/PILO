# Realtime Checkpoint Conflict Case Study Design

Date: 2026-08-02

## 목적

이력서의 Realtime Server 저장 충돌 개선 항목에서 연결할 수 있는 공개용 한국어 트러블슈팅 문서를 작성한다. 문서는 문제, 원인, 해결, 검증, 결과를 짧게 설명하고 구현 PR과 검증 자료를 근거로 연결한다.

## 공개 문서와 자산

- 문서: `docs/case-studies/realtime-checkpoint-conflict.md`
- 이미지: `docs/assets/realtime-checkpoint-conflict/`
- 구현 근거: GitHub PR `#1797`

공개 이미지에는 AWS 계정 ID, ARN, 사용자 정보, 문서 ID, 인증 정보 및 실제 문서 내용을 포함하지 않는다. 기존 AWS 로그 이미지의 문서 ID는 가린 사본으로 사용한다.

## 문서 구성

1. 문제 배경
   - 여러 세션의 동일 버전 checkpoint가 `409 Conflict`를 일으키는 상황
   - Realtime Server가 2대로 늘어나면 인스턴스별 저장 큐만으로 문서 단위 순서를 보장할 수 없는 원인
2. 해결 구조
   - Redis Pub/Sub 기반 Yjs 변경사항 동기화
   - Redis 문서별 분산 Lease를 이용한 checkpoint 직렬화
   - 1초 batching, 최신 snapshot 병합 및 재시도, 종료 전 pending checkpoint 처리
3. 검증
   - 개발 ECS Realtime Server 2대
   - 브라우저 5개 동시 세션에서 세션별 300개 변경 입력
   - CloudWatch 오류 로그 조회와 전체 세션 재접속 확인
4. 결과
   - 총 1,500개 변경 입력 중 `409 Conflict` 및 checkpoint 저장 실패 0건
   - 재접속 후 입력한 1,500개 변경사항 유지
5. 추가 회귀 테스트
   - 로컬 Docker 2노드 환경에서 5세션 x 300개 변경을 3회 반복
   - 총 4,500개 변경, 정상 경로 `409 Conflict` 0건, 저장 및 신규 연결 확인 4,500/4,500
6. 근거 링크
   - PR, 주요 구현 파일, 테스트 파일 및 검증 자료

## 이미지 구성

- 개선 전 AWS `409 Conflict` 로그: 문서 ID를 비식별 처리한 사본
- 개선 후 AWS 오류 조회 결과: 조회 결과가 빈 배열임을 보여주는 로그
- 개선 후 ECS 상태: Realtime Server task definition revision 8과 실행 task 2개

로컬 Docker 반복 테스트 결과는 기존의 비식별화된 before/after 보고서 이미지를 추가 회귀 테스트 근거로 사용할 수 있다.

## 주장 범위

- 개발 ECS의 Realtime Server 2대와 명시한 테스트 조건에서 확인한 결과만 주장한다.
- 영구적인 무충돌, 모든 장애에서의 무손실, 운영 트래픽 규모 또는 강제 종료 시 무손실은 주장하지 않는다.
- `1,500회 편집`은 5개 세션이 각각 전송한 300개의 고유 변경 입력을 의미한다고 문서에서 정의한다.
- 개선 전 충돌은 문제와 원인 설명에 사용하고, 결과에는 개선 후 측정값만 기재한다.

## 완료 조건

- GitHub에서 Markdown과 이미지가 정상 렌더링된다.
- 모든 수치가 기존 검증 자료와 일치한다.
- 이미지와 본문에서 민감정보가 노출되지 않는다.
- 이력서에서 바로 사용할 공개 문서 URL과 PR 링크를 제공한다.
