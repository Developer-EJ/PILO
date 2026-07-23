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
  workflow,
  runbook,
  deployChecklist,
  architecture,
  secrets,
] = await Promise.all([
  readFile(path.join(repoRoot, 'infra/envs/dev/main.tf'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/envs/dev/variables.tf'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/envs/dev/terraform.tfvars.example'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/modules/route53-acm/main.tf'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/modules/route53-acm/variables.tf'), 'utf8'),
  readFile(path.join(repoRoot, 'infra/modules/cloudfront/main.tf'), 'utf8'),
  readFile(path.join(repoRoot, '.github/workflows/terraform-validate.yml'), 'utf8'),
  readFile(path.join(repoRoot, 'docs/infra/production-domain-cutover-runbook.md'), 'utf8'),
  readFile(path.join(repoRoot, 'docs/infra/deploy-checklist.md'), 'utf8'),
  readFile(path.join(repoRoot, 'docs/infra/dev-architecture.md'), 'utf8'),
  readFile(path.join(repoRoot, 'docs/infra/secrets.md'), 'utf8'),
]);

const sources = {
  devMain,
  devVariables,
  tfvarsExample,
  acmMain,
  acmVariables,
  cloudfrontMain,
};

const documents = {
  runbook,
  deployChecklist,
  architecture,
  secrets,
};

function extractBlock(source, header) {
  const headerIndex = source.indexOf(header);
  assert.notEqual(headerIndex, -1, `Missing HCL block: ${header}`);

  const openingBraceIndex = source.indexOf('{', headerIndex);
  assert.notEqual(openingBraceIndex, -1, `Missing opening brace for HCL block: ${header}`);

  let depth = 0;
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(headerIndex, index + 1);
      }
    }
  }

  assert.fail(`Missing closing brace for HCL block: ${header}`);
}

function assertExactMatchCount(source, pattern, expectedCount, message) {
  assert.equal([...source.matchAll(pattern)].length, expectedCount, message);
}

function extractYamlJob(source, jobName) {
  const header = `  ${jobName}:\n`;
  const headerIndex = source.indexOf(header);
  assert.notEqual(headerIndex, -1, `Missing Terraform workflow job: ${jobName}`);

  const bodyStart = headerIndex + header.length;
  const nextJobMatch = /^  [^\s][^:\n]*:\s*$/m.exec(source.slice(bodyStart));
  const bodyEnd = nextJobMatch ? bodyStart + nextJobMatch.index : source.length;

  return source.slice(headerIndex, bodyEnd);
}

function extractRequiredInputs(planJob) {
  const requiredInputsMatch = /required_inputs=\(\r?\n([\s\S]*?)\r?\n\s*\)/.exec(planJob);
  assert.notEqual(requiredInputsMatch, null, 'Plan job must define a required_inputs array.');

  return requiredInputsMatch[1];
}

function verifyWorkflowContract(candidateWorkflow) {
  const validationJob = extractYamlJob(candidateWorkflow, 'terraform');
  const planJob = extractYamlJob(candidateWorkflow, 'plan');
  const requiredInputs = extractRequiredInputs(planJob);

  assert.match(
    validationJob,
    /node infra\/tests\/cloudfront-frontend-viewer-request\.test\.mjs/,
    'Terraform validation job must run the CloudFront viewer-request contract test.',
  );
  assert.match(
    validationJob,
    /node infra\/tests\/production-domain-cutover-contract\.test\.mjs/,
    'Terraform validation job must run the production domain cutover contract test.',
  );

  const planMappings = [
    [
      'frontend legacy domains',
      'TF_VAR_frontend_legacy_domain_names',
      'TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES',
    ],
    [
      'API legacy domains',
      'TF_VAR_api_legacy_domain_names',
      'TF_PLAN_API_LEGACY_DOMAIN_NAMES',
    ],
    [
      'frontend legacy redirect status',
      'TF_VAR_frontend_legacy_redirect_status_code',
      'TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE',
    ],
  ];

  for (const [name, variableName, repositoryVariable] of planMappings) {
    assert.match(
      planJob,
      new RegExp(`${variableName}:\\s*\\$\\{\\{ vars\\.${repositoryVariable} \\}\\}`),
      `Plan job must map the ${name} Terraform input from its repository variable.`,
    );
    assert.match(
      requiredInputs,
      new RegExp(`^[ \\t]+${variableName}\\s*$`, 'm'),
      `Plan job required_inputs must include ${variableName}.`,
    );
  }
}

function extractMarkdownSection(source, heading) {
  const header = `## ${heading}`;
  const headerIndex = source.indexOf(header);
  assert.notEqual(headerIndex, -1, `Missing Markdown section: ${header}`);

  const bodyStart = headerIndex + header.length;
  const nextSectionMatch = /^## /m.exec(source.slice(bodyStart));
  const bodyEnd = nextSectionMatch ? bodyStart + nextSectionMatch.index : source.length;

  return source.slice(headerIndex, bodyEnd);
}

function extractMarkdownSubsection(source, heading) {
  const header = `### ${heading}`;
  const headerIndex = source.indexOf(header);
  assert.notEqual(headerIndex, -1, `Missing Markdown subsection: ${header}`);

  const bodyStart = headerIndex + header.length;
  const nextHeadingMatch = /^#{1,3} /m.exec(source.slice(bodyStart));
  const bodyEnd = nextHeadingMatch ? bodyStart + nextHeadingMatch.index : source.length;

  return source.slice(headerIndex, bodyEnd);
}

function assertMarkersInOrder(source, markers, message) {
  let previousIndex = -1;

  for (const marker of markers) {
    const markerIndex = source.indexOf(marker);
    assert.notEqual(markerIndex, -1, `${message}: missing "${marker}".`);
    assert.ok(markerIndex > previousIndex, `${message}: "${marker}" is out of order.`);
    previousIndex = markerIndex;
  }
}

