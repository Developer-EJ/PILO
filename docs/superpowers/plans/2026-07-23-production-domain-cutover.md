# Production Domain Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `pilo-dev-*` AWS 리소스와 `infra/dev/terraform.tfstate`를 유지하면서 `pilo.my`와 `api.pilo.my`를 공식 주소로 추가하고 `dev.pilo.my`를 경로와 query를 보존하는 302 redirect로 전환한다.

**Architecture:** 기존 CloudFront Distribution 하나가 `pilo.my`와 `dev.pilo.my`를 모두 수신하고 viewer-request CloudFront Function에서 legacy Host만 canonical Host로 redirect한다. 기존 ALB는 `api.pilo.my`와 `api.dev.pilo.my`를 함께 수신하며 API legacy Host는 redirect하지 않는다. ACM 인증서는 SAN으로 양쪽 Host를 포함하고 Route53 alias는 같은 기존 CloudFront/ALB를 가리킨다.

**Tech Stack:** Terraform, AWS CloudFront Functions JavaScript runtime 2.0, ACM, Route53, ALB, S3 CORS, ECS task environment, GitHub Actions, Node.js 22 contract tests.

## Global Constraints

- Canonical Frontend origin은 `https://pilo.my`이다.
- Canonical API/Realtime origin은 `https://api.pilo.my`이다.
- Legacy Frontend origin `https://dev.pilo.my`는 path와 raw query를 보존해 canonical Frontend로 redirect한다.
- 초기 redirect status는 `302`이고 안정화 뒤 별도 승인 변경으로만 `308`을 사용한다.
- Legacy API/Realtime origin `https://api.dev.pilo.my`는 같은 ALB에서 계속 응답하고 redirect하지 않는다.
- `livekit.dev.pilo.my`와 `turn.dev.pilo.my`는 변경하지 않는다.
- LiveKit webhook은 `https://api.dev.pilo.my/api/v1/livekit/webhooks`를 유지한다.
- `environment = "dev"`, 기존 `pilo-dev-*` 리소스 이름, `infra/dev/terraform.tfstate`, VPC, subnet, ECS public IP 구성은 변경하지 않는다.
- API endpoint/request/response/auth rule과 DB schema/migration은 변경하지 않는다.
- 실제 Terraform apply, GitHub repository variable 수정, Google/GitHub OAuth callback 수정, GitHub App webhook 수정은 저장소 구현과 검증이 끝난 뒤 사용자 승인 하에서만 수행한다.
- 관련 Issue는 `#1737`이고 모든 commit message는 `(#1737)`을 포함한다.
- 사용자의 기존 dirty worktree 파일과 `infra/envs/dev/tfplan`은 stage하거나 수정하지 않는다.

---

## File Structure

- Create: `infra/modules/cloudfront/functions/frontend-viewer-request.js.tftpl`
  - legacy Host redirect와 canonical static route rewrite를 한 viewer-request handler에 캡슐화한다.
- Create: `infra/tests/cloudfront-frontend-viewer-request.test.mjs`
  - CloudFront Function template을 fixture 값으로 렌더링해 redirect와 rewrite 동작을 실행 검증한다.
- Create: `infra/tests/production-domain-cutover-contract.test.mjs`
  - Terraform module/env/workflow/docs가 승인된 canonical/legacy 계약을 모두 유지하는지 정적 계약으로 고정한다.
- Create: `docs/infra/production-domain-cutover-runbook.md`
  - repository merge 이후 실제 AWS/OAuth/GitHub 전환, smoke test, rollback 순서를 제공한다.
- Modify: `infra/modules/cloudfront/main.tf`
  - inline Function을 `templatefile` 기반 viewer-request Function으로 교체한다.
- Modify: `infra/modules/cloudfront/variables.tf`
  - canonical origin, legacy Host 목록, redirect status 입력을 추가한다.
- Modify: `infra/modules/route53-acm/main.tf`
  - CloudFront/ALB 인증서에 SAN 목록을 연결한다.
- Modify: `infra/modules/route53-acm/variables.tf`
  - Frontend/API SAN 입력을 추가한다.
- Modify: `infra/envs/dev/main.tf`
  - 도메인 목록, SAN, CloudFront redirect, S3 CORS, ECS canonical origin, Route53 alias와 state moved block을 연결한다.
- Modify: `infra/envs/dev/variables.tf`
  - legacy 도메인 목록과 redirect status 변수를 추가하고 허용값을 검증한다.
- Modify: `infra/envs/dev/terraform.tfvars.example`
  - canonical/legacy 도메인 입력 예시를 추가한다.
- Modify: `.github/workflows/terraform-validate.yml`
  - 새 contract test와 Terraform plan 입력을 CI에 연결한다.
- Modify: `docs/infra/deploy-checklist.md`
  - preflight, apply gate, 도메인 smoke test와 rollback 항목을 연결한다.
- Modify: `docs/infra/dev-architecture.md`
  - 동일 기존 인프라에서 canonical/legacy 도메인이 라우팅되는 구조를 설명한다.
- Modify: `docs/infra/secrets.md`
  - canonical origin과 repository variable 값을 문서화한다.

---

### Task 1: CloudFront Legacy Redirect Function

**Files:**
- Create: `infra/tests/cloudfront-frontend-viewer-request.test.mjs`
- Create: `infra/modules/cloudfront/functions/frontend-viewer-request.js.tftpl`
- Modify: `infra/modules/cloudfront/main.tf:11-42`
- Modify: `infra/modules/cloudfront/variables.tf:27-35`

