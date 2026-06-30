# PILO Local Development Setup

이 문서는 모든 AGENT와 개발자가 같은 로컬 환경에서 구현하도록 맞추는 기준이다.

## 1. 환경 파일

```powershell
Copy-Item .env.example .env
```

개인 secret은 `.env`에만 넣고 commit하지 않는다.

## 2. 로컬 인프라 실행

```powershell
docker compose -f docker-compose.dev.yml up -d
```

제공 서비스:

| 서비스 | 주소 | 용도 |
|---|---|---|
| PostgreSQL | `localhost:5432` | PILO app DB |
| Redis | `localhost:6379` | cache/session/realtime state |
| LocalStack SQS | `localhost:4566` | agent job/result queue |

LocalStack은 시작 시 `localstack/init/ready.d/01-create-sqs.sh`를 실행해서 아래 queue를 만든다.

- `pilo-agent-jobs`
- `pilo-agent-results`

Windows bind mount 환경에서 LocalStack init hook이 실행되지 않으면 아래 fallback을 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/create-local-sqs-queues.ps1
```

PostgreSQL은 최초 실행 시 `docker-compose.dev.yml`에 mount된 SQL만 실행한다. 현재 자동 로드되는 파일은 `docs/db/pilo_erd_schema.sql`, `docs/db/migrations/202606281200_donghyun_auth_workspace_canvas_init.sql`, `docs/db/migrations/202606300500_mvp_task_drafts_rebaseline.sql`, `docs/db/seeds/001_donghyun_auth_workspace_canvas_seed.sql`, `docs/db/seeds/002_juhyung_github_review_seed.sql`이다. 스키마를 바꾼 뒤 다시 초기화하려면 volume을 삭제해야 한다.

```powershell
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
```

이미 실행 중인 로컬 DB에 migration/seed만 다시 적용하려면 아래 스크립트를 사용한다.

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/apply-local-db-sql.ps1
```

## 3. 앱 포트 기준

| 앱 | 포트 |
|---|---:|
| Frontend | 3000 |
| App Server | 4000 |
| Realtime Server | 4001 |
| AI Worker | 8000 |

## 4. DB 변경 규칙

- MVP DB 구조 변경은 `docs/db/mvp-db-schema-v1.md`에서 먼저 합의한다.
- local bootstrap 변경이 필요하면 `docs/db/pilo_erd_schema.sql`, 실제 migration, Prisma schema를 함께 rebaseline한다.
- migration 이름은 `YYYYMMDDHHMM_owner-slug_domain_action` 형식을 쓴다.
- owner slug는 `donghyun`, `juhyung`, `jinho`, `eunjae`, `sein`, `devops` 중 하나를 사용한다.
- 다른 도메인 테이블 변경은 contract PR을 먼저 올린다.
- seed는 `docs/db/seeds`에 두고, 실제 DB schema를 대체하지 않는다.

## 5. Mock / Stub 규칙

- 상대 도메인이 없으면 contract fixture로 작업한다.
- mock 사용 PR에는 후속 실제 연동 Issue를 연결한다.
- mock 데이터는 실제 DB table을 대체하지 않는다.

## 6. 로컬 실행 전 체크

- `.env`가 있는가?
- `docker compose -f docker-compose.dev.yml ps`에서 DB/Redis/LocalStack이 떠 있는가?
- 본인이 구현할 도메인 contract를 읽었는가?
- 소비할 외부 도메인 read model이 schema에 있는가?
