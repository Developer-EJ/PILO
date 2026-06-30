import {
  defaultWorkspaceApiBaseUrl,
  localMvpActorHeaders,
  WorkspaceApiError,
} from "../workspace/workspaceClient.mjs";
import { workspaceDashboardFixture } from "../workspace/workspaceDashboardFixture.mjs";

const DEFAULT_VOICE_MODE = "mock";

let mockVoiceIdCounter = 1;
const mockVoiceState = {
  rooms: new Map(),
  roomByMeeting: new Map(),
  sessions: new Map(),
};

function defaultVoiceMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_VOICE_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_VOICE_MODE
  );
}

export function resolveVoiceClientMode(mode = defaultVoiceMode()) {
  return mode === "api" ? "api" : "mock";
}

export class VoiceApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "VoiceApiError";
  }
}

export function buildVoiceApiUrl(path, baseUrl = defaultWorkspaceApiBaseUrl()) {
  if (!path.startsWith("/api/")) {
    throw new VoiceApiError("Voice API path must start with /api/", {
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

function createMockVoiceId(prefix) {
  mockVoiceIdCounter += 1;

  return `mock-${prefix}-${mockVoiceIdCounter}`;
}

function decodeBase64ByteLength(audioBase64) {
  if (typeof audioBase64 !== "string" || audioBase64.trim().length === 0) {
    throw new VoiceApiError("audioBase64 is required", {
      status: 400,
      path: "/api/voice-sessions/mock/audio-chunks",
    });
  }

  const normalizedAudio = audioBase64.trim();

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedAudio)) {
    throw new VoiceApiError("audioBase64 must be valid base64 audio", {
      status: 400,
      path: "/api/voice-sessions/mock/audio-chunks",
    });
  }

  if (normalizedAudio.length % 4 !== 0) {
    throw new VoiceApiError("audioBase64 must be valid base64 audio", {
      status: 400,
      path: "/api/voice-sessions/mock/audio-chunks",
    });
  }

  if (typeof globalThis.atob === "function") {
    try {
      return globalThis.atob(normalizedAudio).length;
    } catch (error) {
      throw new VoiceApiError("audioBase64 must be valid base64 audio", {
        status: 400,
        path: "/api/voice-sessions/mock/audio-chunks",
      });
    }
  }

  return Math.floor((normalizedAudio.replace(/=+$/, "").length * 3) / 4);
}

function buildLocalSttTranscript({ audioByteLength, mimeType, sequence }) {
  return `Local STT chunk ${sequence} captured ${audioByteLength} bytes of ${mimeType} audio.`;
}

async function readVoiceJson(response, path) {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    throw new VoiceApiError("Voice API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

async function requestVoiceJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildVoiceApiUrl(path, baseUrl), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...localMvpActorHeaders(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new VoiceApiError("Voice API request failed", {
      status: response.status,
      path,
    });
  }

  return readVoiceJson(response, path);
}

function withJsonBody(body, init = {}) {
  return {
    ...init,
    body: JSON.stringify(body),
  };
}

function getRoom(voiceRoomId) {
  const room = mockVoiceState.rooms.get(voiceRoomId);

  if (!room) {
    throw new VoiceApiError("Voice room not found", {
      status: 404,
      path: `/api/voice-rooms/${voiceRoomId}`,
    });
  }

  return room;
}

function getSession(voiceSessionId) {
  const session = mockVoiceState.sessions.get(voiceSessionId);

  if (!session) {
    throw new VoiceApiError("Voice session not found", {
      status: 404,
      path: `/api/voice-sessions/${voiceSessionId}`,
    });
  }

  return session;
}

function listRoomSessions(voiceRoomId) {
  return [...mockVoiceState.sessions.values()].filter(
    (session) => session.voiceRoomId === voiceRoomId,
  );
}

export function createVoiceApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  const requestOptions = { baseUrl, fetcher };

  return {
    async createVoiceRoom(workspaceId, meetingId) {
      return requestVoiceJson(
        `/api/workspaces/${encodeId(workspaceId)}/meetings/${encodeId(meetingId)}/voice-room`,
        { method: "POST" },
        requestOptions,
      );
    },

    async getVoiceRoomForMeeting(workspaceId, meetingId) {
      return requestVoiceJson(
        `/api/workspaces/${encodeId(workspaceId)}/meetings/${encodeId(meetingId)}/voice-room`,
        undefined,
        requestOptions,
      );
    },

    async updateVoiceRoomStatus(voiceRoomId, status) {
      return requestVoiceJson(
        `/api/voice-rooms/${encodeId(voiceRoomId)}/status`,
        withJsonBody({ status }, { method: "PATCH" }),
        requestOptions,
      );
    },

    async joinVoiceSession(voiceRoomId) {
      return requestVoiceJson(
        `/api/voice-rooms/${encodeId(voiceRoomId)}/sessions`,
        { method: "POST" },
        requestOptions,
      );
    },

    async listVoiceSessions(voiceRoomId) {
      const sessions = await requestVoiceJson(
        `/api/voice-rooms/${encodeId(voiceRoomId)}/sessions`,
        undefined,
        requestOptions,
      );

      return Array.isArray(sessions) ? sessions : [];
    },

    async leaveVoiceSession(voiceSessionId) {
      return requestVoiceJson(
        `/api/voice-sessions/${encodeId(voiceSessionId)}/leave`,
        { method: "PATCH" },
        requestOptions,
      );
    },

    async updateRecordingStatus(voiceSessionId, recordingStatus) {
      return requestVoiceJson(
        `/api/voice-sessions/${encodeId(voiceSessionId)}/recording-status`,
        withJsonBody({ recordingStatus }, { method: "PATCH" }),
        requestOptions,
      );
    },

    async submitAudioChunk(voiceSessionId, input) {
      return requestVoiceJson(
        `/api/voice-sessions/${encodeId(voiceSessionId)}/audio-chunks`,
        withJsonBody(input, { method: "POST" }),
        requestOptions,
      );
    },
  };
}

export function createMockVoiceClient({ transcriptWriter } = {}) {
  return {
    async createVoiceRoom(workspaceId, meetingId) {
      const existingRoomId = mockVoiceState.roomByMeeting.get(meetingId);

      if (existingRoomId) {
        return clone(mockVoiceState.rooms.get(existingRoomId));
      }

      const timestamp = nowIso();
      const room = {
        id: createMockVoiceId("voice-room"),
        workspaceId,
        meetingId,
        livekitRoomName: null,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      mockVoiceState.rooms.set(room.id, room);
      mockVoiceState.roomByMeeting.set(meetingId, room.id);

      return clone(room);
    },

    async getVoiceRoomForMeeting(_workspaceId, meetingId) {
      const roomId = mockVoiceState.roomByMeeting.get(meetingId);

      if (!roomId) {
        throw new VoiceApiError("Voice room not found for meeting", {
          status: 404,
          path: `/api/workspaces/mock/meetings/${meetingId}/voice-room`,
        });
      }

      return clone(mockVoiceState.rooms.get(roomId));
    },

    async updateVoiceRoomStatus(voiceRoomId, status) {
      const room = getRoom(voiceRoomId);

      room.status = status;
      room.updatedAt = nowIso();

      return clone(room);
    },

    async joinVoiceSession(voiceRoomId) {
      const room = getRoom(voiceRoomId);

      if (room.status !== "active") {
        throw new VoiceApiError("Voice room must be active", {
          status: 400,
          path: `/api/voice-rooms/${voiceRoomId}/sessions`,
        });
      }

      const memberId = workspaceDashboardFixture.members[0].memberId;
      const activeSession = listRoomSessions(voiceRoomId).find(
        (session) => session.memberId === memberId && session.endedAt === null,
      );

      if (activeSession) {
        throw new VoiceApiError("Member already has an active voice session", {
          status: 400,
          path: `/api/voice-rooms/${voiceRoomId}/sessions`,
        });
      }

      const timestamp = nowIso();
      const session = {
        id: createMockVoiceId("voice-session"),
        voiceRoomId,
        meetingId: room.meetingId,
        memberId,
        recordingStatus: "not_recording",
        startedAt: timestamp,
        endedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      mockVoiceState.sessions.set(session.id, session);

      return clone(session);
    },

    async listVoiceSessions(voiceRoomId) {
      getRoom(voiceRoomId);

      return clone(listRoomSessions(voiceRoomId));
    },

    async leaveVoiceSession(voiceSessionId) {
      const session = getSession(voiceSessionId);

      if (session.endedAt !== null) {
        throw new VoiceApiError("Voice session already ended", {
          status: 400,
          path: `/api/voice-sessions/${voiceSessionId}/leave`,
        });
      }

      session.endedAt = nowIso();
      session.updatedAt = session.endedAt;

      return clone(session);
    },

    async updateRecordingStatus(voiceSessionId, recordingStatus) {
      const session = getSession(voiceSessionId);

      if (session.endedAt !== null) {
        throw new VoiceApiError("Cannot update an ended voice session", {
          status: 400,
          path: `/api/voice-sessions/${voiceSessionId}/recording-status`,
        });
      }

      session.recordingStatus = recordingStatus;
      session.updatedAt = nowIso();

      return clone(session);
    },

    async submitAudioChunk(voiceSessionId, input = {}) {
      const session = getSession(voiceSessionId);

      if (session.endedAt !== null) {
        throw new VoiceApiError("Cannot transcribe an ended voice session", {
          status: 400,
          path: `/api/voice-sessions/${voiceSessionId}/audio-chunks`,
        });
      }

      if (!session.meetingId) {
        throw new VoiceApiError("Voice session is not linked to a meeting", {
          status: 400,
          path: `/api/voice-sessions/${voiceSessionId}/audio-chunks`,
        });
      }

      const sequence = Number.isInteger(input.sequence) ? input.sequence : 0;
      const mimeType =
        typeof input.mimeType === "string" && input.mimeType.trim()
          ? input.mimeType.trim()
          : "audio/webm";
      const audioByteLength = decodeBase64ByteLength(input.audioBase64);
      const timestamp = nowIso();
      const transcriptInput = {
        source: "stt",
        body: buildLocalSttTranscript({
          audioByteLength,
          mimeType,
          sequence,
        }),
        startedAt: input.capturedStartedAt ?? null,
        endedAt: input.capturedEndedAt ?? timestamp,
      };
      const transcriptSegment = transcriptWriter
        ? await transcriptWriter(session.meetingId, transcriptInput)
        : {
            id: createMockVoiceId("transcript"),
            meetingId: session.meetingId,
            speakerMemberId: session.memberId,
            ...transcriptInput,
            createdAt: timestamp,
          };

      session.recordingStatus = "completed";
      session.updatedAt = timestamp;

      return {
        voiceSession: clone(session),
        transcriptSegment: clone(transcriptSegment),
      };
    },
  };
}

export function createVoiceClient(options = {}) {
  const mode = resolveVoiceClientMode(options.mode);

  if (mode === "api") {
    return createVoiceApiClient(options);
  }

  return createMockVoiceClient(options.mock);
}