**Interfaces:**
- Consumes: `canonical_frontend_origin: string`, `legacy_redirect_hostnames: list(string)`, `legacy_redirect_status_code: number`.
- Produces: CloudFront viewer-request `handler(event)` that returns either an HTTP redirect response or the rewritten request.

- [ ] **Step 1: Write the failing executable CloudFront Function test**

Create `infra/tests/cloudfront-frontend-viewer-request.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const templatePath = path.join(
  repoRoot,
  'infra/modules/cloudfront/functions/frontend-viewer-request.js.tftpl',
);
const template = await readFile(templatePath, 'utf8');
const source = template
  .replace('${canonical_frontend_origin_json}', JSON.stringify('https://pilo.my'))
  .replace('${legacy_redirect_hostnames_json}', JSON.stringify(['dev.pilo.my']))
  .replace('${legacy_redirect_status_code}', '302');

const context = {};
vm.runInNewContext(`${source}\nthis.cloudfrontHandler = handler;`, context);

function request(host, uri, rawQueryString = '') {
  return {
    uri,
    headers: {
      host: { value: host },
    },
    rawQueryString() {
      return rawQueryString;
    },
  };
}

const redirect = context.cloudfrontHandler({
  request: request('dev.pilo.my', '/workspace/42', 'tab=board&filter=open%20issue'),
});
assert.equal(redirect.statusCode, 302);
assert.equal(redirect.statusDescription, 'Found');
assert.equal(
  redirect.headers.location.value,
  'https://pilo.my/workspace/42?tab=board&filter=open%20issue',
);
assert.equal(redirect.headers['cache-control'].value, 'no-store');

const root = request('pilo.my', '/');
assert.equal(context.cloudfrontHandler({ request: root }).uri, '/index.html');

const route = request('pilo.my', '/settings/profile');
assert.equal(
  context.cloudfrontHandler({ request: route }).uri,
  '/settings/profile/index.html',
);

const trailingSlash = request('pilo.my', '/settings/');
assert.equal(
  context.cloudfrontHandler({ request: trailingSlash }).uri,
  '/settings/index.html',
);

const nextAsset = request('pilo.my', '/_next/static/chunk.js');
assert.equal(
  context.cloudfrontHandler({ request: nextAsset }).uri,
  '/_next/static/chunk.js',
);

const publicAsset = request('pilo.my', '/favicon.ico');
assert.equal(context.cloudfrontHandler({ request: publicAsset }).uri, '/favicon.ico');

console.log('CloudFront frontend redirect and route rewrite are verified.');
```

- [ ] **Step 2: Run the test and verify the template is missing**

Run:

```powershell
node infra/tests/cloudfront-frontend-viewer-request.test.mjs
```

Expected: FAIL with `ENOENT` for `frontend-viewer-request.js.tftpl`.

- [ ] **Step 3: Implement the viewer-request template**

Create `infra/modules/cloudfront/functions/frontend-viewer-request.js.tftpl`:

```js
var CANONICAL_FRONTEND_ORIGIN = ${canonical_frontend_origin_json};
var LEGACY_REDIRECT_HOSTNAMES = ${legacy_redirect_hostnames_json};
var LEGACY_REDIRECT_STATUS_CODE = ${legacy_redirect_status_code};

function handler(event) {
  var request = event.request;
  var hostHeader = request.headers.host;
  var host = hostHeader ? hostHeader.value.toLowerCase() : "";

  if (LEGACY_REDIRECT_HOSTNAMES.indexOf(host) !== -1) {
    var rawQueryString = request.rawQueryString();
    var location = CANONICAL_FRONTEND_ORIGIN + request.uri;
    if (rawQueryString !== "") {
      location += "?" + rawQueryString;
    }

    return {
      statusCode: LEGACY_REDIRECT_STATUS_CODE,
      statusDescription:
        LEGACY_REDIRECT_STATUS_CODE === 308 ? "Permanent Redirect" : "Found",
      headers: {
        location: { value: location },
        "cache-control": { value: "no-store" },
      },
    };
  }

  var uri = request.uri;
  if (uri === "" || uri === "/") {
    request.uri = "/index.html";
    return request;
  }

  if (uri.indexOf("/_next/") === 0) {
    return request;
  }

  var lastSlashIndex = uri.lastIndexOf("/");
  var lastSegment = uri.substring(lastSlashIndex + 1);
  if (lastSegment.indexOf(".") !== -1) {
    return request;
  }

  if (uri.charAt(uri.length - 1) === "/") {
    request.uri = uri + "index.html";
  } else {
    request.uri = uri + "/index.html";
  }

  return request;
}
```

Add to `infra/modules/cloudfront/variables.tf`:

```hcl
variable "canonical_frontend_origin" {
  type    = string
  default = ""
}

variable "legacy_redirect_hostnames" {
  type    = list(string)
  default = []
}

variable "legacy_redirect_status_code" {
  type    = number
  default = 302

  validation {
    condition     = contains([302, 308], var.legacy_redirect_status_code)
    error_message = "legacy_redirect_status_code must be 302 or 308."
  }
}
```

Replace the inline `code` heredoc in `infra/modules/cloudfront/main.tf` with:

```hcl
resource "aws_cloudfront_function" "frontend_static_route_rewrite" {
  name    = "${var.name_prefix}-frontend-static-route-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Redirect legacy frontend hosts and rewrite static export routes"
  publish = true
  code = templatefile("${path.module}/functions/frontend-viewer-request.js.tftpl", {
    canonical_frontend_origin_json = jsonencode(var.canonical_frontend_origin)
    legacy_redirect_hostnames_json = jsonencode(var.legacy_redirect_hostnames)
    legacy_redirect_status_code    = var.legacy_redirect_status_code
  })
}
```

