import { Injectable, Logger } from "@nestjs/common";
import { WorkspaceService } from "../workspace/workspace.service";
import type { WorkspaceDashboardReadModel } from "../workspace/workspace.types";
import type {
  DailyBriefingGenerateInput,
  DailyBriefingResponse,
  DailyBriefingSourceDetails,
  DailyBriefingSources,
  DailyPersonalBriefing,
  DailyProjectBriefing,
} from "./daily-briefing.types";

const DEFAULT_DAILY_BRIEFING_MODEL = "gpt-4.1-mini";

type BriefingItem = Record<string, unknown>;

type DailyBriefingContext = {
  dashboard: WorkspaceDashboardReadModel;
  sources: DailyBriefingSources;
  sourceDetails: DailyBriefingSourceDetails;
  warnings: string[];
  tasks: BriefingItem[];
  myTasks: BriefingItem[];
  blockedTasks: BriefingItem[];
  delayedTasks: BriefingItem[];
  urgentTasks: BriefingItem[];
  meetingReports: BriefingItem[];
  pullRequests: BriefingItem[];
  reviewAnalyses: BriefingItem[];
};

@Injectable()
export class DailyBriefingService {
  private readonly logger = new Logger(DailyBriefingService.name);

  constructor(private readonly workspaceService: WorkspaceService) {}

  async getDailyBriefing(
    input: DailyBriefingGenerateInput,
  ): Promise<DailyBriefingResponse> {
    return this.generateDailyBriefing(input);
  }

  async regenerateDailyBriefing(
    input: DailyBriefingGenerateInput,
  ): Promise<DailyBriefingResponse> {
    return this.generateDailyBriefing({ ...input, regenerate: true });
  }

  private async generateDailyBriefing(
    input: DailyBriefingGenerateInput,
  ): Promise<DailyBriefingResponse> {
    const dashboard = await this.workspaceService.getWorkspaceDashboard({
      workspaceId: input.workspaceId,
      currentUser: input.currentUser,
    });
    const context = buildBriefingContext(dashboard);
    const fallback = buildFallbackBriefing(input.workspaceId, context);
    const openAiBriefing = await this.tryGenerateWithOpenAI(context, fallback);

    if (openAiBriefing) {
      return openAiBriefing;
    }

    return fallback;
  }

  private async tryGenerateWithOpenAI(
    context: DailyBriefingContext,
    fallback: DailyBriefingResponse,
  ): Promise<DailyBriefingResponse | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        "Daily briefing fallback used: OPENAI_API_KEY is not configured.",
      );
      return null;
    }

    const model =
      process.env.PILO_DAILY_BRIEFING_MODEL ??
      process.env.OPENAI_MODEL ??
      DEFAULT_DAILY_BRIEFING_MODEL;

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "system",
              content:
                "You create concise Korean daily briefings for PILO. Return one raw JSON object only. Do not wrap it in Markdown or code fences. Do not claim personal review ownership unless current member scoped data exists. Mark GitHub/PR signals as workspace-level or deferred when the source says so.",
            },
            {
              role: "user",
              content: JSON.stringify({
                requiredShape: {
                  projectBriefing: {
                    headline: "string",
                    summary: "string",
                    highlights: ["string"],
                    risks: ["string"],
                    recommendedActions: ["string"],
                  },
                  personalBriefing: {
                    headline: "string",
                    summary: "string",
                    myTasks: ["string"],
                    needsAttention: ["string"],
                    recommendedActions: ["string"],
                  },
                },
                sourceDetails: context.sourceDetails,
                warnings: context.warnings,
                dashboard: compactDashboardForPrompt(context),
                fallback,
                responseRules: [
                  "Return JSON only.",
                  "The first character must be { and the last character must be }.",
                  "Do not include markdown fences such as ```json.",
                ],
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        this.logger.warn(
          `Daily briefing OpenAI request failed: status=${response.status}`,
        );
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const rawText = extractOpenAIText(payload);
      if (!rawText) {
        this.logger.warn("Daily briefing OpenAI response had no output text.");
        return null;
      }

      const parsed = parseOpenAIJson(rawText);
      if (!parsed) {
        this.logger.warn(
          "Daily briefing OpenAI response could not be parsed as JSON.",
        );
        return null;
      }

      return {
        ...fallback,
        generatedAt: new Date().toISOString(),
        usedModel: model,
        fallback: false,
        projectBriefing: sanitizeProjectBriefing(
          parsed.projectBriefing,
          fallback.projectBriefing,
        ),
        personalBriefing: sanitizePersonalBriefing(
          parsed.personalBriefing,
          fallback.personalBriefing,
        ),
      };
    } catch (error) {
      this.logger.warn(
        `Daily briefing OpenAI generation failed: ${safeErrorMessage(error)}`,
      );
      return null;
    }
  }
}

