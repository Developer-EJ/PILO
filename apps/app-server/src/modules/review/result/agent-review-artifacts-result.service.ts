import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ReviewChecklistItemRecord } from "../artifacts/review-artifact.types";
import { ReviewArtifactsService } from "../artifacts/review-artifacts.service";

const QUESTION_PRIORITIES = ["low", "medium", "high", "urgent"];
const RISK_LEVELS = ["low", "medium", "high", "critical"];

export interface ReviewQuestionRecord {
  id: string;
  analysisId: string;
  nodeId: string | null;
  question: string;
  priority: string;
}

export interface ReviewRiskRecord {
  id: string;
  analysisId: string;
  nodeId: string | null;
  title: string;
  description: string;
  riskLevel: string;
  recommendation: string | null;
}

export interface AgentReviewArtifactsResult {
  questions?: Array<{
    id?: string;
    nodeId?: string | null;
    question: string;
    priority?: string;
  }>;
  risks?: Array<{
    id?: string;
    nodeId?: string | null;
    title?: string;
    description?: string;
    reason?: string;
    riskLevel?: string;
    level?: string;
    recommendation?: string | null;
  }>;
  checklist?: Array<{
    type?: string;
    checklistType?: string;
    title: string;
    status?: string;
    sortOrder?: number;
  }>;
}

export interface AppliedReviewArtifacts {
  questions: ReviewQuestionRecord[];
  risks: ReviewRiskRecord[];
  checklist: ReviewChecklistItemRecord[];
}

@Injectable()
export class AgentReviewArtifactsResultService {
  private readonly questionsByKey = new Map<string, ReviewQuestionRecord>();
  private readonly risksByKey = new Map<string, ReviewRiskRecord>();

  constructor(private readonly artifactsService: ReviewArtifactsService) {}

  applyArtifacts(
    analysisId: string,
    result: AgentReviewArtifactsResult,
  ): AppliedReviewArtifacts {
    for (const question of result.questions ?? []) {
      const key = this.questionKey(analysisId, question.question);
      const existing = this.questionsByKey.get(key);
      this.questionsByKey.set(key, {
        id: existing?.id ?? question.id ?? randomUUID(),
        analysisId,
        nodeId: question.nodeId ?? null,
        question: this.requiredString(question.question, "question"),
        priority: this.toPriority(question.priority ?? "medium"),
      });
    }

    for (const risk of result.risks ?? []) {
      const title = this.requiredString(
        risk.title ?? risk.reason,
        "risk.title",
      );
      const key = this.riskKey(analysisId, title);
      const existing = this.risksByKey.get(key);
      this.risksByKey.set(key, {
        id: existing?.id ?? risk.id ?? randomUUID(),
        analysisId,
        nodeId: risk.nodeId ?? null,
        title,
        description: this.requiredString(
          risk.description ?? risk.reason,
          "risk.description",
        ),
        riskLevel: this.toRiskLevel(risk.riskLevel ?? risk.level ?? "medium"),
        recommendation: risk.recommendation ?? null,
      });
    }

    for (const [index, item] of (result.checklist ?? []).entries()) {
      this.artifactsService.createChecklistItem(analysisId, {
        checklistType: item.checklistType ?? item.type ?? "review",
        title: item.title,
        status: item.status ?? "todo",
        sortOrder: item.sortOrder ?? index,
      });
    }

    return {
      questions: this.listQuestions(analysisId),
      risks: this.listRisks(analysisId),
      checklist: this.artifactsService.listChecklistItems(analysisId),
    };
  }

  private listQuestions(analysisId: string): ReviewQuestionRecord[] {
    return [...this.questionsByKey.values()].filter(
      (question) => question.analysisId === analysisId,
    );
  }

  private listRisks(analysisId: string): ReviewRiskRecord[] {
    return [...this.risksByKey.values()].filter(
      (risk) => risk.analysisId === analysisId,
    );
  }

  private toPriority(value: string): string {
    if (QUESTION_PRIORITIES.includes(value)) {
      return value;
    }

    throw new BadRequestException(`Invalid review question priority: ${value}`);
  }

  private toRiskLevel(value: string): string {
    if (RISK_LEVELS.includes(value)) {
      return value;
    }

    throw new BadRequestException(`Invalid review risk level: ${value}`);
  }

  private requiredString(
    value: string | null | undefined,
    field: string,
  ): string {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    throw new BadRequestException(`${field} is required`);
  }

  private questionKey(analysisId: string, question: string): string {
    return `${analysisId}:${question}`;
  }

  private riskKey(analysisId: string, title: string): string {
    return `${analysisId}:${title}`;
  }
}
