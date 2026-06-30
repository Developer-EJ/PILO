export interface DailyBriefingSection {
  headline: string;
  summary: string;
  recommendedActions: string[];
}

export interface DailyProjectBriefing extends DailyBriefingSection {
  highlights: string[];
  risks: string[];
}

export interface DailyPersonalBriefing extends DailyBriefingSection {
  myTasks: string[];
  needsAttention: string[];
}

export interface DailyBriefingSources {
  dashboard: boolean;
  tasks: boolean;
  progress: boolean;
  meetings: boolean;
  reviews: boolean;
}

export interface DailyBriefingSourceDetails {
  dashboard: "fixture" | "empty" | "dashboard_read_model";
  tasks: "dashboard_read_model" | "empty";
  progress: "dashboard_read_model" | "empty";
  meetings: "dashboard_read_model" | "empty";
  reviews: "dashboard_read_model" | "empty";
  github: "fixture_deferred" | "deferred" | "empty";
  personalization: "current_member" | "workspace_fallback";
}

export interface DailyBriefingResponse {
  workspaceId: string;
  generatedAt: string;
  usedModel: string | null;
  fallback: boolean;
  projectBriefing: DailyProjectBriefing;
  personalBriefing: DailyPersonalBriefing;
  sources: DailyBriefingSources;
  sourceDetails: DailyBriefingSourceDetails;
  warnings: string[];
}

export interface DailyBriefingGenerateInput {
  workspaceId: string;
  currentUser: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
  regenerate?: boolean;
}