- [ ] **Step 4: Run the focused test and format check**

Run:

```powershell
node infra/tests/cloudfront-frontend-viewer-request.test.mjs
terraform fmt -check -recursive
```

Expected:

```text
CloudFront frontend redirect and route rewrite are verified.
```

`terraform fmt -check -recursive` exits with code `0`.

- [ ] **Step 5: Commit the CloudFront function unit**

```powershell
git add infra/tests/cloudfront-frontend-viewer-request.test.mjs infra/modules/cloudfront/functions/frontend-viewer-request.js.tftpl infra/modules/cloudfront/main.tf infra/modules/cloudfront/variables.tf
git commit -m "feat: legacy frontend redirect 추가 (#1737)"
```

---

### Task 2: ACM SAN, Domain Lists, Route53 Aliases, and Canonical Origins

**Files:**
- Create: `infra/tests/production-domain-cutover-contract.test.mjs`
- Modify: `infra/modules/route53-acm/main.tf:5-58`
- Modify: `infra/modules/route53-acm/variables.tf:13-24`
- Modify: `infra/envs/dev/variables.tf:19-47`
- Modify: `infra/envs/dev/main.tf:1-12,47-94,200-378,418-448`
- Modify: `infra/envs/dev/terraform.tfvars.example:5-10`

**Interfaces:**
- Consumes: canonical domain strings, legacy domain lists, and redirect status from the dev root module.
- Produces: ACM certificates with SANs, CloudFront aliases/redirect inputs, canonical ECS origins, uploads CORS origins, and Route53 aliases for all four public Host names.

- [ ] **Step 1: Write the failing domain cutover contract test**

Create `infra/tests/production-domain-cutover-contract.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [
  devMain,
  devVariables,
  tfvarsExample,
  acmMain,
  acmVariables,
  cloudfrontMain,
] = await Promise.all([
  readFile(path.join(repoRoot, 'infra/envs/dev/main.tf'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/envs/dev/variables.tf'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/envs/dev/terraform.tfvars.example'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/modules/route53-acm/main.tf'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/modules/route53-acm/variables.tf'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/modules/cloudfront/main.tf'), 'utf8'),
]);

assert.match(devVariables, /variable "frontend_legacy_domain_names"/);
assert.match(devVariables, /variable "api_legacy_domain_names"/);
assert.match(devVariables, /variable "frontend_legacy_redirect_status_code"/);
assert.match(devVariables, /contains\(\[302,\s*308\]/);

assert.match(devMain, /frontend_domains\s*=\s*var\.create_dns_records/);
assert.match(devMain, /api_domains\s*=\s*var\.create_dns_records/);
assert.match(devMain, /frontend_subject_alternative_names\s*=\s*var\.frontend_legacy_domain_names/);
assert.match(devMain, /api_subject_alternative_names\s*=\s*var\.api_legacy_domain_names/);
assert.match(devMain, /aliases\s*=\s*local\.frontend_domains/);
assert.match(devMain, /canonical_frontend_origin\s*=\s*local\.frontend_origin/);
assert.match(devMain, /legacy_redirect_hostnames\s*=\s*var\.frontend_legacy_domain_names/);
assert.match(
  devMain,
  /legacy_redirect_status_code\s*=\s*var\.frontend_legacy_redirect_status_code/,
);
assert.match(devMain, /uploads_cors_allowed_origins\s*=\s*concat/);
assert.match(devMain, /for domain in local\.frontend_domains : "https:\/\/\$\{domain\}"/);
assert.match(devMain, /FRONTEND_URL\s*=\s*local\.frontend_origin/);
assert.match(devMain, /API_PUBLIC_ORIGIN\s*=\s*local\.api_origin/);
assert.match(devMain, /SOCKET_IO_CORS_ORIGIN\s*=\s*local\.frontend_origin/);
assert.match(devMain, /for_each\s*=\s*toset\(local\.frontend_domains\)/);
assert.match(devMain, /for_each\s*=\s*toset\(local\.api_domains\)/);
assert.match(
  devMain,
  /from\s*=\s*aws_route53_record\.frontend\[0\][\s\S]*to\s*=\s*aws_route53_record\.frontend\["dev\.pilo\.my"\]/,
);
assert.match(
  devMain,
  /from\s*=\s*aws_route53_record\.api\[0\][\s\S]*to\s*=\s*aws_route53_record\.api\["api\.dev\.pilo\.my"\]/,
);

assert.match(acmVariables, /variable "frontend_subject_alternative_names"/);
assert.match(acmVariables, /variable "api_subject_alternative_names"/);
assert.match(
  acmMain,
  /subject_alternative_names\s*=\s*var\.frontend_subject_alternative_names/,
);
assert.match(
  acmMain,
  /subject_alternative_names\s*=\s*var\.api_subject_alternative_names/,
);
assert.match(cloudfrontMain, /templatefile\("\$\{path\.module\}\/functions\/frontend-viewer-request\.js\.tftpl"/);

assert.match(tfvarsExample, /domain_name\s*=\s*"pilo\.my"/);
assert.match(tfvarsExample, /frontend_domain_name\s*=\s*"pilo\.my"/);
assert.match(tfvarsExample, /frontend_legacy_domain_names\s*=\s*\["dev\.pilo\.my"\]/);
assert.match(tfvarsExample, /api_domain_name\s*=\s*"api\.pilo\.my"/);
assert.match(tfvarsExample, /api_legacy_domain_names\s*=\s*\["api\.dev\.pilo\.my"\]/);
assert.match(tfvarsExample, /frontend_legacy_redirect_status_code\s*=\s*302/);

assert.match(devMain, /subnet_ids\s*=\s*module\.network\.public_subnet_ids/);
assert.match(devMain, /assign_public_ip\s*=\s*var\.ecs_assign_public_ip/);
assert.match(devMain, /DATABASE_APPLICATION_NAME\s*=\s*"pilo-dev-app-server"/);
assert.doesNotMatch(devMain, /livekit\.pilo\.my|turn\.pilo\.my/);

console.log('Production domain cutover Terraform contract is verified.');
```

