# PILO 인프라 환경 변수와 시크릿 목록

## 1. 원칙

- secret value는 Terraform 파일, GitHub Actions workflow, Dockerfile에 하드코딩하지 않는다.
- dev 환경에서도 DB password, OpenAI API key, GitHub App private key, LiveKit secret은 안전하게 관리한다.
- 가능하면 AWS Secrets Manager에 저장하고 ECS task가 IAM role로 읽는다.
- GitHub Actions는 AWS access key 대신 OIDC assume role을 사용한다.

## 2. Terraform Variable

아래 값들은 secret이 아니지만 환경별로 달라질 수 있으므로 variable로 둔다.

| 이름 | 설명 | 예시 |
| --- | --- | --- |
| `project_name` | 프로젝트 이름 | `pilo` |
| `environment` | 환경 이름 | `dev` |
| `aws_region` | AWS region | `ap-northeast-2` |
| `domain_name` | root domain | `pilo.example.com` |
| `frontend_domain_name` | frontend domain | `dev.pilo.example.com` |
| `api_domain_name` | API domain | `api.dev.pilo.example.com` |
| `hosted_zone_id` | Route53 hosted zone id | Terraform 입력 |
| `vpc_cidr` | VPC CIDR | `10.20.0.0/16` |
| `public_subnet_cidrs` | Public Subnet CIDRs | `10.20.0.0/24`, `10.20.1.0/24` |
| `private_subnet_cidrs` | Private Subnet CIDRs | `10.20.10.0/24`, `10.20.11.0/24` |
| `ecs_assign_public_ip` | ECS public IP 할당 여부 | `true` in dev |
| `enable_nat_gateway` | NAT Gateway 활성화 여부 | `false` in dev |
| `rds_instance_class` | RDS instance class | 비용 최소 dev 값 |
| `redis_node_type` | Redis node type | 비용 최소 dev 값 |
| `app_server_cpu` | App Server ECS CPU | `256` 또는 `512` |
| `app_server_memory` | App Server ECS memory | `512` 또는 `1024` |
| `realtime_server_cpu` | Realtime Server ECS CPU | `256` 또는 `512` |
| `realtime_server_memory` | Realtime Server ECS memory | `512` 또는 `1024` |
| `ai_worker_cpu` | AI Worker ECS CPU | `512` 이상 검토 |
| `ai_worker_memory` | AI Worker ECS memory | `1024` 이상 검토 |
| `github_owner` | GitHub organization/user | 예: `team-name` |
| `github_repo` | GitHub repository | 예: `PILO` |

## 3. AWS Secrets Manager 권장 Secret

### App Server

| Secret key | 설명 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 문자열 |
| `REDIS_URL` | Redis 접속 문자열 |
| `JWT_SECRET` | 서비스 JWT 서명 secret |
| `SESSION_SECRET` | session/cookie secret |
| `GOOGLE_OAUTH_CLIENT_ID` | Google 로그인 OAuth client id |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google 로그인 OAuth client secret |
| `GITHUB_LOGIN_CLIENT_ID` | GitHub 로그인 OAuth client id |
| `GITHUB_LOGIN_CLIENT_SECRET` | GitHub 로그인 OAuth client secret |
| `GITHUB_APP_ID` | GitHub App id |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook 검증 secret |
| `LIVEKIT_API_KEY` | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | LiveKit Cloud API secret |
| `LIVEKIT_URL` | LiveKit Cloud URL |
| `OPENAI_API_KEY` | App Server에서 직접 AI API를 호출할 경우 필요 |

### Realtime Server

| Secret key | 설명 |
| --- | --- |
| `DATABASE_URL` | 필요한 경우 PostgreSQL 접속 문자열 |
| `REDIS_URL` | Redis 접속 문자열 |
| `JWT_SECRET` | socket 인증 검증용 |

### AI Worker

| Secret key | 설명 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 문자열 |
| `REDIS_URL` | 필요한 경우 Redis 접속 문자열 |
| `OPENAI_API_KEY` | OpenAI Responses API 호출 |
| `GITHUB_APP_ID` | PR 분석에 GitHub App 인증이 필요한 경우 |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key |
| `S3_UPLOADS_BUCKET` | 결과/스냅샷 저장 bucket |

## 4. ECS 환경 변수

Secret이 아닌 값은 ECS task definition의 environment로 주입할 수 있다.

### 공통

| 변수 | 설명 |
| --- | --- |
| `NODE_ENV` | `development` 또는 `production` |
| `APP_ENV` | `dev` |
| `AWS_REGION` | `ap-northeast-2` |
| `LOG_LEVEL` | `info` 등 |

### App Server

| 변수 | 설명 |
| --- | --- |
| `PORT` | App Server port |
| `GITHUB_APP_SLUG` | GitHub App installation URL에 사용하는 app slug |
| `SQS_AI_JOBS_QUEUE_URL` | AI jobs queue URL |
| `SQS_GITHUB_WEBHOOKS_QUEUE_URL` | GitHub webhook queue URL |
| `S3_UPLOADS_BUCKET` | uploads bucket name |
| `FRONTEND_URL` | frontend URL |
| `API_BASE_URL` | API URL |

### Realtime Server

| 변수 | 설명 |
| --- | --- |
| `PORT` | Realtime Server port |
| `CORS_ORIGIN` | 허용 frontend origin |

### AI Worker

| 변수 | 설명 |
| --- | --- |
| `SQS_AI_JOBS_QUEUE_URL` | AI jobs queue URL |
| `SQS_GITHUB_WEBHOOKS_QUEUE_URL` | GitHub webhook queue URL if consumed |
| `S3_UPLOADS_BUCKET` | uploads bucket name |
| `AI_WORKER_CONCURRENCY` | worker 동시 처리 수 |

## 5. GitHub Actions Secrets와 Variables

OIDC를 사용하므로 AWS access key는 저장하지 않는다.

### GitHub Actions Variables

| 이름 | 설명 |
| --- | --- |
| `AWS_REGION` | `ap-northeast-2` |
| `AWS_ACCOUNT_ID` | AWS account id |
| `TERRAFORM_WORKING_DIR` | `infra/envs/dev` |
| `ECR_APP_SERVER_REPOSITORY` | `pilo-app-server` |
| `ECR_REALTIME_SERVER_REPOSITORY` | `pilo-realtime-server` |
| `ECR_AI_WORKER_REPOSITORY` | `pilo-ai-worker` |
| `ECS_CLUSTER_NAME` | ECS cluster name |
| `ECS_APP_SERVER_SERVICE` | App Server service name |
| `ECS_REALTIME_SERVER_SERVICE` | Realtime service name |
| `ECS_AI_WORKER_SERVICE` | AI Worker service name |
| `FRONTEND_S3_BUCKET` | frontend bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | frontend distribution id |

### GitHub Actions Variables

IAM Role ARN 자체는 비밀값이 아니므로 repository variable로 둘 수 있다.

| 이름 | 설명 |
| --- | --- |
| `AWS_GITHUB_ACTIONS_ROLE_ARN` | GitHub Actions가 assume할 AWS IAM role ARN |

## 6. 절대 커밋하면 안 되는 값

- `.env`
- `.env.local`
- `.env.production`
- `terraform.tfvars`
- DB password
- OpenAI API key
- GitHub App private key
- LiveKit API secret
- JWT secret
- AWS access key
- AWS secret access key

`terraform.tfvars.example`만 커밋하고, 실제 `terraform.tfvars`는 `.gitignore`에 추가하는 것을 권장한다.
