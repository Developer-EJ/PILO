# PILO 운영 도메인 전환 Runbook

관련 Issue: #1737

이 문서는 현재 dev 인프라를 운영 canonical 도메인으로 전환하는 작업 순서다.
명령은 저장소 루트에서 PowerShell로 실행한다.

## 고정 범위

- Canonical Frontend: `https://pilo.my`
- Legacy Frontend: `https://dev.pilo.my`
- Canonical API/Realtime: `https://api.pilo.my`
- Legacy API/Realtime: `https://api.dev.pilo.my`
- Frontend legacy redirect: 초기 `302`, 안정성 승인 후 `308`
- Legacy API/Realtime는 redirect하지 않고 활성 상태로 유지한다.
- 유지: `livekit.dev.pilo.my`, `turn.dev.pilo.my`
- 유지: LiveKit webhook `https://api.dev.pilo.my/api/v1/livekit/webhooks`
- 유지: `environment = "dev"`, `pilo-dev-*`, 기존 Terraform state와 ECS 네트워크

## 1. Repository variables 준비

아래 표는 승인 뒤 사용할 목표값이다. 이 단계에서는 현재값 조회, 기록 또는 실제
변경을 수행하지 않는다.

전환 전 internal PR plan에서는 새 legacy/redirect repository variable이 등록되지 않으면
각각 `[]`, `[]`, `302` bootstrap 기본값을 사용해 현재 single-host 구성을 모델링한다.
실제 전환 plan은 2절의 일곱 CLI `-var` 값으로만 전환 도메인 입력을 고정한다.
인프라 health 성공 뒤에는 canonical `TF_PLAN_*` 값을 먼저 등록하고, runtime `NEXT_PUBLIC_*`
값을 등록한 다음에만 Frontend 재배포를 시작한다.

| 이름 | 승인 후 설정할 값 |
| --- | --- |
| `NEXT_PUBLIC_PILO_APP_SERVER_URL` | `https://api.pilo.my` |
| `NEXT_PUBLIC_PILO_REALTIME_SERVER_URL` | `https://api.pilo.my` |
| `TF_PLAN_DOMAIN_NAME` | `pilo.my` |
| `TF_PLAN_FRONTEND_DOMAIN_NAME` | `pilo.my` |
| `TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES` | `["dev.pilo.my"]` |
| `TF_PLAN_API_DOMAIN_NAME` | `api.pilo.my` |
| `TF_PLAN_API_LEGACY_DOMAIN_NAMES` | `["api.dev.pilo.my"]` |
| `TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE` | `302` |

실제 값을 바꿀 때는 승인된 표의 값을 그대로 사용하고 JSON 배열의 따옴표를 보존한다.

## 2. Terraform plan gate

승인 전에는 init, plan, show만 operator PowerShell에서 실행한다. 나머지 비도메인
dev 입력은 운영자의 기존 승인된 환경(`terraform.tfvars`, 승인된 환경변수 또는
동등한 표준 입력 경로)에 그대로 로드되어 있어야 한다. 아래 CLI `-var`는
`terraform.tfvars`와 `*.auto.tfvars` 등 auto-loaded tfvars의 오래된 도메인 값보다
우선하므로, 전환에 필요한 일곱 입력을 saved plan에 정확히 고정한다.

```powershell
terraform -chdir=infra/envs/dev init
if ($LASTEXITCODE -ne 0) { throw "terraform init failed" }

terraform -chdir=infra/envs/dev plan `
  -input=false `
  -var 'domain_name=pilo.my' `
  -var 'frontend_domain_name=pilo.my' `
  -var 'frontend_legacy_domain_names=[\"dev.pilo.my\"]' `
  -var 'api_domain_name=api.pilo.my' `
  -var 'api_legacy_domain_names=[\"api.dev.pilo.my\"]' `
  -var 'frontend_legacy_redirect_status_code=302' `
  -var 'create_dns_records=true' `
  -out=tfplan-domain-cutover
if ($LASTEXITCODE -ne 0) { throw "terraform plan failed" }

