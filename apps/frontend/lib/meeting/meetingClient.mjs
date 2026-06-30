import {
  defaultWorkspaceApiBaseUrl,
  WorkspaceApiError,
} from "../workspace/workspaceClient.mjs";
import { workspaceDashboardFixture } from "../workspace/workspaceDashboardFixture.mjs";

const DEFAULT_MEETING_MODE = "mock";

let mockIdCounter = 1;
const mockWorkspaceStates = new Map();

function defaultMeetingMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_MEETING_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_MEETING_MODE
  );
}

export function resolveMeetingClientMode(mode = defaultMeetingMode()) {
  return mode === "api" ? "api" : "mock";
}

export class MeetingApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "MeetingApiError";
  }
}

export function buildMeetingApiUrl(
  path,
  baseUrl = defaultWorkspaceApiBaseUrl(),
) {
  if (!path.startsWith("/api/")) {
    throw new MeetingApiError("Meeting API path must start with /api/", {
      path,
    });
  }

  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function encodeId(value) {
  return encodeURIComponent(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function createMockId(prefix) {
  mockIdCounter += 1;

  return `mock-${prefix}-${mockIdCounter}`;
}

async function readMeetingJson(response, path) {
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

async function requestMeetingJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildMeetingApiUrl(path, baseUrl), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new MeetingApiError("Meeting API request failed", {
      status: response.status,
      path,
    });
  }

  return readMeetingJson(response, path);
}

function withJsonBody(body, init = {}) {
  return {
    ...init,
    body: JSON.stringify(body),
  };
}

function createSeedState(workspaceId) {
  const fixtureReport = {
    ...workspaceDashboardFixture.meetingReports[0],
    workspaceId,
  };
  const fixtureActionItem = workspaceDashboardFixture.meetingActionItems[0];
  const createdAt = fixtureReport.createdAt;

  const reportedMeeting = {
    id: fixtureReport.meetingId,
    workspaceId,
    canvasBoardId: null,
    title: fixtureReport.title,
    purpose: "Align MVP contract priority across domains.",
    status: "report_generated",
    startedAt: "2026-06-27T08:00:00.000Z",
    endedAt: "2026-06-27T08:28:00.000Z",
    createdByMemberId: workspaceDashboardFixture.members[0].memberId,
    createdAt,
    updatedAt: "2026-06-27T08:31:00.000Z",
  };
  const liveMeeting = {
    id: "77777777-7777-4777-8777-777777777702",
    workspaceId,
    canvasBoardId: null,
    title: "Voice capture dry run",
    purpose: "Capture transcript snippets before report generation.",
    status: "in_progress",
    startedAt: "2026-06-28T09:00:00.000Z",
    endedAt: null,
    createdByMemberId: workspaceDashboardFixture.members[0].memberId,
    createdAt: "2026-06-28T08:55:00.000Z",
    updatedAt: "2026-06-28T09:05:00.000Z",
  };

  const report = {
    id: fixtureReport.id,
    meetingId: fixtureReport.meetingId,
    workspaceId,
    title: fixtureReport.title,
    summary: fixtureReport.summary,
    createdAt,
    decisions: [
      {
        id: "77777777-7777-4777-8777-777777777781",
        reportId: fixtureReport.id,
        title: "Keep action items as Task drafts first",
        content: "Keep action items as Task drafts first.",
        status: "decided",
        linkedTaskId: null,
        createdAt,
      },
      {
        id: "77777777-7777-4777-8777-777777777782",
        reportId: fixtureReport.id,
        title: "Use fixture fallback while integrations settle",
        content: "Use fixture fallback while integrations settle.",
        status: "decided",
        linkedTaskId: null,
        createdAt,
      },
    ],
    risks: [
      {
        id: "77777777-7777-4777-8777-777777777783",
        reportId: fixtureReport.id,
        content: "Task draft API timing can affect conversion.",
        severity: "medium",
        sortOrder: 0,
        createdAt,
      },
    ],
    nextAgendas: [
      {
        id: "77777777-7777-4777-8777-777777777784",
        reportId: fixtureReport.id,
        title: "Confirm TaskCreateDraft handoff in the next sync",
        sortOrder: 0,
        createdAt,
      },
    ],
  };

  return {
    meetings: [liveMeeting, reportedMeeting],
    agendas: {
      [reportedMeeting.id]: [
        {
          id: "77777777-7777-4777-8777-777777777791",
          meetingId: reportedMeeting.id,
          title: "Contract priority",
          status: "done",
          sortOrder: 0,
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: "77777777-7777-4777-8777-777777777792",
          meetingId: reportedMeeting.id,
          title: "Dashboard handoff",
          status: "done",
          sortOrder: 1,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      [liveMeeting.id]: [
        {
          id: "77777777-7777-4777-8777-777777777793",
          meetingId: liveMeeting.id,
          title: "Check voice room lifecycle",
          status: "open",
          sortOrder: 0,
          createdAt: liveMeeting.createdAt,
          updatedAt: liveMeeting.createdAt,
        },
      ],
    },
    memos: {
      [reportedMeeting.id]: [
        {
          id: "77777777-7777-4777-8777-777777777794",
          meetingId: reportedMeeting.id,
          authorMemberId: workspaceDashboardFixture.members[0].memberId,
          body: "Action items should become Task draft requests, not direct Task writes.",
          createdAt,
          updatedAt: createdAt,
        },
      ],
      [liveMeeting.id]: [
        {
          id: "77777777-7777-4777-8777-777777777795",
          meetingId: liveMeeting.id,
          authorMemberId: workspaceDashboardFixture.members[0].memberId,
          body: "Voice controls can stay mock-backed until provider wiring lands.",
          createdAt: liveMeeting.updatedAt,
          updatedAt: liveMeeting.updatedAt,
        },
      ],
    },
    transcripts: {
      [reportedMeeting.id]: [
        {
          id: "77777777-7777-4777-8777-777777777796",
          meetingId: reportedMeeting.id,
          speakerMemberId: null,
          source: "stt",
          body: "We will expose recent reports to Dashboard and keep Task writes behind drafts.",
          startedAt: "2026-06-27T08:08:00.000Z",
          endedAt: "2026-06-27T08:08:07.000Z",
          createdAt,
        },
      ],
      [liveMeeting.id]: [
        {
          id: "77777777-7777-4777-8777-777777777797",
          meetingId: liveMeeting.id,
          speakerMemberId: null,
          source: "text",
          body: "Manual transcript fallback is ready for report generation.",
          startedAt: null,
          endedAt: null,
          createdAt: liveMeeting.updatedAt,
        },
      ],
    },
    reports: {
      [report.id]: report,
    },
    reportByMeeting: {
      [reportedMeeting.id]: report.id,
    },
    actionItems: {
      [report.id]: [
        {
          ...fixtureActionItem,
          title: "Add OAuth error state UI",
          description: "Show a clear error state when login fails.",
          status: "approved",
        },
        {
          id: "77777777-7777-4777-8777-777777777773",
          reportId: report.id,
          title: "Wire Dashboard meeting link",
          description: "Point the Dashboard meeting entry at the workspace meeting surface.",
          assigneeSuggestionMemberId: workspaceDashboardFixture.members[0].memberId,
          dueDateSuggestion: "2026-07-04",
          status: "draft",
          convertedTaskId: null,
        },
        {
          id: "77777777-7777-4777-8777-777777777774",
          reportId: report.id,
          title: "Confirm report fixture fallback",
          description: "Keep the report workflow usable while app-server is offline.",
          assigneeSuggestionMemberId: null,
          dueDateSuggestion: null,
          status: "draft",
          convertedTaskId: null,
        },
      ],
    },
  };
}

function ensureWorkspaceState(workspaceId) {
  if (!mockWorkspaceStates.has(workspaceId)) {
    mockWorkspaceStates.set(workspaceId, createSeedState(workspaceId));
  }

  return mockWorkspaceStates.get(workspaceId);
}

function getMeetingStateByMeetingId(meetingId) {
  for (const state of mockWorkspaceStates.values()) {
    const meeting = state.meetings.find((candidate) => candidate.id === meetingId);

    if (meeting) {
      return { meeting, state };
    }
  }

  throw new MeetingApiError("Meeting not found", {
    status: 404,
    path: `/api/meetings/${meetingId}`,
  });
}

function getReportStateByReportId(reportId) {
  for (const state of mockWorkspaceStates.values()) {
    const report = state.reports[reportId];

    if (report) {
      return { report, state };
    }
  }

  throw new MeetingApiError("Meeting report not found", {
    status: 404,
    path: `/api/meeting-reports/${reportId}`,
  });
}

function getActionItemState(actionItemId) {
  for (const state of mockWorkspaceStates.values()) {
    for (const [reportId, actionItems] of Object.entries(state.actionItems)) {
      const actionItem = actionItems.find(
        (candidate) => candidate.id === actionItemId,
      );

      if (actionItem) {
        return { actionItem, reportId, state };
      }
    }
  }

  throw new MeetingApiError("Meeting action item not found", {
    status: 404,
    path: `/api/meeting-action-items/${actionItemId}`,
  });
}

function updateMeetingInState(state, meetingId, updates) {
  const index = state.meetings.findIndex((meeting) => meeting.id === meetingId);

  if (index === -1) {
    throw new MeetingApiError("Meeting not found", {
      status: 404,
      path: `/api/meetings/${meetingId}`,
    });
  }

  state.meetings[index] = {
    ...state.meetings[index],
    ...updates,
    updatedAt: updates.updatedAt ?? nowIso(),
  };

  return state.meetings[index];
}

function toReportDetail(report, state) {
  const actionItems = state.actionItems[report.id] ?? [];

  return {
    id: report.id,
    meetingId: report.meetingId,
    workspaceId: report.workspaceId,
    title: report.title,
    summary: report.summary,
    decisionCount: report.decisions.length,
    actionItemCount: actionItems.length,
    riskCount: report.risks.length,
    createdAt: report.createdAt,
    decisions: clone(report.decisions),
    risks: clone(report.risks),
    nextAgendas: clone(report.nextAgendas),
  };
}

function toReportSummary(report, state) {
  const detail = toReportDetail(report, state);

  return {
    id: detail.id,
    meetingId: detail.meetingId,
    workspaceId: detail.workspaceId,
    title: detail.title,
    summary: detail.summary,
    decisionCount: detail.decisionCount,
    actionItemCount: detail.actionItemCount,
    riskCount: detail.riskCount,
    createdAt: detail.createdAt,
  };
}

function generateMockReport(meeting, state) {
  const existingReportId = state.reportByMeeting[meeting.id];

  if (existingReportId) {
    return toReportDetail(state.reports[existingReportId], state);
  }

  const createdAt = nowIso();
  const memos = state.memos[meeting.id] ?? [];
  const transcripts = state.transcripts[meeting.id] ?? [];
  const sourceCount = memos.length + transcripts.length;
  const firstSource =
    memos[0]?.body ?? transcripts[0]?.body ?? `${meeting.title} kickoff`;
  const reportId = createMockId("meeting-report");
  const actionItemId = createMockId("meeting-action-item");
  const report = {
    id: reportId,
    meetingId: meeting.id,
    workspaceId: meeting.workspaceId,
    title: meeting.title,
    summary:
      sourceCount === 0
        ? `${meeting.title} report draft is ready with no transcript yet.`
        : `${sourceCount} meeting notes were summarized for ${meeting.title}.`,
    createdAt,
    decisions:
      sourceCount === 0
        ? []
        : [
            {
              id: createMockId("meeting-decision"),
              reportId,
              title: "Keep the workflow moving through public contracts",
              content: `${firstSource.slice(0, 90)} was captured as the leading decision source.`,
              status: "decided",
              linkedTaskId: null,
              createdAt,
            },
          ],
    risks:
      sourceCount === 0
        ? []
        : [
            {
              id: createMockId("meeting-risk"),
              reportId,
              content: "Transcript coverage may be incomplete until provider STT lands.",
              severity: "medium",
              sortOrder: 0,
              createdAt,
            },
          ],
    nextAgendas: [
      {
        id: createMockId("meeting-next-agenda"),
        reportId,
        title: `Follow up on ${meeting.title}`,
        sortOrder: 0,
        createdAt,
      },
    ],
  };

  state.reports[reportId] = report;
  state.reportByMeeting[meeting.id] = reportId;
  state.actionItems[reportId] =
    sourceCount === 0
      ? []
      : [
          {
            id: actionItemId,
            reportId,
            title: `${meeting.title} follow-up task draft`,
            description:
              "Convert this meeting follow-up through the Task draft API boundary.",
            assigneeSuggestionMemberId: null,
            dueDateSuggestion: null,
            status: "draft",
            convertedTaskId: null,
          },
        ];
  updateMeetingInState(state, meeting.id, {
    status: "report_generated",
    updatedAt: createdAt,
  });

  return toReportDetail(report, state);
}

export function createMeetingApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  const requestOptions = { baseUrl, fetcher };

  return {
    async listMeetings(workspaceId) {
      const meetings = await requestMeetingJson(
        `/api/workspaces/${encodeId(workspaceId)}/meetings`,
        undefined,
        requestOptions,
      );

      return Array.isArray(meetings) ? meetings : [];
    },

    async createMeeting(workspaceId, body) {
      return requestMeetingJson(
        `/api/workspaces/${encodeId(workspaceId)}/meetings`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async getMeeting(meetingId) {
      return requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}`,
        undefined,
        requestOptions,
      );
    },

    async updateMeetingStatus(meetingId, status) {
      return requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}/status`,
        withJsonBody({ status }, { method: "PATCH" }),
        requestOptions,
      );
    },

    async listAgendas(meetingId) {
      const agendas = await requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}/agendas`,
        undefined,
        requestOptions,
      );

      return Array.isArray(agendas) ? agendas : [];
    },

    async createAgenda(meetingId, body) {
      return requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}/agendas`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async updateAgendaStatus(meetingId, agendaId, status) {
      return requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}/agendas/${encodeId(agendaId)}/status`,
        withJsonBody({ status }, { method: "PATCH" }),
        requestOptions,
      );
    },

    async listMemos(meetingId) {
      const memos = await requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}/memos`,
        undefined,
        requestOptions,
      );

      return Array.isArray(memos) ? memos : [];
    },

    async createMemo(meetingId, body) {
      return requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}/memos`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async listTranscriptSegments(meetingId) {
      const segments = await requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}/transcript-segments`,
        undefined,
        requestOptions,
      );

      return Array.isArray(segments) ? segments : [];
    },

    async createTranscriptSegment(meetingId, body) {
      return requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}/transcript-segments`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async requestReportGeneration(meetingId) {
      return requestMeetingJson(
        `/api/meetings/${encodeId(meetingId)}/report-generation`,
        { method: "POST" },
        requestOptions,
      );
    },

    async getReport(reportId) {
      return requestMeetingJson(
        `/api/meeting-reports/${encodeId(reportId)}`,
        undefined,
        requestOptions,
      );
    },

    async listRecentReports(workspaceId) {
      const reports = await requestMeetingJson(
        `/api/workspaces/${encodeId(workspaceId)}/meeting-reports/recent`,
        undefined,
        requestOptions,
      );

      return Array.isArray(reports) ? reports : [];
    },

    async listActionItems(reportId) {
      const actionItems = await requestMeetingJson(
        `/api/meeting-reports/${encodeId(reportId)}/action-items`,
        undefined,
        requestOptions,
      );

      return Array.isArray(actionItems) ? actionItems : [];
    },

    async approveActionItem(actionItemId) {
      return requestMeetingJson(
        `/api/meeting-action-items/${encodeId(actionItemId)}/approve`,
        { method: "PATCH" },
        requestOptions,
      );
    },

    async rejectActionItem(actionItemId) {
      return requestMeetingJson(
        `/api/meeting-action-items/${encodeId(actionItemId)}/reject`,
        { method: "PATCH" },
        requestOptions,
      );
    },

    async requestActionItemTaskDraft(actionItemId) {
      return requestMeetingJson(
        `/api/meeting-action-items/${encodeId(actionItemId)}/task-draft`,
        { method: "POST" },
        requestOptions,
      );
    },
  };
}

export function createMockMeetingClient() {
  return {
    async listMeetings(workspaceId) {
      return clone(ensureWorkspaceState(workspaceId).meetings);
    },

    async createMeeting(workspaceId, body = {}) {
      const state = ensureWorkspaceState(workspaceId);
      const timestamp = nowIso();
      const meeting = {
        id: createMockId("meeting"),
        workspaceId,
        canvasBoardId: body.canvasBoardId ?? null,
        title: body.title?.trim() || "Untitled meeting",
        purpose: body.purpose?.trim() || null,
        status: "scheduled",
        startedAt: null,
        endedAt: null,
        createdByMemberId: workspaceDashboardFixture.members[0].memberId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      state.meetings = [meeting, ...state.meetings];
      state.agendas[meeting.id] = [];
      state.memos[meeting.id] = [];
      state.transcripts[meeting.id] = [];

      return clone(meeting);
    },

    async getMeeting(meetingId) {
      return clone(getMeetingStateByMeetingId(meetingId).meeting);
    },

    async updateMeetingStatus(meetingId, status) {
      const { meeting, state } = getMeetingStateByMeetingId(meetingId);
      const timestamp = nowIso();
      const updates = {
        status,
        startedAt:
          status === "in_progress" || status === "ended"
            ? meeting.startedAt ?? timestamp
            : meeting.startedAt,
        endedAt: status === "ended" ? timestamp : meeting.endedAt,
        updatedAt: timestamp,
      };

      return clone(updateMeetingInState(state, meetingId, updates));
    },

    async listAgendas(meetingId) {
      const { state } = getMeetingStateByMeetingId(meetingId);

      return clone(state.agendas[meetingId] ?? []);
    },

    async createAgenda(meetingId, body = {}) {
      const { state } = getMeetingStateByMeetingId(meetingId);
      const timestamp = nowIso();
      const agendas = state.agendas[meetingId] ?? [];
      const agenda = {
        id: createMockId("meeting-agenda"),
        meetingId,
        title: body.title?.trim() || "Untitled agenda",
        status: "open",
        sortOrder: Number.isInteger(body.sortOrder)
          ? body.sortOrder
          : agendas.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      state.agendas[meetingId] = [...agendas, agenda].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      );

      return clone(agenda);
    },

    async updateAgendaStatus(meetingId, agendaId, status) {
      const { state } = getMeetingStateByMeetingId(meetingId);
      const agendas = state.agendas[meetingId] ?? [];
      const index = agendas.findIndex((agenda) => agenda.id === agendaId);

      if (index === -1) {
        throw new MeetingApiError("Meeting agenda not found", {
          status: 404,
          path: `/api/meetings/${meetingId}/agendas/${agendaId}/status`,
        });
      }

      agendas[index] = {
        ...agendas[index],
        status,
        updatedAt: nowIso(),
      };

      return clone(agendas[index]);
    },

    async listMemos(meetingId) {
      const { state } = getMeetingStateByMeetingId(meetingId);

      return clone(state.memos[meetingId] ?? []);
    },

    async createMemo(meetingId, body = {}) {
      const { state } = getMeetingStateByMeetingId(meetingId);
      const timestamp = nowIso();
      const memo = {
        id: createMockId("meeting-memo"),
        meetingId,
        authorMemberId:
          body.authorMemberId ?? workspaceDashboardFixture.members[0].memberId,
        body: body.body?.trim() || "Empty memo",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      state.memos[meetingId] = [...(state.memos[meetingId] ?? []), memo];

      return clone(memo);
    },

    async listTranscriptSegments(meetingId) {
      const { state } = getMeetingStateByMeetingId(meetingId);

      return clone(state.transcripts[meetingId] ?? []);
    },

    async createTranscriptSegment(meetingId, body = {}) {
      const { state } = getMeetingStateByMeetingId(meetingId);
      const timestamp = nowIso();
      const segment = {
        id: createMockId("transcript-segment"),
        meetingId,
        speakerMemberId: body.speakerMemberId ?? null,
        source: body.source === "stt" ? "stt" : "text",
        body: body.body?.trim() || "Empty transcript segment",
        startedAt: body.startedAt ?? null,
        endedAt: body.endedAt ?? null,
        createdAt: timestamp,
      };

      state.transcripts[meetingId] = [
        ...(state.transcripts[meetingId] ?? []),
        segment,
      ];

      return clone(segment);
    },

    async requestReportGeneration(meetingId) {
      const { meeting, state } = getMeetingStateByMeetingId(meetingId);

      return generateMockReport(meeting, state);
    },

    async getReport(reportId) {
      const { report, state } = getReportStateByReportId(reportId);

      return toReportDetail(report, state);
    },

    async listRecentReports(workspaceId) {
      const state = ensureWorkspaceState(workspaceId);

      return Object.values(state.reports)
        .map((report) => toReportSummary(report, state))
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        );
    },

    async listActionItems(reportId) {
      const { state } = getReportStateByReportId(reportId);

      return clone(state.actionItems[reportId] ?? []);
    },

    async approveActionItem(actionItemId) {
      const { actionItem } = getActionItemState(actionItemId);

      if (actionItem.status !== "draft") {
        throw new MeetingApiError("Only draft action items can be approved", {
          status: 400,
          path: `/api/meeting-action-items/${actionItemId}/approve`,
        });
      }

      actionItem.status = "approved";

      return clone(actionItem);
    },

    async rejectActionItem(actionItemId) {
      const { actionItem } = getActionItemState(actionItemId);

      if (actionItem.status !== "draft") {
        throw new MeetingApiError("Only draft action items can be rejected", {
          status: 400,
          path: `/api/meeting-action-items/${actionItemId}/reject`,
        });
      }

      actionItem.status = "rejected";

      return clone(actionItem);
    },

    async requestActionItemTaskDraft(actionItemId) {
      const { actionItem, state } = getActionItemState(actionItemId);

      if (actionItem.status !== "approved") {
        throw new MeetingApiError(
          "Only approved action items can request a Task draft",
          {
            status: 400,
            path: `/api/meeting-action-items/${actionItemId}/task-draft`,
          },
        );
      }

      const report = state.reports[actionItem.reportId];
      const taskDraft = {
        id: createMockId("task-draft"),
        taskId: null,
        mode: "mock",
        payload: {
          workspaceId: report.workspaceId,
          sourceType: "meeting_action_item",
          sourceId: actionItem.id,
          title: actionItem.title,
          description: actionItem.description,
          assigneeMemberId: actionItem.assigneeSuggestionMemberId,
          priority: "medium",
          dueDate: actionItem.dueDateSuggestion,
        },
      };

      return {
        actionItem: clone(actionItem),
        taskDraft,
      };
    },
  };
}

export function createMeetingClient(options = {}) {
  const mode = resolveMeetingClientMode(options.mode);

  if (mode === "api") {
    return createMeetingApiClient(options);
  }

  return createMockMeetingClient();
}
