# PILO 개발환경 배포 체크리스트

## 1. 현재 단계

현재 단계는 dev 인프라 생성과 Terraform remote state 전환을 마친 뒤,
애플리케이션 배포 준비를 진행하는 단계다.

완료된 작업:

- 현재 저장소 구조 확인
- 기존 GitHub Actions workflow 확인
- 개발환경 AWS 아키텍처 문서 작성
- Terraform 구현 계획 문서 작성
- secret/environment variable 목록 작성
- 배포 체크리스트 작성
- `infra/` Terraform module 뼈대 생성
- PILO 전용 GitHub Actions workflow 초안 생성
- AWS CLI 설치 및 IAM 사용자 인증 확인
- Terraform CLI 프로젝트 로컬 설치
- `terraform init` 완료
- `terraform validate` 완료
- `terraform plan` 완료
- `terraform apply` 완료
- AWS dev 인프라 91개 리소스 생성 완료
- Terraform remote state용 S3 bucket 생성 완료
- Terraform lock용 DynamoDB table 생성 완료
- `terraform init -migrate-state` 완료
- S3 remote state 기준 `terraform plan` no changes 확인 완료
- GitHub Actions repository variables 등록 완료
- Secrets Manager DB/Redis/JWT/Session/Webhook secret value 입력 완료
- 외부 연동 secret 입력용 PowerShell 스크립트 작성 완료
- Secrets Manager 외부 연동 secret value 입력 완료
- 기존 generic Docker workflow 정리 완료
- `apps/` 애플리케이션 기본 구조 생성 완료
- Next.js/NestJS/FastAPI 초기 배포 앱 작성 완료
- Next.js/NestJS 로컬 빌드 검증 완료
- npm production dependency audit 0 vulnerabilities 확인 완료

아직 하지 않은 작업:

- 애플리케이션 Docker image push

## 2. 사전 준비

### AWS 계정 준비

- AWS account id 확인
- region은 `ap-northeast-2` 사용
- Terraform state 저장용 S3 bucket 전략 결정
- Terraform lock용 DynamoDB table 사용 여부 결정

### 도메인 준비

- 실제 dev domain 결정
- Route53 hosted zone 준비
- CloudFront용 ACM certificate를 `us-east-1`에서 만들 계획 확인
- ALB용 ACM certificate를 `ap-northeast-2`에서 만들 계획 확인

### GitHub 준비

- GitHub repository owner/name 확인
- GitHub Actions OIDC 사용 승인
- 기존 `.github/workflows/docker-image.yml`, `.github/workflows/docker-publish.yml` 교체 여부 결정

### 애플리케이션 소스 구조 결정

제안 구조:

```text
apps/frontend/
apps/app-server/
apps/realtime-server/
apps/ai-worker/
```

각 서비스별 Dockerfile 경로를 확정해야 한다.

## 3. Terraform 작성 후 검증 순서

사용자 승인 후 실제 Terraform 파일을 만든 뒤 다음 순서로 검증한다.

1. Terraform formatting

```bash
terraform fmt -recursive
```

2. Terraform init

```bash
cd infra/envs/dev
terraform init
```

3. Terraform validate

```bash
terraform validate
```

4. Terraform plan

```bash
terraform plan
```

5. plan 검토

- NAT Gateway가 생성되지 않는지 확인
- RDS가 public으로 노출되지 않는지 확인
- Redis가 public으로 노출되지 않는지 확인
- ECS task가 dev에서 Public Subnet과 `assign_public_ip = true`를 사용하는지 확인
- AI Worker에 ALB target group이 붙지 않는지 확인
- secret value가 Terraform plan에 노출되지 않는지 확인

6. 사용자 승인 후에만 apply

```bash
terraform apply
```

## 4. 인프라 생성 순서

권장 순서:

1. network
2. security groups
3. iam
4. ecr
5. s3
6. sqs
7. rds
8. redis
9. alb
10. ecs
11. route53/acm
12. cloudfront
13. GitHub Actions

## 5. 배포 후 확인

### 네트워크

- ALB DNS 접속 가능 여부 확인
- ALB health check 통과 여부 확인
- ECS service desired/running count 확인
- Public Subnet ECS task에 public IP가 할당되었는지 확인
- RDS public accessibility가 false인지 확인
- Redis endpoint가 private subnet에 있는지 확인

### 로그

- App Server CloudWatch log stream 생성 확인
- Realtime Server CloudWatch log stream 생성 확인
- AI Worker CloudWatch log stream 생성 확인
- task startup error 확인

### 데이터 연결

- App Server에서 RDS 연결 확인
- App Server에서 Redis 연결 확인
- AI Worker에서 SQS consume 가능 여부 확인
- AI Worker에서 S3 read/write 가능 여부 확인

### 외부 연동

- OpenAI API secret 조회 가능 여부 확인
- GitHub webhook 수신 가능 여부 확인
- LiveKit token 발급 가능 여부 확인

## 6. GitHub Actions 검증

### Terraform validation workflow

- pull request에서 `terraform fmt` 실행
- pull request에서 `terraform validate` 실행
- pull request에서 `terraform plan` 실행
- OIDC assume role 성공 확인

### App Server workflow

- Docker build 성공
- ECR push 성공
- ECS service deployment 시작 확인
- ALB health check 통과 확인

### Realtime Server workflow

- Docker build 성공
- ECR push 성공
- ECS service deployment 시작 확인
- WebSocket path health check 확인

### AI Worker workflow

- Docker build 성공
- ECR push 성공
- ECS service deployment 시작 확인
- SQS consume log 확인

### Frontend workflow

- Next.js static build 성공
- S3 sync 성공
- CloudFront invalidation 성공
- frontend domain 접속 확인

## 7. 비용 체크

개발환경 비용 최소화 확인:

- NAT Gateway 없음
- RDS dev용 작은 instance class 사용
- Redis single node 사용
- ECS desired count 최소화
- CloudWatch log retention 짧게 설정
- ECR lifecycle policy 적용
- S3 lifecycle rule 검토
- 불필요한 Multi-AZ 비활성화

## 8. 롤백 기준

배포 실패 시:

1. ECS deployment event 확인
2. CloudWatch Logs 확인
3. 이전 ECR image tag로 ECS service update
4. 필요 시 Terraform 변경 revert
5. DB migration이 포함된 경우 migration rollback 전략 별도 확인

## 9. 승인 필요 작업

다음 작업은 사용자 승인 후 진행한다.

- 추가 AWS 리소스 생성 또는 변경
- 비용 발생 리소스 중지 또는 삭제
- Terraform state remote backend 전환
