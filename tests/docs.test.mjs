/**
 * Tests for project documentation and configuration files added in PR:
 *   - .coderabbit.yaml
 *   - agent.md
 *   - docs/convention.md
 *   - docs/contracts/contract-change-rules.md
 *   - docs/agent-collaboration-guide.md
 *   - docs/PILO_5인_분업_상세_명세.md
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ---------------------------------------------------------------------------
// .coderabbit.yaml
// ---------------------------------------------------------------------------

describe(".coderabbit.yaml", () => {
  let content;

  it("file exists", () => {
    const filePath = path.join(ROOT, ".coderabbit.yaml");
    assert.ok(fs.existsSync(filePath), ".coderabbit.yaml must exist");
    content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.length > 0, "file must not be empty");
  });

  it("language is set to ko-KR", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /language:\s*["']ko-KR["']/, "language must be ko-KR");
  });

  it("tone_instructions is present", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /tone_instructions:/, "tone_instructions field must be present");
  });

  it("review profile is assertive", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /profile:\s*["']assertive["']/, "review profile must be assertive");
  });

  it("auto_review is enabled", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /enabled:\s*true/, "auto_review.enabled must be true");
  });

  it("auto_review targets dev branch", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /base_branches:[\s\S]*?-\s*["']dev["']/, "base_branches must include dev");
  });

  it("auto_review targets main branch", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /base_branches:[\s\S]*?-\s*["']main["']/, "base_branches must include main");
  });

  it("ignore_title_keywords includes WIP", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /ignore_title_keywords:[\s\S]*?-\s*["']WIP["']/, "ignore_title_keywords must include WIP");
  });

  it("ignore_title_keywords includes DO NOT MERGE", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /ignore_title_keywords:[\s\S]*?-\s*["']DO NOT MERGE["']/, "ignore_title_keywords must include DO NOT MERGE");
  });

  it("ignore_title_keywords includes [skip review]", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /ignore_title_keywords:[\s\S]*?\[skip review\]/, "ignore_title_keywords must include [skip review]");
  });

  it("path_instructions covers docs/contracts/**", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /path:\s*["']docs\/contracts\/\*\*["']/, "path_instructions must have docs/contracts/** entry");
  });

  it("path_instructions covers apps/**", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /path:\s*["']apps\/\*\*["']/, "path_instructions must have apps/** entry");
  });

  it("path_instructions covers .github/workflows/**", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /path:\s*["']\.github\/workflows\/\*\*["']/, "path_instructions must have .github/workflows/** entry");
  });

  it("path_instructions covers infra/**", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /path:\s*["']infra\/\*\*["']/, "path_instructions must have infra/** entry");
  });

  it("knowledge_base code_guidelines is enabled", () => {
    content = content || readFile(".coderabbit.yaml");
    // knowledge_base block followed by enabled: true
    assert.match(content, /knowledge_base:[\s\S]*?enabled:\s*true/, "knowledge_base.code_guidelines.enabled must be true");
  });

  it("knowledge_base filePatterns includes agent.md", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /filePatterns:[\s\S]*?-\s*["']agent\.md["']/, "filePatterns must include agent.md");
  });

  it("knowledge_base filePatterns includes docs/agent-collaboration-guide.md", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /filePatterns:[\s\S]*?-\s*["']docs\/agent-collaboration-guide\.md["']/, "filePatterns must include docs/agent-collaboration-guide.md");
  });

  it("knowledge_base filePatterns includes docs/contracts/contract-change-rules.md", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /filePatterns:[\s\S]*?-\s*["']docs\/contracts\/contract-change-rules\.md["']/, "filePatterns must include docs/contracts/contract-change-rules.md");
  });

  it("knowledge_base filePatterns includes docs/convention.md", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /filePatterns:[\s\S]*?-\s*["']docs\/convention\.md["']/, "filePatterns must include docs/convention.md");
  });

  it("docs/contracts path instruction mentions public contract and migration plan", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /migration plan/, "docs/contracts instruction must mention migration plan");
  });

  it("infra path instruction mentions Terraform", () => {
    content = content || readFile(".coderabbit.yaml");
    assert.match(content, /Terraform/, "infra path instruction must mention Terraform");
  });
});

// ---------------------------------------------------------------------------
// agent.md
// ---------------------------------------------------------------------------

describe("agent.md", () => {
  let content;

  it("file exists", () => {
    const filePath = path.join(ROOT, "agent.md");
    assert.ok(fs.existsSync(filePath), "agent.md must exist");
    content = fs.readFileSync(filePath, "utf-8");
  });

  it("has section 1: 먼저 읽을 문서", () => {
    content = content || readFile("agent.md");
    assert.match(content, /##\s*1\.\s*먼저 읽을 문서/, "must have section 1");
  });

  it("has section 2: 핵심 원칙", () => {
    content = content || readFile("agent.md");
    assert.match(content, /##\s*2\.\s*핵심 원칙/, "must have section 2");
  });

  it("has section 3: 담당 도메인", () => {
    content = content || readFile("agent.md");
    assert.match(content, /##\s*3\.\s*담당 도메인/, "must have section 3");
  });

  it("has section 4: 작업 위치", () => {
    content = content || readFile("agent.md");
    assert.match(content, /##\s*4\.\s*작업 위치/, "must have section 4");
  });

  it("has section 5: 조심할 공유 영역", () => {
    content = content || readFile("agent.md");
    assert.match(content, /##\s*5\.\s*조심할 공유 영역/, "must have section 5");
  });

  it("has section 6: Git 작업 규칙", () => {
    content = content || readFile("agent.md");
    assert.match(content, /##\s*6\.\s*Git 작업 규칙/, "must have section 6");
  });

  it("has section 7: 작업 전 체크", () => {
    content = content || readFile("agent.md");
    assert.match(content, /##\s*7\.\s*작업 전 체크/, "must have section 7");
  });

  it("lists domain A: Workspace / Dashboard / Canvas", () => {
    content = content || readFile("agent.md");
    assert.match(content, /A:.*Workspace.*Dashboard.*Canvas/, "must list domain A");
  });

  it("lists domain B: Task / GitHub / Progress", () => {
    content = content || readFile("agent.md");
    assert.match(content, /B:.*Task.*GitHub.*Progress/, "must list domain B");
  });

  it("lists domain C: Meeting / Voice / Report", () => {
    content = content || readFile("agent.md");
    assert.match(content, /C:.*Meeting.*Voice.*Report/, "must list domain C");
  });

  it("lists domain D: Code Review Room / PR Analysis", () => {
    content = content || readFile("agent.md");
    assert.match(content, /D:.*Code Review Room.*PR Analysis/, "must list domain D");
  });

  it("lists domain E: Agent Runtime / Orchestrator / Planning", () => {
    content = content || readFile("agent.md");
    assert.match(content, /E:.*Agent Runtime.*Orchestrator.*Planning/, "must list domain E");
  });

  it("references docs/convention.md", () => {
    content = content || readFile("agent.md");
    assert.match(content, /docs\/convention\.md/, "must reference docs/convention.md");
  });

  it("references docs/agent-collaboration-guide.md", () => {
    content = content || readFile("agent.md");
    assert.match(content, /docs\/agent-collaboration-guide\.md/, "must reference docs/agent-collaboration-guide.md");
  });

  it("references docs/contracts/contract-change-rules.md", () => {
    content = content || readFile("agent.md");
    assert.match(content, /docs\/contracts\/contract-change-rules\.md/, "must reference docs/contracts/contract-change-rules.md");
  });

  it("references docs/PILO_5인_분업_상세_명세.md", () => {
    content = content || readFile("agent.md");
    assert.match(content, /docs\/PILO_5인_분업_상세_명세\.md/, "must reference the 5-person division spec");
  });

  it("states PR target is dev", () => {
    content = content || readFile("agent.md");
    assert.match(content, /PR\s*대상은?\s*`dev`/, "PR target must be dev");
  });

  it("states work branch is created from dev", () => {
    content = content || readFile("agent.md");
    assert.match(content, /작업 브랜치는\s*`dev`에서/, "work branch must be from dev");
  });

  it("mentions Terraform for AWS work", () => {
    content = content || readFile("agent.md");
    assert.match(content, /Terraform/, "must mention Terraform for AWS work");
  });

  it("lists .github/workflows as shared sensitive area", () => {
    content = content || readFile("agent.md");
    assert.match(content, /\.github\/workflows/, "must list .github/workflows as shared area");
  });

  it("lists docs/contracts as shared sensitive area", () => {
    content = content || readFile("agent.md");
    assert.match(content, /docs\/contracts/, "must list docs/contracts as shared area");
  });
});

// ---------------------------------------------------------------------------
// docs/convention.md
// ---------------------------------------------------------------------------

describe("docs/convention.md", () => {
  let content;

  it("file exists", () => {
    const filePath = path.join(ROOT, "docs", "convention.md");
    assert.ok(fs.existsSync(filePath), "docs/convention.md must exist");
    content = fs.readFileSync(filePath, "utf-8");
  });

  it("has Issue management section", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /Issue\s*관리\s*전략/, "must have Issue management section");
  });

  it("has Branch creation section", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /Branch\s*생성\s*기준/, "must have Branch section");
  });

  it("has PR section", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /PR\s*\(Pull Request\)\s*기준/, "must have PR section");
  });

  it("has Commit convention section", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /Commit\s*컨벤션/, "must have Commit convention section");
  });

  const commitTypes = ["feat", "fix", "build", "chore", "ci", "docs", "style", "refactor", "test", "perf"];
  for (const type of commitTypes) {
    it(`commit type '${type}' is defined`, () => {
      const c = readFile("docs/convention.md");
      assert.match(c, new RegExp(`\`${type}\``), `commit type '${type}' must be defined`);
    });
  }

  it("branch naming format includes type and issue number", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /<type>.*이슈번호/, "branch naming must include type and issue number");
  });

  it("shows branch naming examples (feat, fix, docs)", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /feat\/\d+-\S+/, "must show feat branch example");
    assert.match(content, /fix\/\d+-\S+/, "must show fix branch example");
    assert.match(content, /docs\/\d+-\S+/, "must show docs branch example");
  });

  it("states PR target branch is dev", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /병합 대상은\s*\*\*`dev`\*\*/, "PR target must be dev");
  });

  it("squash merge is forbidden", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /Squash\s*금지/, "Squash merge must be forbidden");
  });

  it("commit message format includes type and issue number pattern", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /<type>:\s*<변경 내용 요약>.*#이슈번호/, "commit format must include type and issue number");
  });

  it("commit message example with issue number", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /feat:.*\(#\d+\)/, "commit example must show issue number format");
  });

  it("states main branch is not for direct work", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /main.*직접 작업하지 않는다/, "main branch must not be for direct work");
  });

  it("states 1 Branch = 1 PR principle", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /1\s*Branch\s*=\s*1\s*PR/, "must state 1 Branch = 1 PR principle");
  });

  it("states Closes #이슈번호 pattern for PR body", () => {
    content = content || readFile("docs/convention.md");
    assert.match(content, /Closes #이슈번호/, "PR body must use Closes #이슈번호 pattern");
  });
});

