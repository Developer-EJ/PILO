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

const sources = {
  devMain,
  devVariables,
  tfvarsExample,
  acmMain,
  acmVariables,
  cloudfrontMain,
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

console.log('Production domain cutover Terraform contract is verified.');
console.log('Production domain cutover mutation guards are verified.');