terraform -chdir=infra/envs/dev show -no-color tfplan-domain-cutover
if ($LASTEXITCODE -ne 0) { throw "terraform show failed" }
```

PowerShell single-quoted `-var` argument 안의 `\"`는 native Terraform argv에서
JSON double quote로 전달되어 두 list 값의 `["..."]` 형태를 보존한다.
도메인 `TF_VAR` assignment를 사용하지 않으므로 operator shell이나 이후 rollback plan에
canonical 입력이 누출되지 않는다. init, plan 또는 show 실패 시 `throw`가 현재 절차를
중단하므로 승인 단계로 이동하지 않는다. 저장된 plan 파일은 위 일곱 CLI 값과 현재
승인된 비도메인 dev 입력의 조합으로만 생성한다.

위 명령으로 저장한 `tfplan-domain-cutover`와
`terraform show -no-color tfplan-domain-cutover`의 전체 결과를 검토한다. 허용되는
변경 범위는 다음과 같다.

- ACM certificate와 DNS validation record
- Route53 alias record
- CloudFront aliases, Function, Distribution 설정
- ALB HTTPS certificate/listener 연결
- ECS task definition environment 값
- uploads S3 CORS origin

RDS, Redis, S3 bucket, VPC, subnet, ECS cluster/service, LiveKit EC2/EIP/DNS의
삭제 또는 replacement가 보이면 apply하지 않는다. 네트워크와 data-plane 리소스의
생성도 이 전환 범위가 아니므로 중단하고 plan 원인을 조사한다.

검토 결과에는 리소스별 add/change/destroy 수, replacement 유무, 예상 영향과
검토자를 기록한다.

## 3. Apply 승인 지점

> **STOP HERE.** 저장한 Terraform plan과 rollback 절차를 Infra/Realtime 담당자에게
> 공유하고 명시적으로 승인받기 전에는 Terraform apply, repository variable 변경,
> OAuth/GitHub provider 변경을 실행하지 않는다.

승인에는 plan 파일 생성 시각과 commit SHA, replacement 없음, 작업 시각,
rollback 담당자를 포함한다. 승인 전에는 다음 절의 어떤 mutation도 시작하지 않는다.

## 4. Maintenance-window cutover

활성 사용자가 없으므로 OAuth/login과 webhook의 짧은 일시 중단을 허용한다.
dual-callback staging은 사용하지 않는다. 승인 뒤 다음 순서를 바꾸지 않는다.

1. 현재 provider/repository 값을 rollback 기록에 남긴다. 정확한 현재 callback URL 5개, GitHub App webhook URL, 1절 repository variables 각각의 값, 기록 시각, 작업자와 provider 저장 화면을 기록한다.
2. Google/GitHub OAuth/setup callback URL을 canonical 값으로 변경한다. 각 callback은 5절 순서대로 하나씩 변경하며, 한 callback의 저장과 검증이 성공한 뒤에만 다음 callback으로 이동한다. login callback은 실제 login, OAuth callback은 연결 완료, setup URL은 설치 화면 진입으로 검증한다. single-callback GitHub OAuth App은 legacy callback을 canonical callback으로 직접 교체한다.

   callback 저장 또는 검증 실패 시 이미 변경한 callback을 변경의 역순으로 모두 복원하고 복원 결과를 검증한 뒤 8절 rollback 경계로 이동한다. 이 경우 Terraform plan을 apply하지 않는다.
3. 승인된 저장 plan만 적용한다.

   ```powershell
   terraform -chdir=infra/envs/dev apply tfplan-domain-cutover
   if ($LASTEXITCODE -ne 0) { throw "terraform apply failed; 8절 rollback 경계로 이동" }

   $ecsClusterName = terraform -chdir=infra/envs/dev output -raw ecs_cluster_name
   if ($LASTEXITCODE -ne 0) { throw "ecs_cluster_name output failed; 8절 rollback 경계로 이동" }

   $ecsServiceNamesJson = terraform -chdir=infra/envs/dev output -json ecs_service_names
   if ($LASTEXITCODE -ne 0) { throw "ecs_service_names output failed; 8절 rollback 경계로 이동" }

   try {
     $ecsServiceNames = $ecsServiceNamesJson | ConvertFrom-Json -ErrorAction Stop
   } catch {
     throw "ecs_service_names output parsing failed; 8절 rollback 경계로 이동"
   }

   $affectedEcsServices = @(
     $ecsServiceNames.'app-server'
     $ecsServiceNames.'realtime-server'
     $ecsServiceNames.'ai-worker'
     $ecsServiceNames.'agent-worker'
     $ecsServiceNames.'meeting-worker'
     $ecsServiceNames.'pr-review-ai-worker'
     $ecsServiceNames.'github-sync-worker'
   )
   if (
     $affectedEcsServices.Count -ne 7 -or
     @($affectedEcsServices | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -ne 0
   ) {
     throw "affected ECS service output resolution failed; 8절 rollback 경계로 이동"
   }

   aws ecs wait services-stable --cluster $ecsClusterName --services $affectedEcsServices
   if ($LASTEXITCODE -ne 0) { throw "ECS services-stable waiter failed; 8절 rollback 경계로 이동" }
   ```

   Terraform output 해석과 일곱 서비스의 ECS `services-stable` waiter가 모두 성공한
   뒤에만 다음 health/login 검증으로 이동한다.