function verifyDocumentationContract(candidateDocuments) {
  const {
    runbook: candidateRunbook,
    deployChecklist: candidateDeployChecklist,
    architecture: candidateArchitecture,
    secrets: candidateSecrets,
  } = candidateDocuments;

  for (const document of [
    candidateRunbook,
    candidateDeployChecklist,
    candidateArchitecture,
    candidateSecrets,
  ]) {
    assert.match(document, /pilo\.my/);
    assert.match(document, /api\.pilo\.my/);
  }

  const fixedScope = extractMarkdownSection(candidateRunbook, '고정 범위');
  assert.match(fixedScope, /Canonical Frontend: `https:\/\/pilo\.my`/);
  assert.match(fixedScope, /Legacy Frontend: `https:\/\/dev\.pilo\.my`/);
  assert.match(fixedScope, /Canonical API\/Realtime: `https:\/\/api\.pilo\.my`/);
  assert.match(fixedScope, /Legacy API\/Realtime: `https:\/\/api\.dev\.pilo\.my`/);
  assert.match(fixedScope, /초기 `302`[\s\S]*승인 후 `308`/);
  assert.match(fixedScope, /Legacy API\/Realtime[\s\S]*redirect하지 않고 활성 상태로 유지/);
  assert.match(fixedScope, /`livekit\.dev\.pilo\.my`/);
  assert.match(fixedScope, /`turn\.dev\.pilo\.my`/);
  assert.match(
    fixedScope,
    /`https:\/\/api\.dev\.pilo\.my\/api\/v1\/livekit\/webhooks`/,
  );

  const repositoryVariables = extractMarkdownSection(candidateRunbook, '1. Repository variables 준비');
  assert.match(
    repositoryVariables,
    /\| `NEXT_PUBLIC_PILO_APP_SERVER_URL` \| `https:\/\/api\.pilo\.my` \|/,
  );
  assert.match(
    repositoryVariables,
    /\| `NEXT_PUBLIC_PILO_REALTIME_SERVER_URL` \| `https:\/\/api\.pilo\.my` \|/,
  );
  assert.match(
    repositoryVariables,
    /\| `TF_PLAN_DOMAIN_NAME` \| `pilo\.my` \|/,
  );
  assert.match(
    repositoryVariables,
    /\| `TF_PLAN_FRONTEND_DOMAIN_NAME` \| `pilo\.my` \|/,
  );
  assert.match(
    repositoryVariables,
    /\| `TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES` \| `\["dev\.pilo\.my"\]` \|/,
    'The repository variable section must preserve the exact frontend legacy-domain JSON.',
  );
  assert.match(
    repositoryVariables,
    /\| `TF_PLAN_API_DOMAIN_NAME` \| `api\.pilo\.my` \|/,
  );
  assert.match(
    repositoryVariables,
    /\| `TF_PLAN_API_LEGACY_DOMAIN_NAMES` \| `\["api\.dev\.pilo\.my"\]` \|/,
  );
  assert.match(
    repositoryVariables,
    /\| `TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE` \| `302` \|/,
  );

  const planGate = extractMarkdownSection(candidateRunbook, '2. Terraform plan gate');
  const savedPlanStart = 'terraform -chdir=infra/envs/dev plan `';
  const savedPlanEnd = '  -out=tfplan-domain-cutover';
  const savedPlanStartIndex = planGate.indexOf(savedPlanStart);
  assert.notEqual(
    savedPlanStartIndex,
    -1,
    'The plan gate must contain the multiline saved domain-cutover plan command.',
  );
  const savedPlanEndMatch = /^  -out=tfplan-domain-cutover$/m.exec(
    planGate.slice(savedPlanStartIndex),
  );
  assert.notEqual(
    savedPlanEndMatch,
    null,
    'The saved domain-cutover plan command must write tfplan-domain-cutover.',
  );
  const savedPlanEndIndex = savedPlanStartIndex + savedPlanEndMatch.index;
  const savedPlanInvocation = planGate.slice(
    savedPlanStartIndex,
    savedPlanEndIndex + savedPlanEnd.length,
  );
  const exactCutoverVarArguments = [
    "-var 'domain_name=pilo.my'",
    "-var 'frontend_domain_name=pilo.my'",
    "-var 'frontend_legacy_domain_names=[\\\"dev.pilo.my\\\"]'",
    "-var 'api_domain_name=api.pilo.my'",
    "-var 'api_legacy_domain_names=[\\\"api.dev.pilo.my\\\"]'",
    "-var 'frontend_legacy_redirect_status_code=302'",
    "-var 'create_dns_records=true'",
  ];
  assertMarkersInOrder(
    savedPlanInvocation,
    [savedPlanStart, '-input=false', ...exactCutoverVarArguments, savedPlanEnd],
    'The saved plan command must contain all exact high-precedence cutover arguments',
  );
  for (const cutoverVarArgument of exactCutoverVarArguments) {
    assert.equal(
      savedPlanInvocation.split(cutoverVarArgument).length - 1,
      1,
      `The saved plan command must contain ${cutoverVarArgument} exactly once.`,
    );
  }
  assert.doesNotMatch(
    candidateRunbook,
    /\$env:TF_VAR_(?:domain_name|frontend_domain_name|frontend_legacy_domain_names|api_domain_name|api_legacy_domain_names|frontend_legacy_redirect_status_code)\s*=/,
    'The runbook must not assign cutover domains through lower-precedence TF_VAR values.',
  );
  assert.match(
    planGate,
    /CLI `-var`[\s\S]*auto-loaded tfvars[\s\S]*우선/,
    'The runbook must explain CLI -var precedence over stale auto-loaded domain values.',
  );
  assert.match(
    planGate,
    /`TF_VAR` assignment[\s\S]*사용하지 않[\s\S]*rollback plan[\s\S]*누출/,
    'The runbook must explain why the simplified plan cannot leak canonical TF_VAR values.',
  );
  assert.match(
    planGate,
    /나머지 비도메인\s+dev 입력[\s\S]*운영자의 기존 승인된 환경/,
    'The plan gate must preserve the operator-approved source for non-domain dev inputs.',
  );
  assert.match(planGate, /terraform -chdir=infra\/envs\/dev init/);
  const afterSavedPlanInvocation = planGate.slice(
    savedPlanEndIndex + savedPlanEnd.length,
  );
  assert.match(
    afterSavedPlanInvocation,
    /if \(\$LASTEXITCODE -ne 0\) \{ throw "terraform plan failed" \}[\s\S]*terraform -chdir=infra\/envs\/dev show -no-color tfplan-domain-cutover[\s\S]*if \(\$LASTEXITCODE -ne 0\) \{ throw "terraform show failed" \}/,
    'The operator shell must stop after either plan or show failure.',
  );
  assert.match(planGate, /terraform -chdir=infra\/envs\/dev show -no-color tfplan-domain-cutover/);
  assert.match(
    planGate,
    /RDS[\s\S]*Redis[\s\S]*S3 bucket[\s\S]*VPC[\s\S]*subnet[\s\S]*ECS cluster\/service[\s\S]*LiveKit EC2\/EIP\/DNS[\s\S]*replacement[\s\S]*apply하지 않는다/,
    'The plan gate must forbid data-plane, network, service, and LiveKit replacements.',
  );

  const applyGate = extractMarkdownSection(candidateRunbook, '3. Apply 승인 지점');
  assert.match(applyGate, /STOP HERE/);
  assert.match(applyGate, /명시적으로 승인/);
  assert.match(applyGate, /repository variable 변경/);
  assert.match(applyGate, /OAuth\/GitHub provider 변경/);
  assert.doesNotMatch(
    candidateRunbook.slice(0, candidateRunbook.indexOf('## 3. Apply 승인 지점')),
    /terraform -chdir=infra\/envs\/dev apply/,
    'No Terraform apply command may appear before the explicit approval gate.',
  );

  const stopIndex = candidateRunbook.indexOf('> **STOP HERE.**');
  assert.notEqual(stopIndex, -1, 'The runbook must contain an explicit STOP marker.');
  const beforeStop = candidateRunbook.slice(0, stopIndex);
  const afterStop = candidateRunbook.slice(stopIndex);
  const providerMutationAction = 'OAuth/setup callback URL을 canonical 값으로 변경한다';
  const repositoryMutationAction = 'repository variables를 1절의 값으로 변경한다';
  assert.doesNotMatch(
    beforeStop,
    /OAuth\/setup callback URL을 canonical 값으로 변경한다/,
    'OAuth/GitHub provider mutation must not appear before STOP.',
  );
  assert.match(
    afterStop,
    /OAuth\/setup callback URL을 canonical 값으로 변경한다/,
    'OAuth/GitHub provider mutation must be explicitly gated after STOP.',
  );
  assert.doesNotMatch(
    beforeStop,
    /repository variables를 1절의 값으로 변경한다/,
    'Repository-variable mutation must not appear before STOP.',
  );
  assert.match(
    afterStop,
    /repository variables를 1절의 값으로 변경한다/,
    'Repository-variable mutation must be explicitly gated after STOP.',
  );

  const maintenanceCutover = extractMarkdownSection(
    candidateRunbook,
    '4. Maintenance-window cutover',
  );
  assertMarkersInOrder(
    maintenanceCutover,
    [
      '현재 provider/repository 값을 rollback 기록에 남긴다',
      providerMutationAction,
      'terraform -chdir=infra/envs/dev apply tfplan-domain-cutover',
      'canonical/legacy API health와 login callback을 즉시 검증한다',
      'GitHub App webhook을 canonical 값으로 변경한다',
      repositoryMutationAction,
    ],
    'The approved maintenance-window cutover steps',
  );
  assert.match(maintenanceCutover, /사용자가 없으므로[\s\S]*일시 중단[\s\S]*허용/);
  assert.match(maintenanceCutover, /dual-callback[\s\S]*사용하지 않는다/);
  assert.match(
    maintenanceCutover,
    /정확한 현재 callback URL[\s\S]*GitHub App webhook[\s\S]*repository variables/,
    'The cutover must record exact callback, webhook, and repository-variable values.',
  );
  assert.match(
    maintenanceCutover,
    /single-callback GitHub OAuth App[\s\S]*legacy callback을 canonical callback으로 직접 교체/,
  );
  assert.match(
    maintenanceCutover,
    /각 callback[\s\S]*저장과 검증[\s\S]*성공[\s\S]*다음 callback/,
    'The callback stage must save and verify one callback before changing the next.',
  );
  assert.match(
    maintenanceCutover,
    /callback 저장 또는 검증 실패[\s\S]*이미 변경한 callback[\s\S]*역순[\s\S]*복원[\s\S]*rollback 경계[\s\S]*apply하지 않는다/,
    'Partial callback failure must reverse prior callback changes and skip apply.',
  );
  assert.match(
    maintenanceCutover,
    /apply 또는 health\/login 검증이 실패[\s\S]*legacy\s+callback[\s\S]*rollback 경계/,
  );
  assert.match(
    maintenanceCutover,
    /canonical API health 성공 이후[\s\S]*GitHub App webhook[\s\S]*repository variables[\s\S]*재배포/,
  );
  assert.match(
    maintenanceCutover,
    /GitHub App webhook 저장[\s\S]*test delivery[\s\S]*실패[\s\S]*이전 webhook[\s\S]*즉시 복원[\s\S]*rollback 경계[\s\S]*repository variables[\s\S]*변경하지 않는다/,
    'Webhook verification failure must restore the previous webhook and block repository updates.',
  );
  assert.match(
    maintenanceCutover,
    /repository variable 업데이트가 실패[\s\S]*변경한 variable[\s\S]*기록한 값[\s\S]*역순[\s\S]*복원[\s\S]*rollback 경계[\s\S]*배포하지 않는다/,
    'Partial repository-variable failure must restore prior values before deployment.',
  );
  assert.match(maintenanceCutover, /https:\/\/dev\.pilo\.my\/path\?query=value/);
  assert.match(maintenanceCutover, /https:\/\/api\.pilo\.my\/api\/v1\/health/);
  assert.match(maintenanceCutover, /https:\/\/api\.dev\.pilo\.my\/api\/v1\/health/);
  assert.match(maintenanceCutover, /`302`/);
  assert.match(maintenanceCutover, /`https:\/\/pilo\.my\/path\?query=value`/);

  const providerSettings = extractMarkdownSection(candidateRunbook, '5. Canonical provider 값');
  assert.match(
    providerSettings,
    /https:\/\/api\.pilo\.my\/api\/v1\/auth\/google\/callback/,
    'The provider section must use the canonical Google login callback.',
  );
  assert.match(
    providerSettings,
    /https:\/\/api\.pilo\.my\/api\/v1\/auth\/github\/callback/,
  );
  assert.match(providerSettings, /https:\/\/api\.pilo\.my\/api\/v1\/github\/oauth\/callback/);
  assert.match(
    providerSettings,
    /https:\/\/api\.pilo\.my\/api\/v1\/github\/project-oauth\/callback/,
  );
  assert.match(
    providerSettings,
    /https:\/\/api\.pilo\.my\/api\/v1\/github\/installations\/callback/,
  );
  assert.match(providerSettings, /https:\/\/api\.pilo\.my\/api\/v1\/github\/webhooks/);
  assert.match(
    providerSettings,
    /LiveKit webhook[\s\S]*https:\/\/api\.dev\.pilo\.my\/api\/v1\/livekit\/webhooks[\s\S]*변경하지 않는다/,
  );

  const smokeTests = extractMarkdownSection(candidateRunbook, '7. 전체 smoke test');
  for (const expectedSmokeTest of [
    /Google\/GitHub login/,
    /GitHub OAuth/,
    /GitHub App 설치/,
    /webhook delivery/,
    /Socket\.IO Canvas\/Board\/Meeting/,
    /S3 presigned upload\/download/,
    /LiveKit room\/token\/recording/,
  ]) {
    assert.match(smokeTests, expectedSmokeTest);
  }

  const rollback = extractMarkdownSection(candidateRunbook, '8. Rollback');
  assert.match(rollback, /repository variables[\s\S]*legacy 값으로 복원/);
  assert.match(rollback, /OAuth callback[\s\S]*GitHub App webhook[\s\S]*legacy API origin/);
  assert.match(rollback, /직전 정상 task definition[\s\S]*Frontend artifact/);
  assert.match(rollback, /되돌림 plan[\s\S]*검토[\s\S]*승인[\s\S]*적용/);
  assert.match(rollback, /https:\/\/api\.dev\.pilo\.my\/api\/v1\/health/);
  assert.match(rollback, /https:\/\/dev\.pilo\.my/);

  const permanentRedirect = extractMarkdownSection(candidateRunbook, '9. 308 전환');
  assert.match(permanentRedirect, /TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE=308/);
  assert.match(permanentRedirect, /별도 변경[\s\S]*승인/);

  const deploySection = extractMarkdownSection(candidateDeployChecklist, '운영 도메인 전환');
  assert.match(
    deploySection,
    /\[`production-domain-cutover-runbook\.md`\]\(\.\/production-domain-cutover-runbook\.md\)/,
  );
  assert.match(deploySection, /data-plane[\s\S]*replacement/);

  const architectureSection = extractMarkdownSection(
    candidateArchitecture,
    'Canonical/Legacy 도메인 라우팅',
  );
  assert.match(architectureSection, /`pilo\.my`, `dev\.pilo\.my`[\s\S]*CloudFront Distribution/);
  assert.match(architectureSection, /`dev\.pilo\.my`[\s\S]*`pilo\.my`[\s\S]*302 redirect/);
  assert.match(
    architectureSection,
    /`api\.pilo\.my`, `api\.dev\.pilo\.my`[\s\S]*기존 ALB[\s\S]*redirect 없이/,
    'The architecture section must keep canonical and legacy APIs active without redirect.',
  );
  assert.match(architectureSection, /`livekit\.dev\.pilo\.my`, `turn\.dev\.pilo\.my`[\s\S]*유지/);

  const ecsEnvironmentVariables = extractMarkdownSection(candidateSecrets, '4. ECS 환경 변수');
  assert.match(
    ecsEnvironmentVariables,
    /\| `API_PUBLIC_ORIGIN` \| public API origin\. canonical 값: `https:\/\/api\.pilo\.my` \|/,
  );
  assert.match(
    ecsEnvironmentVariables,
    /LiveKit webhook[\s\S]*`https:\/\/api\.dev\.pilo\.my\/api\/v1\/livekit\/webhooks`[\s\S]*변경하지 않는다/,
    'The secrets guide must document the legacy LiveKit webhook exception.',
  );

  const githubActionsVariables = extractMarkdownSubsection(
    candidateSecrets,
    'GitHub Actions Variables',
  );
  for (const repositoryVariable of [
    ['TF_PLAN_DOMAIN_NAME', 'pilo\\.my'],
    ['TF_PLAN_FRONTEND_DOMAIN_NAME', 'pilo\\.my'],
    ['TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES', '\\["dev\\.pilo\\.my"\\]'],
    ['TF_PLAN_API_DOMAIN_NAME', 'api\\.pilo\\.my'],
    ['TF_PLAN_API_LEGACY_DOMAIN_NAMES', '\\["api\\.dev\\.pilo\\.my"\\]'],
    ['TF_PLAN_FRONTEND_LEGACY_REDIRECT_STATUS_CODE', '302'],
    ['NEXT_PUBLIC_PILO_APP_SERVER_URL', 'https://api\\.pilo\\.my'],
    ['NEXT_PUBLIC_PILO_REALTIME_SERVER_URL', 'https://api\\.pilo\\.my'],
  ]) {
    assert.match(
      githubActionsVariables,
      new RegExp(`\\| \\\`${repositoryVariable[0]}\\\` \\| \\\`${repositoryVariable[1]}\\\` \\|`),
      `GitHub Actions Variables must contain the exact ${repositoryVariable[0]} value.`,
    );
  }
}