function buildBriefingContext(
  dashboard: WorkspaceDashboardReadModel,
): DailyBriefingContext {
  const tasks = readArray(dashboard.tasks);
  const currentMemberId = readString(dashboard.currentMember.memberId);
  const myTasks = currentMemberId
    ? tasks.filter(
        (task) =>
          readNestedString(task, ["assignee", "memberId"]) === currentMemberId,
      )
    : [];
  const blockedTasks = tasks.filter(
    (task) => readString(task.status) === "blocked",
  );
  const delayedTasks = tasks.filter((task) => readBoolean(task.isDelayed));
  const urgentTasks = tasks.filter((task) =>
    ["urgent", "high"].includes(readString(task.priority) ?? ""),
  );
  const meetingReports = readArray(dashboard.meetingReports);
  const pullRequests = readArray(dashboard.pullRequests);
  const reviewAnalyses = readArray(dashboard.prAnalyses);
  const hasProgress = Boolean(dashboard.progress);

  return {
    dashboard,
    sources: {
      dashboard: true,
      tasks: true,
      progress: true,
      meetings: true,
      reviews: true,
    },
    sourceDetails: {
      dashboard: dashboard.source === "fixture" ? "fixture" : "empty",
      tasks: tasks.length > 0 ? "dashboard_read_model" : "empty",
      progress: hasProgress ? "dashboard_read_model" : "empty",
      meetings: meetingReports.length > 0 ? "dashboard_read_model" : "empty",
      reviews:
        pullRequests.length > 0 || reviewAnalyses.length > 0
          ? "dashboard_read_model"
          : "empty",
      github:
        dashboard.githubIssues.length > 0 || dashboard.pullRequests.length > 0
          ? "fixture_deferred"
          : "deferred",
      personalization: currentMemberId
        ? "current_member"
        : "workspace_fallback",
    },
    warnings: [
      "GitHub PR/Issue signals are workspace-level fixture/deferred read models in this MVP.",
      "Personal review ownership is not asserted without member-scoped review contracts.",
      "Meeting action ownership should be phrased as suggested follow-up when only assigneeSuggestionMemberId exists.",
    ],
    tasks,
    myTasks,
    blockedTasks,
    delayedTasks,
    urgentTasks,
    meetingReports,
    pullRequests,
    reviewAnalyses,
  };
}

function buildFallbackBriefing(
  workspaceId: string,
  context: DailyBriefingContext,
): DailyBriefingResponse {
  const workspaceName = context.dashboard.workspace.name;
  const progressRate = readNumber(context.dashboard.progress?.progressRate);
  const progressSummary =
    progressRate === null
      ? "진행률 데이터가 아직 충분하지 않습니다."
      : `전체 진행률은 ${progressRate}%입니다.`;
  const topTasks = context.tasks.slice(0, 3).map(taskTitle);
  const riskItems = [
    ...context.blockedTasks.map((task) => `막힘: ${taskTitle(task)}`),
    ...context.delayedTasks.map((task) => `지연 가능성: ${taskTitle(task)}`),
    ...context.reviewAnalyses
      .filter((analysis) => {
        const riskLevel = readString(analysis.riskLevel);
        return riskLevel === "high" || riskLevel === "critical";
      })
      .map(
        (analysis) =>
          `리뷰 위험: ${
            readString(analysis.conclusion) ??
            readString(analysis.purposeSummary) ??
            "확인 필요"
          }`,
      ),
  ].slice(0, 5);
  const meetingHighlights = context.meetingReports
    .slice(0, 2)
    .map(
      (report) =>
        readString(report.summary) ??
        readString(report.title) ??
        "최근 회의 리포트 확인이 필요합니다.",
    );

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    usedModel: null,
    fallback: true,
    projectBriefing: {
      headline: `${workspaceName} 오늘의 프로젝트 브리핑`,
      summary: `${progressSummary} 주요 작업, 회의 리포트, 리뷰 신호를 워크스페이스 기준으로 묶어 확인하세요.`,
      highlights: [
        ...topTasks.map((title) => `주요 작업: ${title}`),
        ...meetingHighlights.map((summary) => `회의 요약: ${summary}`),
      ].slice(0, 5),
      risks:
        riskItems.length > 0
          ? riskItems
          : [
              "현재 읽기 모델 기준으로 뚜렷한 막힘이나 지연 항목은 확인되지 않았습니다.",
            ],
      recommendedActions: [
        "막힘 또는 높은 우선순위 작업을 먼저 확인하세요.",
        "워크스페이스 기준 리뷰 요청 PR과 분석 리스크를 확인하세요.",
        "최근 회의 리포트의 후속 작업을 Task 후보와 연결할지 검토하세요.",
      ],
    },
    personalBriefing: {
      headline: "나의 오늘 확인 항목",
      summary:
        context.myTasks.length > 0
          ? "현재 멤버와 연결된 작업 후보를 기준으로 정리했습니다."
          : "내 담당 작업이 확정되지 않아 워크스페이스 우선순위 기준으로 정리했습니다.",
      myTasks:
        context.myTasks.length > 0
          ? context.myTasks.slice(0, 5).map(taskTitle)
          : context.urgentTasks.slice(0, 5).map(taskTitle),
      needsAttention: [
        ...context.blockedTasks.map(
          (task) => `막힌 작업 확인: ${taskTitle(task)}`,
        ),
        ...context.pullRequests
          .filter((pr) => readString(pr.state) === "review_requested")
          .map(
            (pr) =>
              `워크스페이스 기준 리뷰 확인: ${
                readString(pr.title) ?? "PR 확인 필요"
              }`,
          ),
      ].slice(0, 5),
      recommendedActions: [
        "내 담당으로 보이는 작업이 없으면 높은 우선순위 작업부터 확인하세요.",
        "리뷰는 개인 지정이 아니라 워크스페이스 기준 확인 항목으로 다루세요.",
        "회의 후속 작업은 담당 후보 여부를 확인한 뒤 실행 Task로 연결하세요.",
      ],
    },
    sources: context.sources,
    sourceDetails: context.sourceDetails,
    warnings: context.warnings,
  };
}

