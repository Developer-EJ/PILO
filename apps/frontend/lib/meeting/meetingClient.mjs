import { buildPiloApiUrl, defaultAppServerUrl } from "../api/apiUrl.mjs";

export class MeetingApiError extends Error {
  constructor(message, { status, path, details } = {}) {
    super(message);
    this.name = "MeetingApiError";
    this.status = status;
    this.path = path;
    this.details = details;
  }
}

function defaultMeetingApiBaseUrl() {
  return defaultAppServerUrl();
}

function encodePathValue(value) {
  return encodeURIComponent(value);
}

async function readJson(response, path) {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    throw new MeetingApiError("Meeting API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

function resolveErrorMessage(fallback, payload) {
  if (payload?.error?.message) {
    return payload.error.message;
  }

  if (payload?.message) {
    return Array.isArray(payload.message)
      ? payload.message.join(", ")
      : String(payload.message);
  }

  return fallback;
}

export function createMeetingClient({
  baseUrl = defaultMeetingApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  async function request(path, { method = "GET", body } = {}) {
    const response = await fetcher(buildPiloApiUrl(path, baseUrl), {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await readJson(response, path);

    if (!response.ok) {
      throw new MeetingApiError(
        resolveErrorMessage("Meeting API request failed", payload),
        {
          status: response.status,
          path,
          details: payload,
        },
      );
    }

    return payload;
  }

  return {
    listMeetings(workspaceId) {
      return request(`/api/workspaces/${encodePathValue(workspaceId)}/meetings`);
    },
    createMeeting(workspaceId, input) {
      return request(`/api/workspaces/${encodePathValue(workspaceId)}/meetings`, {
        method: "POST",
        body: input,
      });
    },
    getMeeting(meetingId) {
      return request(`/api/meetings/${encodePathValue(meetingId)}`);
    },
    updateMeetingStatus(meetingId, status) {
      return request(`/api/meetings/${encodePathValue(meetingId)}/status`, {
        method: "PATCH",
        body: { status },
      });
    },
    listParticipants(meetingId) {
      return request(`/api/meetings/${encodePathValue(meetingId)}/participants`);
    },
    addParticipant(meetingId, input) {
      return request(`/api/meetings/${encodePathValue(meetingId)}/participants`, {
        method: "POST",
        body: input,
      });
    },
    leaveParticipant(meetingId, participantId) {
      return request(
        `/api/meetings/${encodePathValue(meetingId)}/participants/${encodePathValue(participantId)}/leave`,
        { method: "PATCH" },
      );
    },
    listAgendas(meetingId) {
      return request(`/api/meetings/${encodePathValue(meetingId)}/agendas`);
    },
    createAgenda(meetingId, input) {
      return request(`/api/meetings/${encodePathValue(meetingId)}/agendas`, {
        method: "POST",
        body: input,
      });
    },
    updateAgendaStatus(meetingId, agendaId, status) {
      return request(
        `/api/meetings/${encodePathValue(meetingId)}/agendas/${encodePathValue(agendaId)}/status`,
        {
          method: "PATCH",
          body: { status },
        },
      );
    },
    reorderAgenda(meetingId, agendaId, sortOrder) {
      return request(
        `/api/meetings/${encodePathValue(meetingId)}/agendas/${encodePathValue(agendaId)}/sort-order`,
        {
          method: "PATCH",
          body: { sortOrder },
        },
      );
    },
    listMemos(meetingId) {
      return request(`/api/meetings/${encodePathValue(meetingId)}/memos`);
    },
    createMemo(meetingId, input) {
      return request(`/api/meetings/${encodePathValue(meetingId)}/memos`, {
        method: "POST",
        body: input,
      });
    },
    listTranscriptSegments(meetingId) {
      return request(
        `/api/meetings/${encodePathValue(meetingId)}/transcript-segments`,
      );
    },
    createTranscriptSegment(meetingId, input) {
      return request(
        `/api/meetings/${encodePathValue(meetingId)}/transcript-segments`,
        {
          method: "POST",
          body: input,
        },
      );
    },
    requestReportGeneration(meetingId) {
      return request(
        `/api/meetings/${encodePathValue(meetingId)}/report-generation`,
        { method: "POST" },
      );
    },
    getReport(reportId) {
      return request(`/api/meeting-reports/${encodePathValue(reportId)}`);
    },
    listRecentReports(workspaceId) {
      return request(
        `/api/workspaces/${encodePathValue(workspaceId)}/meeting-reports/recent`,
      );
    },
    listWorkspaceActionItems(workspaceId) {
      return request(
        `/api/workspaces/${encodePathValue(workspaceId)}/meeting-action-items`,
      );
    },
    createDecision(reportId, input) {
      return request(
        `/api/meeting-reports/${encodePathValue(reportId)}/decisions`,
        {
          method: "POST",
          body: input,
        },
      );
    },
    listDecisions(reportId) {
      return request(
        `/api/meeting-reports/${encodePathValue(reportId)}/decisions`,
      );
    },
    createRisk(reportId, input) {
      return request(`/api/meeting-reports/${encodePathValue(reportId)}/risks`, {
        method: "POST",
        body: input,
      });
    },
    listRisks(reportId) {
      return request(`/api/meeting-reports/${encodePathValue(reportId)}/risks`);
    },
    createNextAgenda(reportId, input) {
      return request(
        `/api/meeting-reports/${encodePathValue(reportId)}/next-agendas`,
        {
          method: "POST",
          body: input,
        },
      );
    },
    listNextAgendas(reportId) {
      return request(
        `/api/meeting-reports/${encodePathValue(reportId)}/next-agendas`,
      );
    },
    createActionItem(reportId, input) {
      return request(
        `/api/meeting-reports/${encodePathValue(reportId)}/action-items`,
        {
          method: "POST",
          body: input,
        },
      );
    },
    listActionItems(reportId) {
      return request(
        `/api/meeting-reports/${encodePathValue(reportId)}/action-items`,
      );
    },
    approveActionItem(actionItemId) {
      return request(
        `/api/meeting-action-items/${encodePathValue(actionItemId)}/approve`,
        { method: "PATCH" },
      );
    },
    rejectActionItem(actionItemId) {
      return request(
        `/api/meeting-action-items/${encodePathValue(actionItemId)}/reject`,
        { method: "PATCH" },
      );
    },
    requestActionItemTaskDraft(actionItemId) {
      return request(
        `/api/meeting-action-items/${encodePathValue(actionItemId)}/task-draft`,
        { method: "POST" },
      );
    },
    createVoiceRoom(workspaceId, meetingId) {
      return request(
        `/api/workspaces/${encodePathValue(workspaceId)}/meetings/${encodePathValue(meetingId)}/voice-room`,
        { method: "POST" },
      );
    },
    getVoiceRoomForMeeting(workspaceId, meetingId) {
      return request(
        `/api/workspaces/${encodePathValue(workspaceId)}/meetings/${encodePathValue(meetingId)}/voice-room`,
      );
    },
    updateVoiceRoomStatus(voiceRoomId, status) {
      return request(`/api/voice-rooms/${encodePathValue(voiceRoomId)}/status`, {
        method: "PATCH",
        body: { status },
      });
    },
    joinVoiceSession(voiceRoomId) {
      return request(`/api/voice-rooms/${encodePathValue(voiceRoomId)}/sessions`, {
        method: "POST",
      });
    },
    listVoiceSessions(voiceRoomId) {
      return request(`/api/voice-rooms/${encodePathValue(voiceRoomId)}/sessions`);
    },
    leaveVoiceSession(voiceSessionId) {
      return request(
        `/api/voice-sessions/${encodePathValue(voiceSessionId)}/leave`,
        { method: "PATCH" },
      );
    },
    updateVoiceSessionRecordingStatus(voiceSessionId, recordingStatus) {
      return request(
        `/api/voice-sessions/${encodePathValue(voiceSessionId)}/recording-status`,
        {
          method: "PATCH",
          body: { recordingStatus },
        },
      );
    },
  };
}
