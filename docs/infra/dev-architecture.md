# PILO 개발환경 AWS 아키텍처

## 1. 목적

PILO 개발환경 인프라는 비용을 최소화하면서도 실제 MVP 구조를 검증할 수 있도록 설계한다. 모든 AWS 리소스는 Terraform으로 관리하며, 콘솔에서 수동 생성한 리소스는 예외로 두지 않는다.

현재 저장소에는 `apps/`와 `infra/`가 존재한다. 이 문서는 dev 인프라의 아키텍처 기준이며, 실제 진행 상태는 `docs/infra/deploy-checklist.md`와 `infra/` 구현을 함께 확인한다.

## 2. 기본 원칙

- AWS region은 `ap-northeast-2`를 사용한다.
- 개발환경에서는 NAT Gateway를 만들지 않는다.
- ECS Fargate task는 Public Subnet에서 실행하고 `assign_public_ip = true`를 사용한다.
- RDS PostgreSQL과 ElastiCache Redis는 Private Subnet에 둔다.
- RDS와 Redis는 public 접근을 허용하지 않는다.
- App Server와 Realtime Server의 inbound traffic은 ALB security group에서만 허용한다.
- AI Worker는 인터넷 inbound를 받지 않고 outbound만 사용한다.
- API key, DB password, GitHub private key, LiveKit secret은 Terraform 파일에 하드코딩하지 않는다.
- 비밀값은 AWS Secrets Manager 또는 SSM Parameter Store 참조로 관리한다.
- ECS 로그는 CloudWatch Logs로 수집한다.
- LiveKit은 MVP에서 self-hosting하지 않고 LiveKit Cloud를 사용한다.

## 3. 서비스 구성

### Frontend

- 기술: Next.js
- 개발환경 배포 선호안: 정적 export가 가능하면 S3 + CloudFront
- HTTPS와 커스텀 도메인: Route53 + ACM
- 예시 도메인: `dev.pilo.example.com`
- 실제 도메인은 Terraform variable로 주입한다.

### App Server

- 기술: NestJS
- 실행: ECS Fargate
- 역할:
  - Google/GitHub 소셜 로그인 및 세션 인증
  - workspace/member/task 관리
  - GitHub App 연동
  - 파일 metadata 관리
  - 알림 생성
  - AI job 생성
  - LiveKit room token 발급
- inbound:
  - ALB에서 오는 `/api/*` traffic만 허용
- outbound:
  - RDS, Redis, S3, SQS, Secrets Manager, GitHub, LiveKit Cloud 접근

### Realtime Server

- 기술: WebSocket 서버
- 실행: ECS Fargate
- 역할:
  - canvas sync
  - chat
  - presence
  - meeting state
  - realtime notification
- inbound:
  - ALB에서 오는 `/ws/*`, `/socket.io/*`, `/sync/*` traffic만 허용
- outbound:
  - Redis, RDS, S3 접근

### AI Worker Server

- 기술: FastAPI 기반 Python/LangGraph worker
- 실행: ECS Fargate
- 역할:
  - SQS message consume
  - OpenAI Responses API 호출
  - meeting report 생성
  - task suggestion 생성
  - PR analysis 생성
  - review summary 생성
  - RDS/S3에 결과 저장
- inbound:
  - 인터넷 inbound 없음
- outbound:
  - SQS, RDS, S3, Secrets Manager, OpenAI API 접근

### Voice

- MVP에서는 LiveKit Cloud를 사용한다.
- App Server가 LiveKit room token을 발급한다.
- LiveKit self-hosting은 현재 범위에서 제외한다.

## 4. 네트워크 구조

개발환경 구조:

```text
VPC
├─ Public Subnet A
│  ├─ ALB
│  └─ ECS Fargate tasks
│     ├─ app-server
│     ├─ realtime-server
│     └─ ai-worker
│
├─ Public Subnet B
│  ├─ ALB
│  └─ ECS Fargate tasks
│
├─ Private Subnet A
│  ├─ RDS PostgreSQL
│  └─ ElastiCache Redis
│
└─ Private Subnet B
   ├─ RDS PostgreSQL subnet group
   └─ ElastiCache Redis subnet group
```

개발환경에서 ECS task를 Public Subnet에 두는 이유는 NAT Gateway 없이도 다음 outbound가 필요하기 때문이다.

- ECR image pull
- CloudWatch Logs 전송
- Secrets Manager 또는 SSM Parameter Store 조회
- OpenAI API 호출
- GitHub API/Webhook 처리
- LiveKit Cloud API 호출

RDS와 Redis는 Private Subnet에 두고 security group으로 ECS task에서 오는 traffic만 허용한다.

## 5. Security Group 설계

### ALB Security Group

Inbound:

- `80/tcp` from `0.0.0.0/0`
- `443/tcp` from `0.0.0.0/0`

Outbound:

- App Server target port
- Realtime Server target port

### App Server Security Group