// ---------------------------------------------------------------------------
// docs/contracts/contract-change-rules.md
// ---------------------------------------------------------------------------

describe("docs/contracts/contract-change-rules.md", () => {
  let content;

  it("file exists", () => {
    const filePath = path.join(ROOT, "docs", "contracts", "contract-change-rules.md");
    assert.ok(fs.existsSync(filePath), "contract-change-rules.md must exist");
    content = fs.readFileSync(filePath, "utf-8");
  });

  it("has Contract 종류 section", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /##\s*Contract 종류/, "must have Contract types section");
  });

  it("defines Internal contract type", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /Internal contract/, "must define Internal contract type");
  });

  it("defines Public contract type", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /Public contract/, "must define Public contract type");
  });

  it("defines Machine-readable contract type", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /Machine-readable contract/, "must define Machine-readable contract type");
  });

  it("has 기본 원칙 section", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /##\s*기본 원칙/, "must have 기본 원칙 section");
  });

  it("states Public contract must be merged before implementation PR", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /Public contract 변경은 구현 PR보다 먼저/, "Public contract must go before implementation PR");
  });

  it("states breaking changes must use deprecated period", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /Breaking change는 바로 제거하지 않고 deprecated/, "Breaking change must use deprecated period");
  });

  it("has Self-Approve 가능 조건 section", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /##\s*Self-Approve 가능 조건/, "must have Self-Approve 가능 조건 section");
  });

  it("self-approve requires CI to pass", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /CI가 통과했다/, "self-approve must require CI pass");
  });

  it("self-approve requires 'Internal-only change' or 'No external consumer' in PR body", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /Internal-only change.*No external consumer/, "self-approve must require PR body text");
  });

  it("has Self-Approve 금지 조건 section", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /##\s*Self-Approve 금지 조건/, "must have Self-Approve 금지 조건 section");
  });

  it("TaskSummary is in self-approve forbidden list", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /`TaskSummary`/, "TaskSummary must be in forbidden list");
  });

  it("ProgressSummary is in self-approve forbidden list", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /`ProgressSummary`/, "ProgressSummary must be in forbidden list");
  });

  it("MeetingReport is in self-approve forbidden list", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /`MeetingReport`/, "MeetingReport must be in forbidden list");
  });

  it("AgentAction is in self-approve forbidden list", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /`AgentAction`/, "AgentAction must be in forbidden list");
  });

  it("PRAnalysisSummary is in self-approve forbidden list", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /`PRAnalysisSummary`/, "PRAnalysisSummary must be in forbidden list");
  });

  it("PR template has Contract Change section", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /## Contract Change/, "PR template must have Contract Change section");
  });

  it("PR template has Impact section", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /## Impact/, "PR template must have Impact section");
  });

  it("PR template has Breaking Change section", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /## Breaking Change/, "PR template must have Breaking Change section");
  });

  it("PR template has Validation section", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /## Validation/, "PR template must have Validation section");
  });

  it("PR template includes Owner and Consumers fields", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /- Owner:/, "PR template must have Owner field");
    assert.match(content, /- Consumers:/, "PR template must have Consumers field");
  });

  it("권장 흐름 section has 6 steps", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /##\s*권장 흐름/, "must have 권장 흐름 section");
    // Check that steps 1-6 are present
    for (let i = 1; i <= 6; i++) {
      assert.match(content, new RegExp(`${i}\\.`), `step ${i} must be present in 권장 흐름`);
    }
  });

  it("mentions future automation with OpenAPI and JSON Schema", () => {
    content = content || readFile("docs/contracts/contract-change-rules.md");
    assert.match(content, /openapi/, "must mention OpenAPI for future automation");
    assert.match(content, /schema\.json/, "must mention JSON Schema for future automation");
  });
});

