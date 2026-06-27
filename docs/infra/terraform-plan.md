# Terraform 구현 계획

## 1. 목표

PILO 개발환경 AWS 인프라를 Terraform module 구조로 설계한다. 이 문서는 실제 Terraform 파일 작성 전 구현 순서와 모듈 경계를 정의한다.

실제 Terraform 파일은 사용자 승인 후 생성한다. 2026-06-27 기준으로 dev용 Terraform module 뼈대는 생성되었고, 아직 `terraform init`, `terraform plan`, `terraform apply`는 실행하지 않았다.

## 2. 제안 폴더 구조

아래 구조를 `infra/`에 생성하는 것을 제안한다.

```text
infra/
├─ envs/
│  └─ dev/
│     ├─ main.tf
│     ├─ variables.tf
│     ├─ outputs.tf
│     ├─ terraform.tfvars.example
│     ├─ providers.tf
│     ├─ backend.tf
│     └─ versions.tf
│
└─ modules/
   ├─ network/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ security-groups/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ s3/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ cloudfront/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ route53-acm/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ ecr/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ alb/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ ecs/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ rds/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ redis/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ sqs/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   ├─ secrets/
   │  ├─ main.tf
   │  ├─ variables.tf
   │  └─ outputs.tf
   │
   └─ iam/
      ├─ main.tf
      ├─ variables.tf
      └─ outputs.tf
```

## 3. 모듈별 책임

### network

생성 리소스:

- VPC
- Public Subnets
- Private Subnets
- Internet Gateway
- Public Route Table
- Private Route Table
- subnet tags

dev 기본값:

- NAT Gateway 생성 안 함
- Public Subnet에 default route `0.0.0.0/0 -> Internet Gateway`
- Private Subnet에는 인터넷 outbound route 없음

prod 확장 변수:

- `enable_nat_gateway`
- `single_nat_gateway`
- `enable_vpc_endpoints`

### security-groups

생성 리소스:

- ALB security group
- App Server security group
- Realtime Server security group
- AI Worker security group
- RDS security group
- Redis security group

원칙:

- RDS와 Redis는 ECS service security group에서 오는 traffic만 허용
- AI Worker inbound는 비워둔다
- App/Realtime inbound는 ALB security group만 허용

### s3

생성 리소스:

- frontend bucket
- uploads bucket
- public access block
- bucket policy
- optional lifecycle rule

Frontend bucket은 CloudFront Origin Access Control을 통해서만 접근하게 한다.

### cloudfront

생성 리소스:

- CloudFront distribution
- Origin Access Control
- frontend S3 origin 연결
- HTTPS certificate 연결
- default cache behavior

추후 필요 시 ALB를 추가 origin으로 연결할 수 있다.

### route53-acm

생성 리소스:

- ACM certificate
- DNS validation records
- Route53 alias records

주의:

- CloudFront용 ACM certificate는 `us-east-1`에 필요하다.
- ALB용 certificate는 `ap-northeast-2`에 필요하다.
- Terraform provider alias를 사용해야 한다.

### ecr

생성 repositories:

- `pilo-app-server`
- `pilo-realtime-server`
- `pilo-ai-worker`

설정:

- image scan on push
- lifecycle policy로 오래된 image 정리

### alb

생성 리소스:

- Application Load Balancer
- HTTP listener
- HTTPS listener
- App Server target group
- Realtime Server target group
- listener rules

Routing:

- `/api/*` -> App Server target group
- `/ws/*` -> Realtime Server target group
- `/socket.io/*` -> Realtime Server target group
- `/sync/*` -> Realtime Server target group

### ecs

생성 리소스:

- ECS cluster
- CloudWatch log groups
- ECS task execution role 연결
- ECS task roles 연결
- task definitions
- ECS services

서비스:

- app-server
- realtime-server
- ai-worker

dev 설정:

- launch type: Fargate
- subnets: Public Subnets
- `assign_public_ip = true`
- app/realtime은 ALB target group 연결
- ai-worker는 load balancer 연결 없음

prod 확장 변수:

- `ecs_subnet_type`
- `assign_public_ip`
- `desired_count`
- `enable_execute_command`

### rds

생성 리소스:

- DB subnet group
- RDS PostgreSQL instance
- parameter group if needed
- Secrets Manager secret reference 또는 generated password

dev 설정:

- private subnet only
- publicly accessible false
- small instance class
- Multi-AZ false

### redis

생성 리소스:

- ElastiCache subnet group
- ElastiCache Redis cache cluster 또는 replication group

dev 설정:

- private subnet only
- single node

### sqs

생성 리소스:

- AI jobs queue
- AI jobs DLQ
- GitHub webhooks queue
- GitHub webhooks DLQ

설정:

- visibility timeout은 AI 작업 예상 시간보다 길게 설정
- max receive count 설정
- queue URL/ARN output 제공

### secrets

생성 리소스:

- Secrets Manager secret shell
- 또는 외부에서 만든 secret ARN을 variable로 받는 방식

권장:

- Terraform이 secret value를 직접 들고 있지 않게 한다.
- Terraform은 secret name/ARN과 IAM permission만 관리한다.

### iam

생성 리소스:

- ECS task execution role
- App Server task role
- Realtime Server task role
- AI Worker task role
- GitHub Actions OIDC provider
- GitHub Actions deploy role

권한 원칙:

- execution role: ECR pull, CloudWatch Logs write, secret read if needed
- app task role: S3, SQS send, Secrets read, LiveKit/OpenAI secret read
- realtime task role: 필요한 S3/Secrets read만 최소화
- ai worker task role: SQS consume, S3 read/write, Secrets read
- GitHub role: ECR push, ECS deploy, CloudFront invalidation, S3 sync, Terraform plan/apply에 필요한 권한

## 4. 구현 단계

### Phase 1: 문서와 Terraform 뼈대

- `docs/infra/*` 문서 작성
- 사용자 승인 후 `infra/` Terraform 폴더 생성 완료
- provider/backend/version 정의 완료
- dev variable 설계 완료

### Phase 2: 네트워크와 보안

- network module
- security-groups module
- outputs 연결

### Phase 3: 저장소와 CI 기반

- ECR repositories
- S3 buckets
- IAM OIDC role
- GitHub Actions Terraform validation workflow

### Phase 4: 데이터 계층

- RDS PostgreSQL
- Redis
- SQS queues
- Secrets references

### Phase 5: ECS와 ALB

- ALB
- ECS cluster
- task definitions
- app-server service
- realtime-server service
- ai-worker service

### Phase 6: Frontend Delivery

- ACM
- Route53 records
- CloudFront
- frontend deploy workflow

### Phase 7: 서비스별 GitHub Actions

- app-server Docker build/push/deploy
- realtime-server Docker build/push/deploy
- ai-worker Docker build/push/deploy
- ECS service update

## 5. 현재 저장소 기준 주의사항

현재 저장소에는 실제 Next.js/NestJS/FastAPI 소스 디렉터리가 없다. 따라서 GitHub Actions workflow는 다음 경로를 가정하거나, 실제 소스 구조가 생긴 뒤 수정해야 한다.

제안 경로:

```text
apps/frontend/
apps/app-server/
apps/realtime-server/
apps/ai-worker/
```

Dockerfile 제안:

```text
apps/frontend/Dockerfile       # 정적 배포만 사용하면 불필요할 수 있음
apps/app-server/Dockerfile
apps/realtime-server/Dockerfile
apps/ai-worker/Dockerfile
```

## 6. 다음 승인 전에는 하지 않을 작업

- `terraform apply`
- AWS 리소스 생성
- secret value 작성
- 도메인 이름 확정