function verifyProductionDomainCutoverContract(candidateSources) {
  const {
    devMain: candidateDevMain,
    devVariables: candidateDevVariables,
    tfvarsExample: candidateTfvarsExample,
    acmMain: candidateAcmMain,
    acmVariables: candidateAcmVariables,
    cloudfrontMain: candidateCloudfrontMain,
  } = candidateSources;

  const rootLocals = extractBlock(candidateDevMain, 'locals {');
  assert.match(
    rootLocals,
    /^  frontend_domains = var\.create_dns_records \? concat\(\r?\n    \[var\.frontend_domain_name\],\r?\n    var\.frontend_legacy_domain_names,\r?\n  \) : \[\]$/m,
    'frontend_domains must concatenate the canonical domain before all legacy domains.',
  );
  assert.match(
    rootLocals,
    /^  api_domains = var\.create_dns_records \? concat\(\r?\n    \[var\.api_domain_name\],\r?\n    var\.api_legacy_domain_names,\r?\n  \) : \[\]$/m,
    'api_domains must concatenate the canonical domain before all legacy domains.',
  );

  const frontendInvariant = extractBlock(
    candidateDevMain,
    'check "frontend_domain_names_are_distinct" {',
  );
  assert.match(
    frontendInvariant,
    /condition\s*=\s*!contains\(var\.frontend_legacy_domain_names,\s*var\.frontend_domain_name\)/,
    'frontend canonical/legacy invariant must reject the canonical domain in the legacy list.',
  );
  assert.match(
    frontendInvariant,
    /error_message\s*=\s*"frontend_domain_name must not also be a legacy frontend domain\."/,
  );

  const apiInvariant = extractBlock(candidateDevMain, 'check "api_domain_names_are_distinct" {');
  assert.match(
    apiInvariant,
    /condition\s*=\s*!contains\(var\.api_legacy_domain_names,\s*var\.api_domain_name\)/,
    'API canonical/legacy invariant must reject the canonical domain in the legacy list.',
  );
  assert.match(
    apiInvariant,
    /error_message\s*=\s*"api_domain_name must not also be a legacy API domain\."/,
  );

  const frontendLegacyVariable = extractBlock(
    candidateDevVariables,
    'variable "frontend_legacy_domain_names" {',
  );
  assert.match(
    frontendLegacyVariable,
    /condition\s*=\s*length\(distinct\(var\.frontend_legacy_domain_names\)\)\s*==\s*length\(var\.frontend_legacy_domain_names\)/,
    'frontend legacy domains must reject duplicates.',
  );
  assert.match(
    frontendLegacyVariable,
    /error_message\s*=\s*"frontend_legacy_domain_names must not contain duplicates\."/,
  );

  const apiLegacyVariable = extractBlock(
    candidateDevVariables,
    'variable "api_legacy_domain_names" {',
  );
  assert.match(
    apiLegacyVariable,
    /condition\s*=\s*length\(distinct\(var\.api_legacy_domain_names\)\)\s*==\s*length\(var\.api_legacy_domain_names\)/,
    'API legacy domains must reject duplicates.',
  );
  assert.match(
    apiLegacyVariable,
    /error_message\s*=\s*"api_legacy_domain_names must not contain duplicates\."/,
  );

  const redirectStatusVariable = extractBlock(
    candidateDevVariables,
    'variable "frontend_legacy_redirect_status_code" {',
  );
  assert.match(
    redirectStatusVariable,
    /default\s*=\s*302/,
    'frontend legacy redirect status must default to 302.',
  );
  assert.match(
    redirectStatusVariable,
    /condition\s*=\s*contains\(\[302,\s*308\],\s*var\.frontend_legacy_redirect_status_code\)/,
    'frontend legacy redirect status must allow only 302 or 308.',
  );
  assert.match(
    redirectStatusVariable,
    /error_message\s*=\s*"frontend_legacy_redirect_status_code must be 302 or 308\."/,
  );

  assert.match(
    candidateDevMain,
    /frontend_subject_alternative_names\s*=\s*var\.frontend_legacy_domain_names/,
  );
  assert.match(
    candidateDevMain,
    /api_subject_alternative_names\s*=\s*var\.api_legacy_domain_names/,
  );
  assert.match(candidateDevMain, /aliases\s*=\s*local\.frontend_domains/);
  assert.match(candidateDevMain, /canonical_frontend_origin\s*=\s*local\.frontend_origin/);
  assert.match(
    candidateDevMain,
    /legacy_redirect_hostnames\s*=\s*var\.frontend_legacy_domain_names/,
  );
  assert.match(
    candidateDevMain,
    /legacy_redirect_status_code\s*=\s*var\.frontend_legacy_redirect_status_code/,
  );
  assert.match(
    candidateDevMain,
    /uploads_cors_allowed_origins\s*=\s*concat\(\s*\["http:\/\/localhost:3000"\],\s*\[for domain in local\.frontend_domains : "https:\/\/\$\{domain\}"\],\s*\)/,
  );

  const appServer = extractBlock(candidateDevMain, '    app-server = {');
  assert.match(
    appServer,
    /FRONTEND_URL\s*=\s*local\.frontend_origin/,
    'App Server must use the canonical frontend origin.',
  );
  assert.match(
    appServer,
    /API_PUBLIC_ORIGIN\s*=\s*local\.api_origin/,
    'App Server must use the canonical API origin.',
  );
  assert.match(appServer, /LIVEKIT_RECORDING_MODE\s*=\s*"room_audio_only"/);
  assert.match(appServer, /LIVEKIT_EGRESS_S3_PREFIX\s*=\s*"recordings\/meetings"/);

  const realtimeServer = extractBlock(candidateDevMain, '    realtime-server = {');
  assert.match(
    realtimeServer,
    /SOCKET_IO_CORS_ORIGIN\s*=\s*local\.frontend_origin\s*==\s*""\s*\?\s*"\*"\s*:\s*local\.frontend_origin/,
    'Realtime Server CORS must use the canonical frontend origin when configured.',
  );

  const aiWorker = extractBlock(candidateDevMain, '    ai-worker = {');
  assert.match(
    aiWorker,
    /MEETING_REPORT_EVENT_BASE_URL\s*=\s*local\.api_origin/,
    'Legacy-drain AI worker meeting callbacks must use the canonical API origin.',
  );
  assert.match(
    aiWorker,
    /AGENT_EXECUTION_HANDOFF_BASE_URL\s*=\s*local\.api_origin/,
    'Legacy-drain AI worker handoffs must use the canonical API origin.',
  );

  const agentWorker = extractBlock(candidateDevMain, '    agent-worker = {');
  assert.match(
    agentWorker,
    /AGENT_EXECUTION_HANDOFF_BASE_URL\s*=\s*local\.api_origin/,
    'Agent worker handoffs must use the canonical API origin.',
  );

  const meetingWorker = extractBlock(candidateDevMain, '    meeting-worker = {');
  assert.match(
    meetingWorker,
    /MEETING_REPORT_EVENT_BASE_URL\s*=\s*local\.api_origin/,
    'Meeting worker callbacks must use the canonical API origin.',
  );

  const prReviewWorker = extractBlock(candidateDevMain, '    pr-review-ai-worker = {');
  assert.match(
    prReviewWorker,
    /PR_REVIEW_ANALYSIS_HANDOFF_BASE_URL\s*=\s*local\.api_origin/,
    'PR Review worker handoffs must use the canonical API origin.',
  );

  const githubSyncWorker = extractBlock(candidateDevMain, '    github-sync-worker = {');
  assert.match(
    githubSyncWorker,
    /API_PUBLIC_ORIGIN\s*=\s*local\.api_origin/,
    'GitHub Sync worker must use the canonical API origin.',
  );

  assertExactMatchCount(
    candidateDevMain,
    /\bFRONTEND_URL\s*=\s*local\.frontend_origin\b/g,
    1,
    'FRONTEND_URL must have exactly one canonical binding.',
  );
  assertExactMatchCount(
    candidateDevMain,
    /\bAPI_PUBLIC_ORIGIN\s*=\s*local\.api_origin\b/g,
    2,
    'API_PUBLIC_ORIGIN must have exactly two canonical bindings.',
  );
  assertExactMatchCount(
    candidateDevMain,
    /\bSOCKET_IO_CORS_ORIGIN\s*=\s*local\.frontend_origin\s*==\s*""\s*\?\s*"\*"\s*:\s*local\.frontend_origin\b/g,
    1,
    'SOCKET_IO_CORS_ORIGIN must have exactly one canonical binding.',
  );
  assertExactMatchCount(
    candidateDevMain,
    /\bMEETING_REPORT_EVENT_BASE_URL\s*=\s*local\.api_origin\b/g,
    2,
    'MEETING_REPORT_EVENT_BASE_URL must have exactly two canonical bindings.',
  );
  assertExactMatchCount(
    candidateDevMain,
    /\bAGENT_EXECUTION_HANDOFF_BASE_URL\s*=\s*local\.api_origin\b/g,
    2,
    'AGENT_EXECUTION_HANDOFF_BASE_URL must have exactly two canonical bindings.',
  );
  assertExactMatchCount(
    candidateDevMain,
    /\bPR_REVIEW_ANALYSIS_HANDOFF_BASE_URL\s*=\s*local\.api_origin\b/g,
    1,
    'PR_REVIEW_ANALYSIS_HANDOFF_BASE_URL must have exactly one canonical binding.',
  );
  assert.doesNotMatch(
    candidateDevMain,
    /(?:FRONTEND_URL|SOCKET_IO_CORS_ORIGIN)\s*=\s*local\.frontend_domain\s*==/,
    'No frontend binding may restore the replaced frontend-domain conditional.',
  );
  assert.doesNotMatch(
    candidateDevMain,
    /(?:API_PUBLIC_ORIGIN|MEETING_REPORT_EVENT_BASE_URL|AGENT_EXECUTION_HANDOFF_BASE_URL|PR_REVIEW_ANALYSIS_HANDOFF_BASE_URL)\s*=\s*local\.api_domain\s*==/,
    'No API binding may restore the replaced API-domain conditional.',
  );

  assert.match(candidateDevMain, /for_each\s*=\s*toset\(local\.frontend_domains\)/);
  assert.match(candidateDevMain, /for_each\s*=\s*toset\(local\.api_domains\)/);
  assert.match(
    candidateDevMain,
    /from\s*=\s*aws_route53_record\.frontend\[0\][\s\S]*to\s*=\s*aws_route53_record\.frontend\["dev\.pilo\.my"\]/,
  );
  assert.match(
    candidateDevMain,
    /from\s*=\s*aws_route53_record\.api\[0\][\s\S]*to\s*=\s*aws_route53_record\.api\["api\.dev\.pilo\.my"\]/,
  );

  assert.match(candidateAcmVariables, /variable "frontend_subject_alternative_names"/);
  assert.match(candidateAcmVariables, /variable "api_subject_alternative_names"/);
  assert.match(
    candidateAcmMain,
    /subject_alternative_names\s*=\s*var\.frontend_subject_alternative_names/,
  );
  assert.match(
    candidateAcmMain,
    /subject_alternative_names\s*=\s*var\.api_subject_alternative_names/,
  );
  assert.match(
    candidateCloudfrontMain,
    /templatefile\("\$\{path\.module\}\/functions\/frontend-viewer-request\.js\.tftpl"/,
  );

  assert.match(candidateTfvarsExample, /^domain_name\s*=\s*"pilo\.my"$/m);
  assert.match(candidateTfvarsExample, /^frontend_domain_name\s*=\s*"pilo\.my"$/m);
  assert.match(
    candidateTfvarsExample,
    /^frontend_legacy_domain_names\s*=\s*\["dev\.pilo\.my"\]$/m,
  );
  assert.match(candidateTfvarsExample, /^api_domain_name\s*=\s*"api\.pilo\.my"$/m);
  assert.match(
    candidateTfvarsExample,
    /^api_legacy_domain_names\s*=\s*\["api\.dev\.pilo\.my"\]$/m,
  );
  assert.match(candidateTfvarsExample, /^frontend_legacy_redirect_status_code\s*=\s*302$/m);

  const ecsModule = extractBlock(candidateDevMain, 'module "ecs" {');
  assert.match(ecsModule, /subnet_ids\s*=\s*module\.network\.public_subnet_ids/);
  assert.match(ecsModule, /assign_public_ip\s*=\s*var\.ecs_assign_public_ip/);
  assert.match(appServer, /DATABASE_APPLICATION_NAME\s*=\s*"pilo-dev-app-server"/);
  assert.doesNotMatch(candidateDevMain, /livekit\.pilo\.my|turn\.pilo\.my/);
}

function expectMutationRejected({
  name,
  sourceName,
  mutate,
  expectedFailure,
}) {
  const mutatedSource = mutate(sources[sourceName]);
  assert.notEqual(mutatedSource, sources[sourceName], `${name} mutation must change its source.`);

  let failure;
  try {
    verifyProductionDomainCutoverContract({
      ...sources,
      [sourceName]: mutatedSource,
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure, `${name} mutation must be rejected by the contract verifier.`);
  assert.equal(failure.code, 'ERR_ASSERTION', `${name} must fail through a contract assertion.`);
  assert.match(failure.message, expectedFailure, `${name} must fail at its intended guard.`);
}

verifyProductionDomainCutoverContract(sources);

expectMutationRejected({
  name: 'broken frontend domain composition',
  sourceName: 'devMain',
  mutate: (source) => {
    const brokenRootAssignment = source.replace(
      '    var.frontend_legacy_domain_names,\n  ) : []',
      '    [],\n  ) : []',
    );
    const outOfScopePrefixedDecoy = [
      '',
      'locals {',
      '  original_frontend_domains = var.create_dns_records ? concat(',
      '    [var.frontend_domain_name],',
      '    var.frontend_legacy_domain_names,',
      '  ) : []',
      '}',
      '',
    ].join('\n');

    return brokenRootAssignment + outOfScopePrefixedDecoy;
  },
  expectedFailure: /frontend_domains must concatenate/,
});

expectMutationRejected({
  name: 'missing frontend canonical/legacy invariant',
  sourceName: 'devMain',
  mutate: (source) => source.replace(
    '    condition     = !contains(var.frontend_legacy_domain_names, var.frontend_domain_name)',
    '    condition     = true',
  ),
  expectedFailure: /frontend canonical\/legacy invariant/,
});

expectMutationRejected({
  name: 'reverted AI worker callback origin',
  sourceName: 'devMain',
  mutate: (source) => source.replace(
    '        MEETING_REPORT_EVENT_BASE_URL        = local.api_origin',
    '        MEETING_REPORT_EVENT_BASE_URL        = local.api_domain == "" ? "http://${module.alb.alb_dns_name}" : "https://${local.api_domain}"',
  ),
  expectedFailure: /Legacy-drain AI worker meeting callbacks/,
});

expectMutationRejected({
  name: 'redirect default changed to 308',
  sourceName: 'devVariables',
  mutate: (source) => source.replace('  default     = 302', '  default     = 308'),
  expectedFailure: /frontend legacy redirect status must default to 302/,
});

function expectWorkflowMutationRejected({ name, mutate, expectedFailure }) {
  const mutatedWorkflow = mutate(workflow);
  assert.notEqual(mutatedWorkflow, workflow, `${name} mutation must change the workflow.`);

  let failure;
  try {
    verifyWorkflowContract(mutatedWorkflow);
  } catch (error) {
    failure = error;
  }

  assert.ok(failure, `${name} mutation must be rejected by the workflow contract verifier.`);
  assert.equal(failure.code, 'ERR_ASSERTION', `${name} must fail through a contract assertion.`);
  assert.match(failure.message, expectedFailure, `${name} must fail at its intended guard.`);
}

verifyWorkflowContract(workflow);

expectWorkflowMutationRejected({
  name: 'validation command moved to the plan job as a decoy',
  mutate: (source) => source
    .replace('          node infra/tests/cloudfront-frontend-viewer-request.test.mjs\n', '')
    .replace(
      '  plan:\n',
      '  plan:\n    # node infra/tests/cloudfront-frontend-viewer-request.test.mjs\n',
    ),
  expectedFailure: /Terraform validation job must run the CloudFront viewer-request contract test/,
});

expectWorkflowMutationRejected({
  name: 'plan mapping moved to the validation job as a decoy',
  mutate: (source) => source
    .replace(
      '      TF_VAR_frontend_legacy_domain_names: ${{ vars.TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES }}\n',
      '',
    )
    .replace(
      '\n  plan:\n',
      '\n    # TF_VAR_frontend_legacy_domain_names: ${{ vars.TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES }}\n\n  plan:\n',
    ),
  expectedFailure: /Plan job must map the frontend legacy domains Terraform input/,
});

expectWorkflowMutationRejected({
  name: 'required input removed while its plan mapping remains as a decoy',
  mutate: (source) => source.replace('            TF_VAR_api_legacy_domain_names\n', ''),
  expectedFailure: /Plan job required_inputs must include TF_VAR_api_legacy_domain_names/,
});

function expectDocumentationMutationRejected({
  name,
  documentName,
  mutate,
  expectedFailure,
}) {
  const mutatedDocument = mutate(documents[documentName]);
  assert.notEqual(
    mutatedDocument,
    documents[documentName],
    `${name} mutation must change its document.`,
  );

  let failure;
  try {
    verifyDocumentationContract({
      ...documents,
      [documentName]: mutatedDocument,
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure, `${name} mutation must be rejected by the documentation verifier.`);
  assert.equal(failure.code, 'ERR_ASSERTION', `${name} must fail through a contract assertion.`);
  assert.match(failure.message, expectedFailure, `${name} must fail at its intended guard.`);
}

verifyDocumentationContract(documents);

expectDocumentationMutationRejected({
  name: 'wrong saved plan output with an out-of-section decoy',
  documentName: 'runbook',
  mutate: (source) => source
    .replace('  -out=tfplan-domain-cutover', '  -out=tfplan-domain-cutover-broken')
    .concat('\n<!--   -out=tfplan-domain-cutover -->\n'),
  expectedFailure: /saved domain-cutover plan command must write tfplan-domain-cutover/i,
});

expectDocumentationMutationRejected({
  name: 'wrong CLI legacy-domain list with an out-of-section decoy',
  documentName: 'runbook',
  mutate: (source) => source
    .replace(
      "-var 'frontend_legacy_domain_names=[\\\"dev.pilo.my\\\"]'",
      "-var 'frontend_legacy_domain_names=[\\\"old.pilo.my\\\"]'",
    )
    .concat('\n<!-- -var \'frontend_legacy_domain_names=[\\"dev.pilo.my\\"]\' -->\n'),
  expectedFailure: /saved plan command must contain all exact high-precedence cutover arguments/i,
});

expectDocumentationMutationRejected({
  name: 'create DNS CLI override removed with an out-of-section decoy',
  documentName: 'runbook',
  mutate: (source) => source
    .replace("  -var 'create_dns_records=true' `\n", '')
    .concat('\n<!-- -var \'create_dns_records=true\' -->\n'),
  expectedFailure: /saved plan command must contain all exact high-precedence cutover arguments/i,
});

expectDocumentationMutationRejected({
  name: 'wrong OAuth callback with an out-of-section decoy',
  documentName: 'runbook',
  mutate: (source) => source
    .replace(
      'https://api.pilo.my/api/v1/auth/google/callback',
      'https://api.dev.pilo.my/api/v1/auth/google/callback',
    )
    .concat('\n<!-- https://api.pilo.my/api/v1/auth/google/callback -->\n'),
  expectedFailure: /provider section must use the canonical Google login callback/i,
});

expectDocumentationMutationRejected({
  name: 'wrong repository JSON with an out-of-section decoy',
  documentName: 'runbook',
  mutate: (source) => source
    .replace(
      '| `TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES` | `["dev.pilo.my"]` |',
      '| `TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES` | `dev.pilo.my` |',
    )
    .concat('\n<!-- TF_PLAN_FRONTEND_LEGACY_DOMAIN_NAMES: ["dev.pilo.my"] -->\n'),
  expectedFailure: /repository variable section must preserve the exact frontend legacy-domain JSON/i,
});

expectDocumentationMutationRejected({
  name: 'OAuth provider mutation moved before STOP with an after-gate decoy',
  documentName: 'runbook',
  mutate: (source) => source.replace(
    '## 3. Apply 승인 지점',
    'OAuth/setup callback URL을 canonical 값으로 변경한다.\n\n## 3. Apply 승인 지점',
  ),
  expectedFailure: /OAuth\/GitHub provider mutation must not appear before STOP/,
});

expectDocumentationMutationRejected({
  name: 'repository-variable mutation moved before STOP with an after-gate decoy',
  documentName: 'runbook',
  mutate: (source) => source.replace(
    '## 3. Apply 승인 지점',
    'repository variables를 1절의 값으로 변경한다.\n\n## 3. Apply 승인 지점',
  ),
  expectedFailure: /Repository-variable mutation must not appear before STOP/,
});

expectDocumentationMutationRejected({
  name: 'partial callback recovery loses reverse order with an out-of-section decoy',
  documentName: 'runbook',
  mutate: (source) => source
    .replace('변경의 역순으로 모두 복원', '임의 순서로 복원')
    .concat(
      '\n<!-- callback 저장 또는 검증 실패 시 이미 변경한 callback을 변경의 역순으로 모두 복원하고 rollback 경계로 이동하며 apply하지 않는다. -->\n',
    ),
  expectedFailure: /Partial callback failure must reverse prior callback changes and skip apply/,
});

expectDocumentationMutationRejected({
  name: 'webhook test failure no longer restores the prior value with an out-of-section decoy',
  documentName: 'runbook',
  mutate: (source) => source
    .replace('실패하면 이전 webhook을 즉시 복원', '실패하면 webhook 상태를 조사')
    .concat(
      '\n<!-- GitHub App webhook 저장 또는 test delivery 실패 시 이전 webhook을 즉시 복원하고 rollback 경계에서 repository variables를 변경하지 않는다. -->\n',
    ),
  expectedFailure: /Webhook verification failure must restore the previous webhook and block repository updates/,
});

expectDocumentationMutationRejected({
  name: 'legacy API redirect introduced with an out-of-section decoy',
  documentName: 'architecture',
  mutate: (source) => source
    .replace(
      '둘 다 API/Realtime 요청에 redirect 없이 응답한다.',
      'legacy API는 canonical API로 redirect한다.',
    )
    .concat('\n<!-- api.pilo.my, api.dev.pilo.my: 기존 ALB에서 redirect 없이 응답 -->\n'),
  expectedFailure: /architecture section must keep canonical and legacy APIs active without redirect/i,
});

expectDocumentationMutationRejected({
  name: 'wrong GitHub Actions variable with an out-of-subsection decoy',
  documentName: 'secrets',
  mutate: (source) => source
    .replace(
      '| `NEXT_PUBLIC_PILO_APP_SERVER_URL` | `https://api.pilo.my` |',
      '| `NEXT_PUBLIC_PILO_APP_SERVER_URL` | `https://api.dev.pilo.my` |',
    )
    .concat('\n| `NEXT_PUBLIC_PILO_APP_SERVER_URL` | `https://api.pilo.my` |\n'),
  expectedFailure: /GitHub Actions Variables must contain the exact NEXT_PUBLIC_PILO_APP_SERVER_URL value/,
});

expectDocumentationMutationRejected({
  name: 'LiveKit webhook exception moved outside the ECS environment section',
  documentName: 'secrets',
  mutate: (source) => source
    .replace(
      /예외로 LiveKit webhook은\r?\n`https:\/\/api\.dev\.pilo\.my\/api\/v1\/livekit\/webhooks`로 유지하며 변경하지 않는다\./,
      'LiveKit webhook은 별도 운영 문서를 따른다.',
    )
    .concat(
      '\nLiveKit webhook은 `https://api.dev.pilo.my/api/v1/livekit/webhooks`로 유지하며 변경하지 않는다.\n',
    ),
  expectedFailure: /secrets guide must document the legacy LiveKit webhook exception/i,
});

console.log('Production domain cutover Terraform contract is verified.');
console.log('Production domain cutover mutation guards are verified.');
console.log('Production domain cutover documentation contract is verified.');
console.log('Production domain cutover documentation mutation guards are verified.');