- [ ] **Step 2: Run the contract test and verify it fails on missing legacy inputs**

Run:

```powershell
node infra/tests/production-domain-cutover-contract.test.mjs
```

Expected: FAIL at `variable "frontend_legacy_domain_names"`.

- [ ] **Step 3: Add SAN inputs to the Route53/ACM module**

Add to `infra/modules/route53-acm/variables.tf`:

```hcl
variable "frontend_subject_alternative_names" {
  type    = list(string)
  default = []
}

variable "api_subject_alternative_names" {
  type    = list(string)
  default = []
}
```

Add to the matching certificate resources in `infra/modules/route53-acm/main.tf`:

```hcl
resource "aws_acm_certificate" "cloudfront" {
  count = local.enabled ? 1 : 0

  provider                  = aws.us_east_1
  domain_name               = var.frontend_domain_name
  subject_alternative_names = var.frontend_subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "alb" {
  count = local.enabled ? 1 : 0

  domain_name               = var.api_domain_name
  subject_alternative_names = var.api_subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}
```

- [ ] **Step 4: Add root inputs and domain list invariants**

Add after `frontend_domain_name` and `api_domain_name` in `infra/envs/dev/variables.tf`:

```hcl
variable "frontend_legacy_domain_names" {
  description = "Legacy frontend domains served by CloudFront and redirected to the canonical frontend."
  type        = list(string)
  default     = []

  validation {
    condition     = length(distinct(var.frontend_legacy_domain_names)) == length(var.frontend_legacy_domain_names)
    error_message = "frontend_legacy_domain_names must not contain duplicates."
  }
}

variable "api_legacy_domain_names" {
  description = "Legacy API domains that remain active on the existing ALB."
  type        = list(string)
  default     = []

  validation {
    condition     = length(distinct(var.api_legacy_domain_names)) == length(var.api_legacy_domain_names)
    error_message = "api_legacy_domain_names must not contain duplicates."
  }
}

variable "frontend_legacy_redirect_status_code" {
  description = "CloudFront redirect status for legacy frontend domains."
  type        = number
  default     = 302

  validation {
    condition     = contains([302, 308], var.frontend_legacy_redirect_status_code)
    error_message = "frontend_legacy_redirect_status_code must be 302 or 308."
  }
}
```

Replace the domain locals in `infra/envs/dev/main.tf` with:

```hcl
  frontend_domains = var.create_dns_records ? concat(
    [var.frontend_domain_name],
    var.frontend_legacy_domain_names,
  ) : []
  api_domains = var.create_dns_records ? concat(
    [var.api_domain_name],
    var.api_legacy_domain_names,
  ) : []

  frontend_domain = var.create_dns_records ? var.frontend_domain_name : ""
  api_domain      = var.create_dns_records ? var.api_domain_name : ""
  frontend_origin = local.frontend_domain == "" ? "" : "https://${local.frontend_domain}"
  api_origin      = local.api_domain == "" ? "http://${module.alb.alb_dns_name}" : "https://${local.api_domain}"
```

Add an always-evaluated Terraform 1.6-compatible plan-time DNS prerequisite after the
root data sources:

```hcl
resource "terraform_data" "dns_configuration" {
  lifecycle {
    precondition {
      condition     = !var.create_dns_records || trimspace(var.hosted_zone_id) != ""
      error_message = "hosted_zone_id must be set when create_dns_records is true."
    }
  }
}
```

Put canonical/legacy distinctness in blocking `lifecycle.precondition` blocks on the
CloudFront and ALB ACM certificate resources. Do not use root `check` blocks because
their failed assertions are warnings in the pinned Terraform version.

- [ ] **Step 5: Wire CORS, certificates, CloudFront, and canonical ECS origins**

Use all configured Frontend origins in the S3 module:

```hcl
  uploads_cors_allowed_origins = concat(
    ["http://localhost:3000"],
    [for domain in local.frontend_domains : "https://${domain}"],
  )
```

Pass SAN inputs to `module "route53_acm"`:

```hcl
  create_dns_records                 = var.create_dns_records
  hosted_zone_id                     = var.hosted_zone_id
  frontend_domain_name               = var.frontend_domain_name
  frontend_subject_alternative_names = var.frontend_legacy_domain_names
  api_domain_name                    = var.api_domain_name
  api_subject_alternative_names      = var.api_legacy_domain_names
```

Pass aliases and redirect inputs to `module "cloudfront"`:

```hcl
  aliases                     = local.frontend_domains
  acm_certificate_arn         = module.route53_acm.cloudfront_certificate_arn
  canonical_frontend_origin   = local.frontend_origin
  legacy_redirect_hostnames   = var.frontend_legacy_domain_names
  legacy_redirect_status_code = var.frontend_legacy_redirect_status_code
```

Replace official origin expressions throughout ECS service environments:

```hcl
FRONTEND_URL                         = local.frontend_origin
API_PUBLIC_ORIGIN                    = local.api_origin
SOCKET_IO_CORS_ORIGIN                = local.frontend_origin == "" ? "*" : local.frontend_origin
MEETING_REPORT_EVENT_BASE_URL        = local.api_origin
AGENT_EXECUTION_HANDOFF_BASE_URL     = local.api_origin
PR_REVIEW_ANALYSIS_HANDOFF_BASE_URL  = local.api_origin
```

Apply the replacements to every existing occurrence without changing `APP_ENV`, `DATABASE_APPLICATION_NAME`, service names, images, desired counts, subnets, security groups, or LiveKit values.

- [ ] **Step 6: Expand Route53 aliases while preserving the existing state addresses**

Replace both Route53 alias resources in `infra/envs/dev/main.tf`:

```hcl
moved {
  from = aws_route53_record.frontend[0]
  to   = aws_route53_record.frontend["dev.pilo.my"]
}

resource "aws_route53_record" "frontend" {
  for_each = toset(local.frontend_domains)

  zone_id = var.hosted_zone_id
  name    = each.value
  type    = "A"

  allow_overwrite = true

  alias {
    name                   = module.cloudfront.distribution_domain_name
    zone_id                = module.cloudfront.distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

moved {
  from = aws_route53_record.api[0]
  to   = aws_route53_record.api["api.dev.pilo.my"]
}

resource "aws_route53_record" "api" {
  for_each = toset(local.api_domains)

  zone_id = var.hosted_zone_id
  name    = each.value
  type    = "A"

  allow_overwrite = true

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}
```

- [ ] **Step 7: Update the checked-in tfvars example**

Replace the domain section of `infra/envs/dev/terraform.tfvars.example`:

```hcl
# Existing dev resources serve the canonical and legacy PILO domains.
create_dns_records                     = true
domain_name                            = "pilo.my"
frontend_domain_name                   = "pilo.my"
frontend_legacy_domain_names           = ["dev.pilo.my"]
api_domain_name                        = "api.pilo.my"
api_legacy_domain_names                = ["api.dev.pilo.my"]
frontend_legacy_redirect_status_code   = 302
hosted_zone_id                         = ""
```

- [ ] **Step 8: Run the focused Terraform contract and format checks**

Run:

```powershell
node infra/tests/production-domain-cutover-contract.test.mjs
node infra/tests/cloudfront-frontend-viewer-request.test.mjs
terraform fmt -recursive
terraform fmt -check -recursive
```

Expected:

```text
Production domain cutover Terraform contract is verified.
CloudFront frontend redirect and route rewrite are verified.
```

The final format check exits with code `0`.

- [ ] **Step 9: Commit the Terraform domain contract**

```powershell
git add infra/tests/production-domain-cutover-contract.test.mjs infra/modules/route53-acm/main.tf infra/modules/route53-acm/variables.tf infra/envs/dev/main.tf infra/envs/dev/variables.tf infra/envs/dev/terraform.tfvars.example
git commit -m "feat: canonical 도메인과 legacy alias 구성 (#1737)"
```

---

### Task 3: GitHub Actions Terraform Plan Inputs

**Files:**
- Modify: `infra/tests/production-domain-cutover-contract.test.mjs`
- Modify: `.github/workflows/terraform-validate.yml:17-18,44-81`

**Interfaces:**
- Consumes: GitHub repository variables containing canonical domains, JSON legacy domain lists, and redirect status.
- Produces: Pull request validation that runs both domain tests and a Terraform plan job that receives every new root variable.

- [ ] **Step 1: Extend the contract test with failing CI assertions**

Add `workflow` to the `Promise.all` reads in `infra/tests/production-domain-cutover-contract.test.mjs`:

```js
  workflow,
```

Add the matching file read:

```js
  readFile(path.join(repoRoot, '.github/workflows/terraform-validate.yml'), 'utf8'),
```

Add these assertions before the final `console.log`:

```js
assert.match(
  workflow,
  /node infra\/tests\/cloudfront-frontend-viewer-request\.test\.mjs/,
);
assert.match(
  workflow,
  /node infra\/tests\/production-domain-cutover-contract\.test\.mjs/,
);
assert.match(
  workflow,
  /TF_VAR_frontend_legacy_domain_names:\s*\$\{\{ vars\.TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES \|\| '\[\]' \}\}/,
);
assert.match(
  workflow,
  /TF_VAR_api_legacy_domain_names:\s*\$\{\{ vars\.TF_PLAN_API_LEGACY_DOMAIN_NAMES \|\| '\[\]' \}\}/,
);
assert.match(
  workflow,
  /TF_VAR_frontend_legacy_redirect_status_code:\s*\$\{\{ vars\.TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE \|\| '302' \}\}/,
);
```

- [ ] **Step 2: Run the contract test and verify the CI assertion fails**

Run:

```powershell
node infra/tests/production-domain-cutover-contract.test.mjs
```

Expected: FAIL because the CloudFront viewer-request test command is absent from the workflow.

- [ ] **Step 3: Run domain tests in Terraform Validate**

After the existing `Verify Terraform PR plan policy` step in `.github/workflows/terraform-validate.yml`, add:

```yaml
      - name: Verify production domain cutover contract
        run: |
          node infra/tests/cloudfront-frontend-viewer-request.test.mjs
          node infra/tests/production-domain-cutover-contract.test.mjs
```

- [ ] **Step 4: Pass the new Terraform plan variables with safe bootstrap defaults**

Add to the plan job `env`:

```yaml
      TF_VAR_frontend_legacy_domain_names: ${{ vars.TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES || '[]' }}
      TF_VAR_api_legacy_domain_names: ${{ vars.TF_PLAN_API_LEGACY_DOMAIN_NAMES || '[]' }}
      TF_VAR_frontend_legacy_redirect_status_code: ${{ vars.TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE || '302' }}
```

Do not add these three bootstrap inputs to `required_inputs`. The cutover runbook's saved
plan supplies the approved legacy lists and redirect status with higher-precedence CLI
`-var` arguments; the repository variables are registered only after canonical health.

- [ ] **Step 5: Run both infrastructure contract tests**

Run:

```powershell
node infra/tests/terraform-pr-plan-policy.test.mjs
node infra/tests/production-domain-cutover-contract.test.mjs
```

Expected:

```text
Terraform PR plan IAM and workflow policy is verified.
Production domain cutover Terraform contract is verified.
```

- [ ] **Step 6: Commit the CI contract**

```powershell
git add .github/workflows/terraform-validate.yml infra/tests/production-domain-cutover-contract.test.mjs
git commit -m "ci: 도메인 전환 Terraform 입력 검증 (#1737)"
```

---

### Task 4: Cutover Runbook and Infrastructure Documentation

**Files:**
- Create: `docs/infra/production-domain-cutover-runbook.md`
- Modify: `infra/tests/production-domain-cutover-contract.test.mjs`
- Modify: `docs/infra/deploy-checklist.md`
- Modify: `docs/infra/dev-architecture.md`
- Modify: `docs/infra/secrets.md`

**Interfaces:**
- Consumes: approved canonical/legacy domain contract and repository variable names from Tasks 2-3.
- Produces: an operator-facing sequence with explicit apply gate, OAuth callback values, smoke tests, 302-to-308 follow-up, and rollback.

- [ ] **Step 1: Add failing documentation contract assertions**

Read the four documentation files in `infra/tests/production-domain-cutover-contract.test.mjs`:

```js
  runbook,
  deployChecklist,
  architecture,
  secrets,
```

Add the matching reads:

```js
  readFile(path.join(repoRoot, 'docs/infra/production-domain-cutover-runbook.md'), 'utf8'),
  readFile(path.join(repoRoot, 'docs/infra/deploy-checklist.md'), 'utf8'),
  readFile(path.join(repoRoot, 'docs/infra/dev-architecture.md'), 'utf8'),
  readFile(path.join(repoRoot, 'docs/infra/secrets.md'), 'utf8'),
```

Add these assertions:

```js
for (const document of [runbook, deployChecklist, architecture, secrets]) {
  assert.match(document, /pilo\.my/);
  assert.match(document, /api\.pilo\.my/);
}

assert.match(runbook, /https:\/\/dev\.pilo\.my\/path\?query=value/);
assert.match(runbook, /302/);
assert.match(runbook, /308/);
assert.match(runbook, /terraform plan -input=false -out=tfplan-domain-cutover/);
assert.match(runbook, /terraform show -no-color tfplan-domain-cutover/);
assert.match(runbook, /https:\/\/api\.pilo\.my\/api\/v1\/health/);
assert.match(runbook, /https:\/\/api\.dev\.pilo\.my\/api\/v1\/health/);
assert.match(runbook, /https:\/\/api\.pilo\.my\/api\/v1\/auth\/google\/callback/);
assert.match(runbook, /https:\/\/api\.pilo\.my\/api\/v1\/auth\/github\/callback/);
assert.match(runbook, /https:\/\/api\.pilo\.my\/api\/v1\/github\/oauth\/callback/);
assert.match(runbook, /https:\/\/api\.pilo\.my\/api\/v1\/github\/project-oauth\/callback/);
assert.match(runbook, /https:\/\/api\.pilo\.my\/api\/v1\/github\/installations\/callback/);
assert.match(runbook, /https:\/\/api\.pilo\.my\/api\/v1\/github\/webhooks/);
assert.match(runbook, /NEXT_PUBLIC_PILO_APP_SERVER_URL.*https:\/\/api\.pilo\.my/);
assert.match(runbook, /NEXT_PUBLIC_PILO_REALTIME_SERVER_URL.*https:\/\/api\.pilo\.my/);
assert.match(runbook, /TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES.*\["dev\.pilo\.my"\]/);
assert.match(runbook, /TF_PLAN_API_LEGACY_DOMAIN_NAMES.*\["api\.dev\.pilo\.my"\]/);
assert.match(runbook, /livekit\.dev\.pilo\.my/);
assert.match(runbook, /turn\.dev\.pilo\.my/);
assert.match(runbook, /https:\/\/api\.dev\.pilo\.my\/api\/v1\/livekit\/webhooks/);
```

- [ ] **Step 2: Run the contract test and verify the runbook is missing**

Run:

```powershell
node infra/tests/production-domain-cutover-contract.test.mjs
```

Expected: FAIL with `ENOENT` for `docs/infra/production-domain-cutover-runbook.md`.

- [ ] **Step 3: Create the cutover runbook with exact operator values**

Create `docs/infra/production-domain-cutover-runbook.md` with these sections and values:

```markdown
# PILO 운영 도메인 전환 Runbook

관련 Issue: #1737

## 고정 범위

- Canonical Frontend: `https://pilo.my`
- Legacy Frontend: `https://dev.pilo.my`
- Canonical API/Realtime: `https://api.pilo.my`
- Legacy API/Realtime: `https://api.dev.pilo.my`
- Frontend legacy redirect: 초기 `302`, 안정화 승인 뒤 `308`
- 유지: `livekit.dev.pilo.my`, `turn.dev.pilo.my`
- 유지: LiveKit webhook `https://api.dev.pilo.my/api/v1/livekit/webhooks`
- 유지: `environment = "dev"`, `pilo-dev-*`, 기존 Terraform state와 ECS 네트워크