4. canonical/legacy API health와 login callback을 즉시 검증한다.

   ```powershell
   curl.exe -I https://pilo.my
   if ($LASTEXITCODE -ne 0) { throw "canonical frontend health failed; 8절 rollback 경계로 이동" }

   curl.exe -I "https://dev.pilo.my/path?query=value"
   if ($LASTEXITCODE -ne 0) { throw "legacy frontend health failed; 8절 rollback 경계로 이동" }

   curl.exe https://api.pilo.my/api/v1/health
   if ($LASTEXITCODE -ne 0) { throw "canonical API health failed; 8절 rollback 경계로 이동" }

   curl.exe https://api.dev.pilo.my/api/v1/health
   if ($LASTEXITCODE -ne 0) { throw "legacy API health failed; 8절 rollback 경계로 이동" }
   ```

   `pilo.my`의 TLS와 응답이 정상이어야 한다. `dev.pilo.my` 응답은 `302`이고
   `Location`은 정확히 `https://pilo.my/path?query=value`여야 한다. canonical과
   legacy API health가 모두 성공하고 legacy API가 redirect하지 않아야 한다.
   Google/GitHub login을 각각 실행해 canonical callback과 세션 생성을 확인한다.
   apply, Terraform output 해석, ECS services-stable waiter 또는 health/login 검증이 실패하면
   변경한 모든 callback을 기록한 legacy callback 값으로 역순 복원하고 복원 결과를 검증한
   뒤 8절 rollback 경계로 이동한다.
5. canonical API health 성공 이후에만 GitHub App webhook을 canonical 값으로 변경한다. GitHub App webhook 저장과 test delivery가 모두 성공해야 다음 단계로 이동한다. GitHub App webhook 저장 또는 test delivery가 실패하면 이전 webhook을 즉시 복원하고 복원 test delivery를 확인한 뒤 8절 rollback 경계로 이동한다. 이 경우 repository variables는 변경하지 않는다.
6. repository variables를 1절의 값으로 변경한다. 각 variable은 하나씩 업데이트한다. repository variable 업데이트가 실패하면 지금까지 변경한 variable을 기록한 값으로 변경의 역순으로 모두 복원하고 8절 rollback 경계로 이동한다. 이 경우 서비스와 Frontend를 배포하지 않는다. 모든 업데이트가 성공한 뒤에만 6절 순서로 재배포한다.

LiveKit webhook은 이 순서 전체에서
`https://api.dev.pilo.my/api/v1/livekit/webhooks`로 유지하며 변경하지 않는다.

## 5. Canonical provider 값

4절에서 provider 유형과 시점에 맞춰 다음 값을 정확히 등록한다.

- Google login callback: `https://api.pilo.my/api/v1/auth/google/callback`
- GitHub login callback: `https://api.pilo.my/api/v1/auth/github/callback`
- GitHub user OAuth callback: `https://api.pilo.my/api/v1/github/oauth/callback`
- GitHub ProjectV2 OAuth callback: `https://api.pilo.my/api/v1/github/project-oauth/callback`
- GitHub App setup URL: `https://api.pilo.my/api/v1/github/installations/callback`
- GitHub App webhook URL: `https://api.pilo.my/api/v1/github/webhooks`

Google/GitHub OAuth와 GitHub App setup URL은 plan apply 전에 직접 교체하고,
GitHub App webhook은 canonical API health 성공 뒤에만 교체한다. LiveKit provider와
DNS는 변경하지 않는다. LiveKit webhook
`https://api.dev.pilo.my/api/v1/livekit/webhooks`는 변경하지 않는다.