// ---------------------------------------------------------------------------
// docs/agent-collaboration-guide.md
// ---------------------------------------------------------------------------

describe("docs/agent-collaboration-guide.md", () => {
  let content;

  it("file exists", () => {
    const filePath = path.join(ROOT, "docs", "agent-collaboration-guide.md");
    assert.ok(fs.existsSync(filePath), "agent-collaboration-guide.md must exist");
    content = fs.readFileSync(filePath, "utf-8");
  });

  it("domain table lists all 5 owners (A through E)", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /\|\s*A\s*\|/, "domain table must list A");
    assert.match(content, /\|\s*B\s*\|/, "domain table must list B");
    assert.match(content, /\|\s*C\s*\|/, "domain table must list C");
    assert.match(content, /\|\s*D\s*\|/, "domain table must list D");
    assert.match(content, /\|\s*E\s*\|/, "domain table must list E");
  });

  it("domain A covers Workspace / Dashboard / Canvas", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /A[\s\S]*?Workspace.*Dashboard.*Canvas/, "domain A must cover Workspace/Dashboard/Canvas");
  });

  it("domain B covers Task / GitHub / Progress", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /B[\s\S]*?Task.*GitHub.*Progress/, "domain B must cover Task/GitHub/Progress");
  });

  it("domain C covers Meeting / Voice / Report", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /C[\s\S]*?Meeting.*Voice.*Report/, "domain C must cover Meeting/Voice/Report");
  });

  it("domain D covers Code Review Room / PR Analysis", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /D[\s\S]*?Code Review Room.*PR Analysis/, "domain D must cover Code Review/PR Analysis");
  });

  it("domain E covers Agent Runtime / Orchestrator / Planning", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /E[\s\S]*?Agent Runtime.*Orchestrator.*Planning/, "domain E must cover Agent Runtime/Orchestrator/Planning");
  });

  it("has 충돌 방지 규칙 section with rules", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /##\s*충돌 방지 규칙/, "must have 충돌 방지 규칙 section");
  });

  it("collision rule: do not directly modify other domain's DB model/service/repository", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /다른 도메인의 DB 모델, service, repository를 직접 수정하지 않는다/, "must state cross-domain modification rule");
  });

  it("collision rule: contract changes go to docs/contracts first", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /계약 변경은 구현보다 먼저 `docs\/contracts\/\*\.md`에 반영한다/, "must state contract-first rule");
  });

  it("shared areas table lists apps/*/package.json", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /apps\/\*\/package\.json/, "shared areas must include apps/*/package.json");
  });

  it("shared areas table lists .github/workflows", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /\.github\/workflows/, "shared areas must include .github/workflows");
  });

  it("CI required checks include frontend", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /- `frontend`/, "CI checks must include frontend");
  });

  it("CI required checks include app-server", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /- `app-server`/, "CI checks must include app-server");
  });

  it("CI required checks include realtime-server", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /- `realtime-server`/, "CI checks must include realtime-server");
  });

  it("CI required checks include ai-worker", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /- `ai-worker`/, "CI checks must include ai-worker");
  });

  it("CI required checks include secrets", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /- `secrets`/, "CI checks must include secrets");
  });

  it("CI required checks include python-audit", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /- `python-audit`/, "CI checks must include python-audit");
  });

  it("CI required checks include terraform", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /- `terraform`/, "CI checks must include terraform");
  });

  it("action contract JSON uses domain.action.target type format", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /domain\.action\.target/, "action contract must use domain.action.target format");
  });

  it("action contract example contains requiresConfirmation field", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /"requiresConfirmation":\s*true/, "action contract must have requiresConfirmation field");
  });

  it("migration naming format is YYYYMMDDHHMM_owner_domain_action", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /YYYYMMDDHHMM_owner_domain_action/, "migration naming must follow the defined format");
  });

  it("has 권장 작업 흐름 section with 8 steps", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /##\s*권장 작업 흐름/, "must have 권장 작업 흐름 section");
    for (let i = 1; i <= 8; i++) {
      assert.match(content, new RegExp(`${i}\\.`), `step ${i} must be present`);
    }
  });

  it("PR target is dev", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /PR 대상 브랜치는 `dev`/, "PR target must be dev");
  });

  it("infra must use Terraform only (no console changes)", () => {
    content = content || readFile("docs/agent-collaboration-guide.md");
    assert.match(content, /Terraform.*콘솔 수동 변경|콘솔 수동 변경.*Terraform/, "must state Terraform-only infra rule");
  });
});

