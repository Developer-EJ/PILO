#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const CENTRAL_FILES = [
  "docs/contracts/openapi/pilo-public-api.yaml",
  "docs/contracts/schemas/pilo-public-contracts.schema.json",
  "apps/app-server/src/common/contracts/public-contracts.ts",
  "apps/frontend/lib/types/public-contracts.ts",
  "apps/ai-worker/app/common/schemas/public_contracts.py",
  "docs/db/pilo_erd_schema.sql",
  "apps/app-server/prisma/schema.prisma",
  "docs/contracts/fixtures/workspace-dashboard.fixture.json",
  "apps/frontend/app/page.tsx",
];

const CENTRAL_PREFIXES = ["apps/app-server/prisma/migrations/"];

const OWNER_LOCAL_EVIDENCE = [
  "docs/contracts/openapi/domains/",
  "docs/contracts/schemas/domains/",
  "docs/db/domains/",
  "apps/app-server/prisma/domains/",
];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isCentralFile(filePath) {
  const normalized = normalizePath(filePath);
  return (
    CENTRAL_FILES.includes(normalized) ||
    CENTRAL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

function changedFiles() {
  const baseSha = process.env.PR_BASE_SHA;
  const headSha = process.env.PR_HEAD_SHA;

  if (!baseSha || !headSha) {
    console.log("Skipping central file guard: PR_BASE_SHA or PR_HEAD_SHA is not set.");
    return [];
  }

  const output = execFileSync("git", ["diff", "--name-only", baseSha, headSha], {
    encoding: "utf8",
  });
  return output.split(/\r?\n/).filter(Boolean).map(normalizePath);
}

function isContractIntegrationPr(body) {
  return /-\s*\[[xX]\]\s*Contract Integration PR\b/.test(body);
}

function hasOwnerLocalEvidence(body) {
  return OWNER_LOCAL_EVIDENCE.some((path) => body.includes(path));
}

const prBody = process.env.PR_BODY || "";
const centralChanges = changedFiles().filter(isCentralFile);

if (centralChanges.length === 0) {
  console.log("Central file guard passed: no central files changed.");
  process.exit(0);
}

if (!isContractIntegrationPr(prBody)) {
  console.error("Feature PRs must not edit central files directly.");
  console.error("Changed central files:");
  for (const filePath of centralChanges) {
    console.error(`- ${filePath}`);
  }
  console.error("Split these changes out or mark the PR as a Contract Integration PR.");
  process.exit(1);
}

if (!hasOwnerLocalEvidence(prBody)) {
  console.error("Contract Integration PRs must list reviewed owner-local fragments/shards.");
  console.error("Include at least one of:");
  for (const path of OWNER_LOCAL_EVIDENCE) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

console.log("Central file guard passed: Contract Integration PR with owner-local evidence.");
