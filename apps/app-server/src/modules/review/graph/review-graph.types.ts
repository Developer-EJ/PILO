import type { ReviewRiskLevel } from "../public";

export type ReviewNodeType =
  | "file"
  | "function"
  | "api"
  | "route"
  | "schema"
  | "config"
  | "risk"
  | "impact";
export type ReviewNodeStatus = "ok" | "discuss" | "unknown";

export interface ReviewGraphRecord {
  id: string;
  analysisId: string;
  summary: string | null;
  reviewOrder: string[];
}

export interface ReviewNodeRecord {
  id: string;
  graphId: string;
  nodeType: ReviewNodeType;
  label: string;
  filePath: string | null;
  functionName: string | null;
  riskLevel: ReviewRiskLevel;
}

export interface NodeReviewStateRecord {
  id: string;
  nodeId: string;
  reviewerMemberId: string;
  status: ReviewNodeStatus;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewNodeSummary {
  id: string;
  analysisId: string;
  nodeType: ReviewNodeType;
  label: string;
  filePath: string | null;
  functionName: string | null;
  riskLevel: ReviewRiskLevel;
  status: ReviewNodeStatus;
}

export interface ReviewGraphSummary {
  id: string;
  analysisId: string;
  summary: string | null;
  reviewOrder: string[];
  nodes: ReviewNodeSummary[];
}

export interface UpsertNodeReviewStateInput {
  reviewerMemberId: string;
  status: string;
  comment?: string | null;
  changedAt?: string;
}