// ---------------------------------------------------------------------------
// docs/PILO_5인_분업_상세_명세.md
// ---------------------------------------------------------------------------

describe("docs/PILO_5인_분업_상세_명세.md", () => {
  let content;

  it("file exists", () => {
    const filePath = path.join(ROOT, "docs", "PILO_5인_분업_상세_명세.md");
    assert.ok(fs.existsSync(filePath), "PILO_5인_분업_상세_명세.md must exist");
    content = fs.readFileSync(filePath, "utf-8");
  });

  it("has 담당자 요약 table", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /##\s*담당자 요약/, "must have 담당자 요약 section");
  });

  it("has section for A 동현", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /#\s*A 동현:/, "must have section for A 동현");
  });

  it("has section for B 주형", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /#\s*B 주형:/, "must have section for B 주형");
  });

  it("has section for C 진호", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /#\s*C 진호:/, "must have section for C 진호");
  });

  it("has section for D 은재", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /#\s*D 은재:/, "must have section for D 은재");
  });

  it("has section for E 세인", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /#\s*E 세인:/, "must have section for E 세인");
  });

  it("each domain section has 담당 목표 subsection", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    const count = (content.match(/##\s*1\.\s*담당 목표/g) || []).length;
    assert.equal(count, 5, "must have 5 '담당 목표' subsections (one per domain)");
  });

  it("each domain section has 주요 기능 subsection", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    const count = (content.match(/##\s*2\.\s*주요 기능/g) || []).length;
    assert.equal(count, 5, "must have 5 '주요 기능' subsections (one per domain)");
  });

  it("each domain section has 소유 데이터 subsection", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    const count = (content.match(/##\s*3\.\s*소유 데이터/g) || []).length;
    assert.equal(count, 5, "must have 5 '소유 데이터' subsections (one per domain)");
  });

  it("each domain section has 다른 담당자와의 연결 subsection", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    const count = (content.match(/##\s*\d+\.\s*다른 담당자와의 연결/g) || []).length;
    assert.equal(count, 5, "must have 5 '다른 담당자와의 연결' subsections");
  });

  it("each domain section has 침범하지 않는 영역 subsection", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    const count = (content.match(/##\s*\d+\.\s*침범하지 않는 영역/g) || []).length;
    assert.equal(count, 5, "must have 5 '침범하지 않는 영역' subsections");
  });

  it("A 동현 owns Workspace, Dashboard, Canvas domains", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /A 동현.*Workspace.*Dashboard.*Canvas/, "A must own Workspace/Dashboard/Canvas");
  });

  it("B 주형 owns Task, GitHub, Progress domains", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /B 주형.*Task.*GitHub.*Progress/, "B must own Task/GitHub/Progress");
  });

  it("C 진호 owns Meeting, Voice, Report domains", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /C 진호.*Meeting.*Voice.*Report/, "C must own Meeting/Voice/Report");
  });

  it("D 은재 owns Code Review Room and PR Analysis", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /D 은재.*Code Review Room.*PR Analysis/, "D must own Code Review Room/PR Analysis");
  });

  it("E 세인 owns Multi-Agent Orchestrator, Agent Runtime, Project Planning", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /E 세인.*Multi-Agent Orchestrator.*Agent Runtime.*Project Planning/, "E must own Orchestrator/Runtime/Planning");
  });

  it("domain principle states domain-based not server-based separation", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /서버 단위가 아니라 도메인 단위로 분리한다/, "must state domain-based separation principle");
  });

  it("has 기능 간 경계 section", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /#\s*기능 간 경계/, "must have 기능 간 경계 section");
  });

  it("has MVP 우선순위 section for all 5 domains", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /#\s*MVP 우선순위/, "must have MVP 우선순위 section");
    assert.match(content, /##\s*A 동현/, "MVP section must have A 동현 subsection");
    assert.match(content, /##\s*B 주형/, "MVP section must have B 주형 subsection");
    assert.match(content, /##\s*C 진호/, "MVP section must have C 진호 subsection");
    assert.match(content, /##\s*D 은재/, "MVP section must have D 은재 subsection");
    assert.match(content, /##\s*E 세인/, "MVP section must have E 세인 subsection");
  });

  it("E provides shared Agent action contract JSON example", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /"requiresConfirmation":\s*true/, "must include agent action contract JSON example");
    assert.match(content, /"type":\s*"task\.create\.draft"/, "contract example must have correct type field");
  });

  it("B section lists GitHub Webhook events", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /Issue opened/, "B section must mention GitHub webhook Issue opened event");
    assert.match(content, /PR opened/, "B section must mention GitHub webhook PR opened event");
  });

  it("C section covers Voice and STT", () => {
    content = content || readFile("docs/PILO_5인_분업_상세_명세.md");
    assert.match(content, /STT/, "C section must mention STT for voice transcription");
  });
});

