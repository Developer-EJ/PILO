# PILO 운영 도메인 전환 설계

관련 Issue: #1737

## 목적

기존 `pilo-dev-*` AWS 리소스와 `infra/dev/terraform.tfstate`를 그대로
유지하면서 PILO의 공식 Frontend/API 주소를 다음과 같이 전환한다.

- Frontend canonical origin: `https://pilo.my`
- API/Realtime canonical origin: `https://api.pilo.my`
- Legacy Frontend origin: `https://dev.pilo.my`
- Legacy API/Realtime origin: `https://api.dev.pilo.my`

Legacy Frontend 요청은 경로와 query를 보존해 canonical Frontend로
리다이렉트한다. Legacy API/Realtime 주소는 기존 클라이언트 호환을 위해 같은
ALB에 계속 연결하며 리다이렉트하지 않는다.

## 범위

### 포함

- CloudFront가 `pilo.my`, `dev.pilo.my`를 모두 수신하도록 alias와 인증서 확장
- `dev.pilo.my` 요청을 `pilo.my`로 보내는 edge redirect
- ALB가 `api.pilo.my`, `api.dev.pilo.my`를 모두 수신하도록 인증서와 DNS 확장
- App Server, Realtime Server, Frontend의 공식 origin을 새 도메인으로 전환
- uploads S3 CORS에서 canonical과 legacy Frontend origin 허용
- Google/GitHub OAuth, GitHub App callback/webhook 전환 절차 문서화
- Terraform 계약 테스트와 수동 smoke test 추가

### 제외

- 별도 prod AWS account, VPC, ECS cluster 또는 Terraform state 생성
- `environment = "dev"`와 `pilo-dev-*` 리소스 이름 변경
- DB, Redis, SQS, S3 bucket, ECR repository 교체
- `livekit.dev.pilo.my`, `turn.dev.pilo.my` 변경
- API endpoint, request/response, auth rule 변경
- DB schema와 migration 변경

## 검토한 방식

### 1. 기존 CloudFront에서 canonical과 legacy 처리

기존 CloudFront Distribution에 두 Frontend alias를 연결하고 viewer-request
CloudFront Function이 Host를 검사한다. Legacy Host이면 redirect response를
반환하고 canonical Host이면 기존 static route rewrite를 수행한다.

- 장점: 새 Distribution이 없고 기존 S3 origin과 cache를 그대로 사용한다.
- 단점: 하나의 Function이 redirect와 static route rewrite를 함께 책임진다.

### 2. Legacy 전용 redirect CloudFront Distribution 추가

기존 Distribution은 `pilo.my`만 제공하고 별도 Distribution이
`dev.pilo.my` redirect만 담당한다.

- 장점: redirect와 Frontend serving이 분리된다.
- 단점: Distribution, 인증서, DNS, 관측 지점이 추가되어 이번 목표보다 복잡하다.

### 3. Frontend JavaScript 또는 HTML에서 redirect

기존 페이지를 로드한 뒤 브라우저 코드가 새 origin으로 이동한다.

- 장점: edge 인프라 수정이 적다.
- 단점: redirect 전에 앱이 노출되고 정적 route, 캐시, JavaScript 실패에 영향을 받는다.

## 선택

방식 1을 사용한다. 이번 작업의 목표는 기존 인프라를 유지한 가벼운 도메인
승격이므로 별도 Distribution을 만들지 않는다. CloudFront Function 로직은 Host
redirect와 static route rewrite를 명확한 두 단계로 나누고 계약 테스트로 고정한다.

## 아키텍처

```text
https://pilo.my/*
  -> Route53 alias
  -> existing CloudFront
  -> existing frontend S3 bucket

https://dev.pilo.my/{path}?{query}
  -> Route53 alias
  -> same CloudFront
  -> viewer-request redirect
  -> https://pilo.my/{path}?{query}

https://api.pilo.my/*
https://api.dev.pilo.my/*
  -> Route53 aliases
  -> same existing ALB
  -> existing App Server / Realtime Server target groups

wss://livekit.dev.pilo.my
turn.dev.pilo.my
  -> unchanged LiveKit host
```

## Terraform 설계

### 환경과 state

`infra/envs/dev`와 현재 remote backend를 계속 사용한다. `environment` 값은
`dev`로 유지한다. 이 값이 바뀌면 `local.name_prefix`가 달라져 광범위한 리소스
교체가 발생할 수 있으므로 이번 작업에서는 변경하지 않는다.

### 도메인 입력