Inbound:

- App Server port from ALB security group

Outbound:

- PostgreSQL `5432/tcp`
- Redis `6379/tcp`
- HTTPS `443/tcp`
- SQS/S3/Secrets Manager endpoints via public internet in dev

### Realtime Server Security Group

Inbound:

- Realtime Server port from ALB security group

Outbound:

- PostgreSQL `5432/tcp`
- Redis `6379/tcp`
- HTTPS `443/tcp`

### AI Worker Security Group

Inbound:

- 없음

Outbound:

- PostgreSQL `5432/tcp`
- Redis `6379/tcp` if needed
- HTTPS `443/tcp`

### RDS Security Group

Inbound:

- `5432/tcp` from App Server security group
- `5432/tcp` from Realtime Server security group if needed
- `5432/tcp` from AI Worker security group

Outbound:

- 기본값 또는 최소화

### Redis Security Group

Inbound:

- `6379/tcp` from App Server security group
- `6379/tcp` from Realtime Server security group
- `6379/tcp` from AI Worker security group if needed

Outbound:

- 기본값 또는 최소화

## 6. ALB Routing

기본 routing:

```text
dev.pilo.example.com/*          -> frontend CloudFront/S3
api.dev.pilo.example.com/api/*  -> ALB -> App Server
api.dev.pilo.example.com/ws/*   -> ALB -> Realtime Server
api.dev.pilo.example.com/sync/* -> ALB -> Realtime Server
```

단일 도메인 path routing도 가능하다.

```text
dev.pilo.example.com            -> CloudFront
dev.pilo.example.com/api/*      -> ALB -> App Server
dev.pilo.example.com/ws/*       -> ALB -> Realtime Server
```

첫 구현에서는 CloudFront frontend와 ALB backend를 분리한 `dev`/`api.dev` 도메인 구조가 더 이해하기 쉽다. CloudFront가 ALB origin까지 함께 들고 가는 구조는 이후 필요할 때 확장한다.

## 7. 데이터 계층

### RDS PostgreSQL

- dev instance class는 비용 절감을 위해 작은 인스턴스를 사용한다.
- `publicly_accessible = false`
- subnet group은 Private Subnet만 포함한다.
- 초기에는 Multi-AZ를 끈다.
- deletion protection은 dev에서는 false로 둘 수 있으나, 실수 방지를 위해 변수화한다.
- Prisma migration은 애플리케이션 배포 파이프라인에서 별도 단계로 다루는 것을 권장한다.

### ElastiCache Redis

- Private Subnet에 배치한다.
- single node dev 구성을 우선한다.
- 용도:
  - presence
  - websocket pub/sub
  - short-lived cache
  - agent job status cache if needed
- source of truth는 PostgreSQL이다.

### S3

두 종류의 bucket을 분리한다.

- frontend static bucket
- uploads/reports/snapshots bucket

uploads bucket은 public access block을 활성화하고, presigned URL 또는 backend proxy 방식으로 접근한다.

## 8. 비동기 작업 구조

SQS는 NestJS App Server와 AI Worker/GitHub Worker 사이의 비동기 작업 큐다.

기본 queue:

- `pilo-dev-ai-jobs`
- `pilo-dev-ai-jobs-dlq`
- `pilo-dev-github-webhooks`
- `pilo-dev-github-webhooks-dlq`

흐름:

```text
User -> Next.js -> App Server -> RDS job record 생성
                           └-> SQS message publish
AI Worker -> SQS message consume -> OpenAI/GitHub/S3/RDS 처리
AI Worker -> RDS result 저장 -> Realtime notification
```

## 9. CI/CD 개요

GitHub Actions는 OIDC 기반으로 AWS IAM Role을 assume한다. 장기 AWS access key를 GitHub Secrets에 저장하지 않는다.

필요 workflow:

- Terraform validation
  - `terraform fmt`
  - `terraform validate`
  - pull request에서 `terraform plan`
- App Server image build/push/deploy
- Realtime Server image build/push/deploy
- AI Worker image build/push/deploy
- Frontend static build/upload/CloudFront invalidation

현재 저장소에는 `.github/workflows/docker-image.yml`, `.github/workflows/docker-publish.yml`이 있으나, PILO의 AWS/ECR/ECS 배포 기준으로 재작성하는 것이 좋다.

## 10. Production 확장 고려

Terraform module은 dev와 prod를 variable로 분리할 수 있게 만든다.

prod 전환 시 바뀔 주요 값:

- ECS subnets: Public Subnet -> Private Subnet
- `assign_public_ip`: true -> false
- NAT Gateway 또는 VPC Endpoint 활성화
- RDS Multi-AZ 활성화
- Redis replication group 구성
- deletion protection 활성화
- CloudFront/ALB WAF 검토
- 로그 보존 기간 증가

현재 단계에서는 prod 리소스를 구현하지 않고, variable 구조만 prod 전환을 고려해 설계한다.