## 6. 애플리케이션 재배포 순서

4절에서 canonical API health, GitHub App webhook test delivery, repository
variables 변경까지 성공한 뒤 다음 순서로 배포한다.

1. App Server와 Realtime Server task definition을 canonical origin 값으로 배포한다.
2. Worker task definition을 canonical API origin 값으로 배포한다.
3. Frontend를 canonical API/Realtime repository variable로 build하고 S3/CloudFront에 배포한다.
4. CloudFront 전체 invalidation을 실행한다.

각 단계에서 ECS deployment가 stable인지 또는 Frontend artifact 업로드와
invalidation이 성공했는지 확인한 뒤 다음 단계로 이동한다. 실패하면 추가 배포를
멈추고 8절 rollback을 시작한다.

## 7. 전체 smoke test

- [ ] `https://pilo.my`의 정적 페이지와 인증이 필요한 하위 route를 브라우저에서 연다.
- [ ] `curl.exe -I "https://dev.pilo.my/path?query=value"`로 path/query 보존과 `302`를 확인한다.
- [ ] `curl.exe https://api.pilo.my/api/v1/health`와 `curl.exe https://api.dev.pilo.my/api/v1/health`가 모두 성공하는지 확인한다.
- [ ] Google/GitHub login을 각각 완료하고 canonical callback 뒤 세션이 유지되는지 확인한다.
- [ ] GitHub OAuth 연결, GitHub App 설치, test webhook delivery가 각각 성공하는지 확인한다.
- [ ] 서로 다른 두 브라우저 세션에서 Socket.IO Canvas/Board/Meeting 실시간 연결과 이벤트 전달을 확인한다.
- [ ] 테스트 파일로 S3 presigned upload/download를 수행하고 브라우저 CORS 오류가 없는지 확인한다.
- [ ] LiveKit room/token/recording을 실행하고 녹음 파일이 기존 S3 경로에 생성되는지 확인한다.
- [ ] ECS 서비스 오류율, ALB 4xx/5xx, CloudFront 오류율을 확인하고 결과와 시각을 작업 기록에 남긴다.

한 항목이라도 실패하면 원인과 실패 시각을 기록하고 308 전환을 진행하지 않는다.
사용자 영향이 있거나 빠른 수정이 불가능하면 즉시 rollback한다.

## 8. Rollback

1. 작업 전 기록한 Frontend/API/Realtime repository variables를 legacy 값으로 복원한다.
2. OAuth callback과 GitHub App webhook을 기록한 legacy API origin으로 복원하고 저장 결과를 확인한다.
3. 직전 정상 task definition으로 모든 ECS 서비스를 재배포하고 직전 정상 Frontend artifact를 재배포한 뒤 CloudFront 전체 invalidation을 실행한다.
4. Terraform에서 canonical alias/SAN/redirect 변경을 위한 별도 되돌림 plan을 만들고, 삭제/replacement와 영향도를 검토한 뒤 Infra/Realtime 담당자의 명시적 승인을 받아 적용한다.
5. `curl.exe https://api.dev.pilo.my/api/v1/health`가 성공하는지 확인하고 브라우저에서 `https://dev.pilo.my`의 login, realtime, upload를 다시 검사한다.
6. `livekit.dev.pilo.my`, `turn.dev.pilo.my`와 `https://api.dev.pilo.my/api/v1/livekit/webhooks`가 계속 정상인지 확인한다.

rollback에서도 저장된 plan 없이 Terraform을 적용하지 않는다. 실패 원인, 되돌린
값, 배포 revision, 검증 결과를 incident 기록에 남긴다.

## 9. 308 전환

최소 한 번의 합의된 운영 관찰 기간 동안 login, webhook, realtime, upload,
LiveKit smoke test가 안정적이고 rollback 요구가 없을 때만 진행한다.
`TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE=308` 변경은 최초 전환과 분리된
별도 변경으로 plan, 검토, 명시적 승인을 다시 거쳐 적용한다.

308 적용 뒤에도 `curl.exe -I "https://dev.pilo.my/path?query=value"`의 상태가
`308`이고 `Location`이 `https://pilo.my/path?query=value`인지 확인한다.