function compactDashboardForPrompt(context: DailyBriefingContext) {
  return {
    workspace: context.dashboard.workspace,
    currentMember: context.dashboard.currentMember,
    progress: context.dashboard.progress,
    tasks: context.tasks.slice(0, 12).map((task) => ({
      title: readString(task.title),
      status: readString(task.status),
      priority: readString(task.priority),
      assigneeMemberId: readNestedString(task, ["assignee", "memberId"]),
      dueDate: readString(task.dueDate),
      isDelayed: readBoolean(task.isDelayed),
    })),
    meetingReports: context.meetingReports.slice(0, 6).map((report) => ({
      title: readString(report.title),
      summary: readString(report.summary),
      decisionCount: readNumber(report.decisionCount),
      actionItemCount: readNumber(report.actionItemCount),
      riskCount: readNumber(report.riskCount),
    })),
    pullRequests: context.pullRequests.slice(0, 8).map((pr) => ({
      title: readString(pr.title),
      state: readString(pr.state),
      changedFilesCount: readNumber(pr.changedFilesCount),
      linkedTaskIds: readArray(pr.linkedTaskIds),
    })),
    prAnalyses: context.reviewAnalyses.slice(0, 8).map((analysis) => ({
      purposeSummary: readString(analysis.purposeSummary),
      impactSummary: readString(analysis.impactSummary),
      riskLevel: readString(analysis.riskLevel),
      analysisStatus: readString(analysis.analysisStatus),
      riskCount: readNumber(analysis.riskCount),
      conclusion: readString(analysis.conclusion),
    })),
  };
}

function sanitizeProjectBriefing(
  value: unknown,
  fallback: DailyProjectBriefing,
): DailyProjectBriefing {
  const record = isRecord(value) ? value : {};
  return {
    headline: readString(record.headline) ?? fallback.headline,
    summary: readString(record.summary) ?? fallback.summary,
    highlights: readStringArray(record.highlights, fallback.highlights),
    risks: readStringArray(record.risks, fallback.risks),
    recommendedActions: readStringArray(
      record.recommendedActions,
      fallback.recommendedActions,
    ),
  };
}

function sanitizePersonalBriefing(
  value: unknown,
  fallback: DailyPersonalBriefing,
): DailyPersonalBriefing {
  const record = isRecord(value) ? value : {};
  return {
    headline: readString(record.headline) ?? fallback.headline,
    summary: readString(record.summary) ?? fallback.summary,
    myTasks: readStringArray(record.myTasks, fallback.myTasks),
    needsAttention: readStringArray(
      record.needsAttention,
      fallback.needsAttention,
    ),
    recommendedActions: readStringArray(
      record.recommendedActions,
      fallback.recommendedActions,
    ),
  };
}

function extractOpenAIText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const contentItem of content) {
      if (
        isRecord(contentItem) &&
        typeof contentItem.text === "string" &&
        contentItem.text.trim()
      ) {
        return contentItem.text.trim();
      }
    }
  }

  return null;
}

function parseOpenAIJson(rawText: string): Partial<DailyBriefingResponse> | null {
  const jsonText = extractJsonObjectText(rawText);
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText) as Partial<DailyBriefingResponse>;
  } catch {
    return null;
  }
}

function extractJsonObjectText(rawText: string): string | null {
  const text = rawText.trim();
  if (!text) return null;

  const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fencedMatch?.[1] ?? text).trim();
  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    return candidate;
  }

  const objectStart = candidate.indexOf("{");
  const objectEnd = candidate.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return candidate.slice(objectStart, objectEnd + 1);
  }

  return null;
}

function taskTitle(task: BriefingItem) {
  return readString(task.title) ?? "제목 없는 작업";
}

function readStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 8);
  return items.length > 0 ? items : fallback;
}

function readArray(value: unknown): BriefingItem[] {
  return Array.isArray(value)
    ? value.filter((item): item is BriefingItem => isRecord(item))
    : [];
}

function readNestedString(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return readString(current);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown_error";
}