## 1. Repository variables 준비

| 이름 | 값 |
| --- | --- |
| `NEXT_PUBLIC_PILO_APP_SERVER_URL` | `https://api.pilo.my` |
| `NEXT_PUBLIC_PILO_REALTIME_SERVER_URL` | `https://api.pilo.my` |
| `TF_PLAN_DOMAIN_NAME` | `pilo.my` |
| `TF_PLAN_FRONTEND_DOMAIN_NAME` | `pilo.my` |
| `TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES` | `["dev.pilo.my"]` |
| `TF_PLAN_API_DOMAIN_NAME` | `api.pilo.my` |
| `TF_PLAN_API_LEGACY_DOMAIN_NAMES` | `["api.dev.pilo.my"]` |
| `TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE` | `302` |

실제 값을 바꾸기 전 현재 값을 기록한다. rollback 시 기록한 값을 복원한다.
전환 전 plan job은 새 legacy/redirect repository variable이 없으면 `[]`, `[]`, `302`
bootstrap 기본값을 사용한다. 실제 cutover saved plan은 승인된 CLI `-var` 값으로
도메인 입력을 고정하고, repository variable은 canonical health 뒤에 등록한다.

## 2. Terraform plan gate

```powershell
terraform -chdir=infra/envs/dev init
terraform -chdir=infra/envs/dev plan -input=false -out=tfplan-domain-cutover
terraform -chdir=infra/envs/dev show -no-color tfplan-domain-cutover
```

`terraform plan -input=false -out=tfplan-domain-cutover`와
`terraform show -no-color tfplan-domain-cutover` 결과에서 다음 변경만 허용한다.

- ACM certificate와 DNS validation record
- Route53 alias record
- CloudFront aliases, Function, Distribution 설정
- ALB HTTPS certificate/listener 연결
- ECS task definition environment 값
- uploads S3 CORS origin
- `terraform_data.dns_configuration` plan-time guard의 최초 생성

RDS, Redis, S3 bucket, VPC, subnet, ECS cluster/service, LiveKit EC2/EIP/DNS의
삭제나 replacement가 보이면 apply하지 않는다.

## 3. Apply 승인 지점

Terraform plan을 사용자와 Infra/Realtime 담당자에게 공유한다. 명시적으로 승인받은
저장된 plan만 적용한다. 승인 뒤 먼저 callback 5개를 canonical 값으로 하나씩 변경하되
provider 설정 화면에서 저장 성공만 확인한다. 아직 `api.pilo.my` DNS/TLS가 없을 수
있으므로 이 시점에는 login/OAuth/setup 기능 검증을 하지 않는다. callback 저장 실패 시
이미 변경한 값을 역순 복원하고 apply하지 않는다.

```powershell
terraform -chdir=infra/envs/dev apply tfplan-domain-cutover
```

## 4. TLS와 기본 health 확인

```powershell
curl.exe -I https://pilo.my
curl.exe -I "https://dev.pilo.my/path?query=value"
curl.exe https://api.pilo.my/api/v1/health
curl.exe https://api.dev.pilo.my/api/v1/health
```

`dev.pilo.my` 응답은 `302`이고 `Location`은
`https://pilo.my/path?query=value`여야 한다. 두 API health 주소는 모두 성공해야 한다.
실제 runbook 명령은 canonical Frontend/API와 legacy API의 exact 2xx, legacy API의
no-redirect, legacy Frontend의 exact `302`와 exact `Location`을 모두 검사한다.

## 5. OAuth와 GitHub App 설정

- Google login: `https://api.pilo.my/api/v1/auth/google/callback`
- GitHub login: `https://api.pilo.my/api/v1/auth/github/callback`
- GitHub user OAuth: `https://api.pilo.my/api/v1/github/oauth/callback`
- GitHub ProjectV2 OAuth: `https://api.pilo.my/api/v1/github/project-oauth/callback`
- GitHub App setup: `https://api.pilo.my/api/v1/github/installations/callback`
- GitHub App webhook: `https://api.pilo.my/api/v1/github/webhooks`

승인된 Terraform apply, 영향받는 ECS 서비스의 steady-state 대기, 4절 HTTP 검증이
성공한 뒤 Google login, GitHub login, GitHub user OAuth, GitHub ProjectV2 OAuth,
GitHub App setup을 하나씩 실제 검증한다. dual-callback staging은 사용하지 않는다.
모든 callback 기능 검증이 성공한 뒤에만 GitHub App webhook을 canonical 값으로 바꾸고
test delivery를 확인한다.

## 6. 애플리케이션 재배포 순서

1. App Server와 Realtime Server task definition을 canonical origin 값으로 배포한다.
2. Worker task definition을 canonical API origin 값으로 배포한다.
3. Frontend를 canonical API/Realtime repository variable로 build하고 S3/CloudFront에 배포한다.
4. CloudFront 전체 invalidation을 실행한다.

## 7. 전체 smoke test

- `https://pilo.my`와 정적 하위 route
- `https://dev.pilo.my/path?query=value`의 path/query 보존 redirect
- canonical/legacy API health
- Google/GitHub login과 callback
- GitHub OAuth, GitHub App 설치, webhook delivery
- Socket.IO Canvas/Board/Meeting 실시간 연결
- S3 presigned upload/download
- LiveKit room/token/recording