// ---------------------------------------------------------------------------
// Cross-file consistency checks
// ---------------------------------------------------------------------------

describe("cross-file consistency", () => {
  it("all knowledge_base files referenced in .coderabbit.yaml actually exist", () => {
    const coderabbit = readFile(".coderabbit.yaml");
    const filePatternsMatch = coderabbit.match(/filePatterns:([\s\S]*?)(?=\n\S|\n\n|$)/);
    assert.ok(filePatternsMatch, "filePatterns block must be present");
    const patternBlock = filePatternsMatch[1];
    const patterns = [...patternBlock.matchAll(/-\s*["']([^"']+)["']/g)].map((m) => m[1]);
    assert.ok(patterns.length >= 4, "must have at least 4 filePatterns");
    for (const pattern of patterns) {
      const fullPath = path.join(ROOT, pattern);
      assert.ok(fs.existsSync(fullPath), `file referenced in filePatterns must exist: ${pattern}`);
    }
  });

  it("agent.md references docs that exist in the repository", () => {
    const agentContent = readFile("agent.md");
    const docRefs = [
      "docs/convention.md",
      "docs/agent-collaboration-guide.md",
      "docs/contracts/contract-change-rules.md",
      "docs/PILO_5인_분업_상세_명세.md",
    ];
    for (const docRef of docRefs) {
      const fullPath = path.join(ROOT, docRef);
      assert.ok(fs.existsSync(fullPath), `document referenced in agent.md must exist: ${docRef}`);
      assert.match(agentContent, new RegExp(docRef.replace(/\//g, "\\/").replace(/\./g, "\\.").replace(/\[/g, "\\[").replace(/\]/g, "\\]")), `agent.md must reference ${docRef}`);
    }
  });

  it("domain assignments are consistent between agent.md and agent-collaboration-guide.md", () => {
    const agentMd = readFile("agent.md");
    const guideContent = readFile("docs/agent-collaboration-guide.md");

    // Both should list 5 domains A-E with same broad assignments
    const domains = [
      { id: "A", keyword: "Workspace" },
      { id: "B", keyword: "Task" },
      { id: "C", keyword: "Meeting" },
      { id: "D", keyword: "Code Review" },
      { id: "E", keyword: "Agent" },
    ];

    for (const { id, keyword } of domains) {
      assert.match(agentMd, new RegExp(`${id}:.*${keyword}`), `agent.md domain ${id} must include ${keyword}`);
      assert.match(guideContent, new RegExp(`\\|\\s*${id}\\s*\\|.*${keyword}`), `guide domain ${id} must include ${keyword}`);
    }
  });

  it("convention.md PR target (dev) matches agent.md PR target", () => {
    const convention = readFile("docs/convention.md");
    const agentMd = readFile("agent.md");
    assert.match(convention, /병합 대상은\s*\*\*`dev`\*\*/, "convention.md must state dev as merge target");
    assert.match(agentMd, /PR\s*대상은?\s*`dev`/, "agent.md must state dev as PR target");
  });

  it("PILO_5인_분업_상세_명세.md and agent-collaboration-guide.md share the same 5 domain owners", () => {
    const spec = readFile("docs/PILO_5인_분업_상세_명세.md");
    const guide = readFile("docs/agent-collaboration-guide.md");

    // Check that both docs have the same five owners
    for (const id of ["A", "B", "C", "D", "E"]) {
      assert.match(spec, new RegExp(`\\|\\s*${id}\\s*(동현|주형|진호|은재|세인)?`), `spec must list owner ${id}`);
      assert.match(guide, new RegExp(`\\|\\s*${id}\\s*\\|`), `guide must list domain ${id}`);
    }
  });
});