# Terraform plan role refresh 감사

## 목적

PR 전용 Terraform plan role은 실제 dev AWS state를 읽되 secret value, 리소스 변경, IAM 변경 권한은 갖지 않는다. allowlist를 오류 로그 단위로 보강하지 않도록, 현재 Terraform refresh가 호출하는 action을 한 번에 확인한다.

## 현재 기준

- 환경: dev
- Terraform: 1.15.7
- AWS provider: 5.100.0
- 관측 action: 84개
- inventory: `infra/tests/fixtures/terraform-plan-refresh-actions.json`

## 감사 방법

1. 최신 main과 동일한 깨끗한 worktree에서 실제 dev 변수로 `terraform plan -lock=false`를 실행한다.
2. `ap-northeast-2`, `us-east-1` CloudTrail Event History에서 Terraform/HashiCorp user agent의 management event를 수집한다.
3. AWS API event name을 IAM action으로 정규화한다. 예를 들어 S3 `GetBucketEncryption`, `GetBucketLifecycle`, `GetBucketReplication`은 각각 `s3:GetEncryptionConfiguration`, `s3:GetLifecycleConfiguration`, `s3:GetReplicationConfiguration`으로 매핑한다.
4. 관측 action과 plan role allowlist를 비교하고, 누락 action을 같은 PR에서 policy와 inventory에 반영한다.
5. main apply 후 단일 main Terraform plan으로 실제 role을 검증한다.

## 재감사 시점

- `hashicorp/aws` provider 버전을 변경할 때
- Terraform이 관리하는 AWS resource 또는 provider alias를 추가할 때
- GitHub Actions plan에서 새 `AccessDenied` action이 발생할 때

CloudTrail Event History는 지역별 management event를 기록하므로, global service를 포함해 사용 중인 모든 provider region을 확인한다. 감사 실행은 `-lock=false`를 사용하므로 state lock이나 AWS 리소스를 변경하지 않는다.