현재 단일 도메인 입력을 canonical 도메인과 legacy 도메인 목록으로 확장한다.

- `frontend_domain_name = "pilo.my"`
- `frontend_legacy_domain_names = ["dev.pilo.my"]`
- `api_domain_name = "api.pilo.my"`
- `api_legacy_domain_names = ["api.dev.pilo.my"]`
- `frontend_legacy_redirect_status_code = 302`

canonical 도메인과 legacy 목록은 중복될 수 없도록 검증한다.

### 인증서와 DNS

CloudFront 인증서는 `us-east-1`에서 `pilo.my`를 primary name으로 만들고
`dev.pilo.my`를 SAN으로 포함한다. ALB 인증서는 `ap-northeast-2`에서
`api.pilo.my`를 primary name으로 만들고 `api.dev.pilo.my`를 SAN으로 포함한다.

Route53은 네 도메인 모두에 alias A record를 관리한다.

- `pilo.my`, `dev.pilo.my` -> 기존 CloudFront
- `api.pilo.my`, `api.dev.pilo.my` -> 기존 ALB

인증서는 `create_before_destroy`를 유지해 새 인증서 검증 이후 연결을 교체한다.

### CloudFront redirect

기존 viewer-request Function을 다음 순서로 동작시킨다.

1. 요청 Host가 `dev.pilo.my`이면 redirect response를 반환한다.
2. Location은 `https://pilo.my`에 원래 path와 `request.rawQueryString()`을
   사용한 원본 query를 붙인다.
3. canonical 요청이면 기존 static export route rewrite를 수행한다.
4. `/_next/`와 확장자가 있는 asset 요청은 기존 규칙대로 그대로 전달한다.

초기 전환은 캐시된 영구 redirect로 인한 롤백 어려움을 피하기 위해 `302`를
사용한다. smoke test와 운영 확인이 끝난 뒤 별도 승인으로 `308`로 변경한다.

### 서비스 환경변수

Terraform이 다음 값을 canonical origin으로 주입한다.

- App Server `FRONTEND_URL=https://pilo.my`
- App Server `API_PUBLIC_ORIGIN=https://api.pilo.my`
- Realtime Server `SOCKET_IO_CORS_ORIGIN=https://pilo.my`
- Worker internal callback base URL `https://api.pilo.my`

uploads bucket CORS에는 `https://pilo.my`와 `https://dev.pilo.my`를 모두
허용한다. LiveKit 관련 URL과 secret은 변경하지 않는다.

## GitHub Actions와 외부 설정

Terraform apply가 완료되고 canonical DNS/인증서가 정상인 것을 확인한 뒤 다음
repository variables를 갱신한다.

- `NEXT_PUBLIC_PILO_APP_SERVER_URL=https://api.pilo.my`
- `NEXT_PUBLIC_PILO_REALTIME_SERVER_URL=https://api.pilo.my`
- `TF_PLAN_FRONTEND_DOMAIN_NAME=pilo.my`
- `TF_PLAN_API_DOMAIN_NAME=api.pilo.my`
- `TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES=["dev.pilo.my"]`
- `TF_PLAN_API_LEGACY_DOMAIN_NAMES=["api.dev.pilo.my"]`
- `TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE=302`

ECS cluster/service, S3 bucket, CloudFront Distribution ID, IAM role 변수는 기존
값을 유지한다. Frontend public origin은 build-time 값이므로 변수 갱신 뒤
Frontend workflow를 수동 실행해 다시 빌드한다.

외부 provider의 공식 URL은 다음과 같이 전환한다.

- Google login: `https://api.pilo.my/api/v1/auth/google/callback`
- GitHub login: `https://api.pilo.my/api/v1/auth/github/callback`
- GitHub user OAuth: `https://api.pilo.my/api/v1/github/oauth/callback`
- GitHub ProjectV2 OAuth: `https://api.pilo.my/api/v1/github/project-oauth/callback`
- GitHub App setup: `https://api.pilo.my/api/v1/github/installations/callback`
- GitHub App webhook: `https://api.pilo.my/api/v1/github/webhooks`

Google OAuth client에는 새 callback을 먼저 추가하고 기존 callback을 전환
기간 동안 유지한다. Google은 authorization request의 `redirect_uri`가 등록된
authorized redirect URI 중 하나와 정확히 일치해야 한다.

