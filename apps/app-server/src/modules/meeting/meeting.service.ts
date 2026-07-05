import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/api-error";
import { WorkspaceService } from "../workspace/workspace.service";

export type PendingMeetingPayload = never;

interface MeetingReportListQuery {
  status?: string;
  limit?: string;
}

@Injectable()
export class MeetingService {
  constructor(private readonly workspaceService: WorkspaceService) {}

  getModuleInfo() {
    return {
      domain: "meeting",
      apiContract: "docs/api/meeting-api.md"
    };
  }

  async getCurrentMeeting(
    currentUserId: string,
    workspaceId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint("GET /workspaces/{workspaceId}/meetings/current");
  }

  async startMeeting(
    currentUserId: string,
    workspaceId: string,
    _body: unknown
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint("POST /workspaces/{workspaceId}/meetings");
  }

  async joinMeeting(
    currentUserId: string,
    workspaceId: string,
    _meetingId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint(
      "POST /workspaces/{workspaceId}/meetings/{meetingId}/participants/me"
    );
  }

  async getMeeting(
    currentUserId: string,
    workspaceId: string,
    _meetingId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint("GET /workspaces/{workspaceId}/meetings/{meetingId}");
  }

  async leaveMeeting(
    currentUserId: string,
    workspaceId: string,
    _meetingId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint(
      "DELETE /workspaces/{workspaceId}/meetings/{meetingId}/participants/me"
    );
  }

  async endMeeting(
    currentUserId: string,
    workspaceId: string,
    _meetingId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint(
      "POST /workspaces/{workspaceId}/meetings/{meetingId}/end"
    );
  }

  async getRecording(
    currentUserId: string,
    workspaceId: string,
    _meetingId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint(
      "GET /workspaces/{workspaceId}/meetings/{meetingId}/recording"
    );
  }

  async listParticipants(
    currentUserId: string,
    workspaceId: string,
    _meetingId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint(
      "GET /workspaces/{workspaceId}/meetings/{meetingId}/participants"
    );
  }

  async listReports(
    currentUserId: string,
    workspaceId: string,
    _query: MeetingReportListQuery
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint("GET /workspaces/{workspaceId}/meeting-reports");
  }

  async getReport(
    currentUserId: string,
    workspaceId: string,
    _reportId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint(
      "GET /workspaces/{workspaceId}/meeting-reports/{reportId}"
    );
  }

  async getMeetingReport(
    currentUserId: string,
    workspaceId: string,
    _meetingId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint(
      "GET /workspaces/{workspaceId}/meetings/{meetingId}/report"
    );
  }

  async requestReportRegeneration(
    currentUserId: string,
    workspaceId: string,
    _reportId: string
  ): Promise<PendingMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    return this.pendingEndpoint(
      "POST /workspaces/{workspaceId}/meeting-reports/{reportId}/regeneration-jobs"
    );
  }

  private async assertWorkspaceAccess(
    currentUserId: string,
    workspaceId: string
  ): Promise<void> {
    await this.workspaceService.assertWorkspaceAccess(currentUserId, workspaceId);
  }

  private pendingEndpoint(endpoint: string): PendingMeetingPayload {
    throw badRequest(`${endpoint} is not implemented yet`);
  }
}