## 8. Rollback

1. Frontend/API/Realtime repository variables를 기록해 둔 legacy 값으로 복원한다.
2. OAuth callback과 GitHub App webhook을 legacy API origin으로 복원한다.
3. 직전 정상 task definition과 Frontend artifact를 재배포한다.
4. Terraform에서 canonical alias/SAN/redirect 변경을 되돌린 plan을 검토 후 적용한다.
5. `https://api.dev.pilo.my` health와 `https://dev.pilo.my` Frontend를 확인한다.

## 9. 308 전환

최소 한 번의 운영 관찰 기간 동안 login, webhook, realtime, upload, LiveKit smoke test가
안정적이고 rollback 요구가 없을 때 별도 변경으로
`TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE=308`을 승인받아 적용한다.
```

- [ ] **Step 4: Link and summarize the runbook in existing infrastructure docs**

Add to `docs/infra/deploy-checklist.md`:

```markdown
## 운영 도메인 전환

`pilo.my` 운영 도메인 전환은
[`production-domain-cutover-runbook.md`](./production-domain-cutover-runbook.md)를 따른다.
Terraform plan에서 기존 data-plane 리소스 replacement가 없음을 확인하고, 실제 apply와
OAuth/GitHub provider 변경은 별도 승인을 받은 뒤 수행한다.
```

Add to `docs/infra/dev-architecture.md`:

```markdown
## Canonical/Legacy 도메인 라우팅

- `pilo.my`, `dev.pilo.my`는 기존 CloudFront Distribution을 공유한다.
- `dev.pilo.my`는 CloudFront viewer-request Function에서 `pilo.my`로 302 redirect한다.
- `api.pilo.my`, `api.dev.pilo.my`는 기존 ALB를 공유하며 둘 다 API/Realtime 요청에 응답한다.
- `livekit.dev.pilo.my`, `turn.dev.pilo.my`와 ECS public subnet 구성은 이번 전환에서 유지한다.
```

Update and add to `docs/infra/secrets.md`:

```markdown
| `API_PUBLIC_ORIGIN` | public API origin. canonical 값: `https://api.pilo.my` |
```

```markdown
| `TF_PLAN_FRONTEND_DOMAIN_NAME` | `pilo.my` |
| `TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES` | `["dev.pilo.my"]` |
| `TF_PLAN_API_DOMAIN_NAME` | `api.pilo.my` |
| `TF_PLAN_API_LEGACY_DOMAIN_NAMES` | `["api.dev.pilo.my"]` |
| `TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE` | `302` |
| `NEXT_PUBLIC_PILO_APP_SERVER_URL` | `https://api.pilo.my` |
| `NEXT_PUBLIC_PILO_REALTIME_SERVER_URL` | `https://api.pilo.my` |
```

- [ ] **Step 5: Run the full domain documentation contract**

Run:

```powershell
node infra/tests/production-domain-cutover-contract.test.mjs
```

Expected:

```text
Production domain cutover Terraform contract is verified.
```

- [ ] **Step 6: Commit the runbook and documentation**

```powershell
git add docs/infra/production-domain-cutover-runbook.md docs/infra/deploy-checklist.md docs/infra/dev-architecture.md docs/infra/secrets.md infra/tests/production-domain-cutover-contract.test.mjs
git commit -m "docs: 운영 도메인 전환 runbook 추가 (#1737)"
```

---

### Task 5: Repository Verification and Apply Handoff

**Files:**
- Verify: all files committed in Tasks 1-4
- Do not modify: `infra/envs/dev/tfplan`

**Interfaces:**
- Consumes: completed repository implementation.
- Produces: evidence that the branch is safe to review and an explicit stop before external-state mutations.

- [ ] **Step 1: Run all focused infrastructure tests**

Run:

```powershell
node infra/tests/cloudfront-frontend-viewer-request.test.mjs
node infra/tests/production-domain-cutover-contract.test.mjs
node infra/tests/terraform-pr-plan-policy.test.mjs
```

Expected:

```text
CloudFront frontend redirect and route rewrite are verified.
Production domain cutover Terraform contract is verified.
Terraform PR plan IAM and workflow policy is verified.
```

- [ ] **Step 2: Verify Terraform formatting and configuration**

Run:

```powershell
terraform fmt -check -recursive
terraform -chdir=infra/envs/dev init -backend=false
terraform -chdir=infra/envs/dev validate
```

Expected: every command exits with code `0` and `terraform validate` prints `Success! The configuration is valid.`

- [ ] **Step 3: Verify the diff contains no network, API, DB, or unrelated user changes**

Run:

```powershell
git diff --check
git diff --stat dev...HEAD
git diff --name-only dev...HEAD
git status --short
```

Expected:

- No whitespace errors.
- Changed paths are limited to the files listed in this plan and the approved design/plan documents.
- `infra/modules/network`, `infra/modules/security-groups`, application API code, migrations, and LiveKit configuration are absent.
- Existing user-modified and untracked files remain unstaged.

- [ ] **Step 4: Stop before changing external state**

Report the local/CI verification evidence and request explicit approval to:

1. run the real backend Terraform plan with the approved CLI domain inputs,
2. review the saved plan for replacements,
3. record current provider/repository values and save canonical callback values,
4. apply the approved plan and wait for ECS steady state,
5. verify exact HTTP semantics and then the Google/GitHub callback flows,
6. update the GitHub App webhook and repository variables,
7. redeploy and execute the remaining runbook smoke tests.

Do not run `terraform apply`, mutate provider callbacks, or change repository variables during this step.