GitHub App은 여러 callback URL을 등록할 수 있으므로 canonical callback을 먼저
추가하고 legacy callback을 유지한다. 반면 regular GitHub OAuth App은 callback
URL을 하나만 등록하므로 GitHub login OAuth App과 ProjectV2 OAuth App의 callback
변경은 App Server의 `API_PUBLIC_ORIGIN` 전환 직전에 수행한다. 이 단계는 짧은
인증 점검 창으로 취급하고 변경 직후 두 OAuth 흐름을 확인한다.

LiveKit webhook은 `api.dev.pilo.my`를 계속 사용할 수 있으며 이번 작업에서
변경하지 않는다.

## 적용 순서

1. Terraform 코드와 계약 테스트를 merge한다.
2. Terraform plan에서 허용된 변경만 있는지 검토한다.
3. 새 ACM 인증서, DNS aliases, CloudFront/ALB 구성을 apply한다.
4. 네 도메인의 TLS와 health를 확인한다.
5. Google과 GitHub App에 canonical callback을 추가하고 GitHub App webhook을
   canonical API origin으로 변경한다.
6. regular GitHub OAuth Apps의 callback을 변경한 직후 App Server의 canonical
   origin 전환을 적용한다.
7. GitHub repository variables의 Frontend/API origin을 변경한다.
8. App Server, Realtime Server, Worker, Frontend를 순서대로 재배포한다.
9. 전체 smoke test를 수행한다.
10. 안정화 뒤 redirect를 `302`에서 `308`로 바꾸는 별도 변경을 승인한다.

## 오류 처리와 롤백

- Terraform plan에 DB, VPC, S3 bucket, ECS cluster/service 삭제 또는 의도하지
  않은 replacement가 있으면 apply하지 않는다.
- 새 인증서가 발급·검증되지 않으면 DNS와 Distribution alias 전환을 진행하지 않는다.
- 초기 `302` redirect가 잘못되면 CloudFront Function과 alias 변경을 되돌린다.
- Frontend/API 문제가 발생하면 GitHub variables와 외부 OAuth callback을 기존
  `dev` origin으로 복원하고 기존 배포 workflow를 재실행한다.
- `api.dev.pilo.my`를 계속 유지하므로 API와 Realtime의 즉시 호환 경로가 남는다.
- 영구 `308` 전환은 초기 롤백 기간이 끝난 뒤에만 수행한다.

## 검증

### 자동 검증

- Terraform format/validate
- 도메인 목록, 인증서 SAN, Route53 alias 계약 테스트
- CloudFront Function redirect path/query 보존 테스트
- canonical static route rewrite 회귀 테스트
- 기존 application CI와 Frontend build

### Terraform plan gate

허용 대상:

- ACM certificate와 validation record
- Route53 alias record
- CloudFront aliases/Function/Distribution 설정
- ALB HTTPS certificate/listener 연결
- ECS task definition environment 값
- uploads S3 CORS origin

금지 대상:

- RDS, Redis, S3 bucket, VPC, subnet, ECS cluster/service 삭제
- Terraform backend/state 변경
- LiveKit EC2/EIP/DNS 변경

### 수동 smoke test

- `https://pilo.my`와 정적 하위 route 응답
- `https://dev.pilo.my/path?query=value`의 path/query 보존 redirect
- `https://api.pilo.my/api/v1/health`
- `https://api.dev.pilo.my/api/v1/health`
- Google/GitHub 로그인과 callback
- GitHub OAuth/App 설치/webhook
- Socket.IO/Canvas/Board/Meeting 상태 실시간 연결
- S3 presigned upload와 다운로드
- LiveKit room/token/recording 흐름 회귀

## 완료 기준

- 사용자가 `pilo.my`를 공식 주소로 사용한다.
- 기존 Frontend 링크는 `pilo.my`로 안전하게 이동한다.
- 기존 API/Realtime 주소는 호환용으로 계속 동작한다.
- LiveKit과 기존 AWS data-plane 리소스는 변경되지 않는다.
- 파괴적 Terraform 변경 없이 전환과 롤백이 가능하다.

## 외부 동작 근거

- [AWS CloudFront Functions event structure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)와
  [runtime 2.0 helper methods](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/general-helper-methods.html)에
  따라 viewer-request에서 redirect response를 반환하고
  `request.rawQueryString()`으로 원본 query를 읽을 수 있다.
- [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server)에
  따라 `redirect_uri`는 등록된 authorized redirect URI와 정확히 일치해야 한다.
- [GitHub App callback URL 문서](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url)에
  따라 최대 10개의 user authorization callback URL을 등록할 수 있다.
- [GitHub OAuth App 등록 문서](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)에
  따라 regular OAuth App은 callback URL을 하나만 등록한다.
