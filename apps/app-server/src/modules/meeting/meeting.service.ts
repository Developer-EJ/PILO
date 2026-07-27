import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { QueryResultRow } from "pg";
import {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  workspaceRecordingConsentRequired
} from "../../common/api-error";
import {
  DatabaseService,
  DatabaseTransaction
} from "../../database/database.service";
import { WorkspaceService } from "../workspace/workspace.service";
import {
  LiveKitEgressService,
  StopLiveKitEgressResult
} from "./livekit-egress.service";
import {
  LiveKitJoinPayload,
  LiveKitTokenService
} from "./livekit-token.service";
import type { MeetingReportJobPayload } from "../meeting-report/meeting-report-job.service";
import { MeetingReportLifecycleService } from "../meeting-report/meeting-report-lifecycle.service";
import type { MeetingReportSummaryPayload } from "../meeting-report/meeting-report.types";
import {
  MeetingStateRealtimePublisherService,
  type MeetingStateChange,
  type MeetingStateRealtimeEventInput
} from "./meeting-state-realtime-publisher.service";
import { MeetingNotificationService } from "./meeting-notification.service";

type RecordingStatus = "RUNNING" | "COMPLETED" | "FAILED";

interface MeetingRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  room_key: string;
  livekit_room_name: string;
  created_by_id: string;
  ended_by_id: string | null;
  started_at: Date | string;
  ended_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MeetingRoomRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  room_key: string;
  name: string;
  created_by_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CurrentMeetingRow extends MeetingRow {
  recording_id: string | null;
  recording_meeting_id: string | null;
  recording_livekit_egress_id: string | null;
  recording_status: RecordingStatus | null;
  recording_audio_file_url: string | null;
  recording_audio_file_key: string | null;
  recording_duration_sec: number | null;
  recording_file_size_bytes: number | string | null;
  recording_started_at: Date | string | null;
  recording_ended_at: Date | string | null;
  recording_error_message: string | null;
  active_participant_count: number | string;
}

interface StartMeetingRow extends QueryResultRow {
  meeting_id: string;
  meeting_workspace_id: string;
  meeting_room_key: string;
  meeting_livekit_room_name: string;
  meeting_created_by_id: string;
  meeting_ended_by_id: string | null;
  meeting_started_at: Date | string;
  meeting_ended_at: Date | string | null;
  meeting_created_at: Date | string;
  meeting_updated_at: Date | string;
  participant_id: string;
  participant_meeting_id: string;
  participant_user_id: string;
  participant_livekit_identity: string;
  participant_joined_at: Date | string;
  participant_left_at: Date | string | null;
  participant_user_name: string | null;
  participant_user_avatar_url: string | null;
}

interface ParticipantRow extends QueryResultRow {
  id: string;
  meeting_id: string;
  user_id: string;
  livekit_identity: string;
  joined_at: Date | string;
  left_at: Date | string | null;
  user_name: string | null;
  user_avatar_url: string | null;
}

interface RecordingRow extends QueryResultRow {
  id: string;
  meeting_id: string;
  livekit_egress_id: string | null;
  status: RecordingStatus;
  audio_file_url: string | null;
  audio_file_key: string | null;
  duration_sec: number | null;
  file_size_bytes: number | string | null;
  started_at: Date | string;
  ended_at: Date | string | null;
  error_message: string | null;
}

interface ActiveParticipantCountRow extends QueryResultRow {
  active_participant_count: number | string;
}

interface GeneratedIdRow extends QueryResultRow {
  id: string;
}

interface ParticipantCountRow extends QueryResultRow {
  participant_count: number | string;
  active_participant_count: number | string;
}

interface WorkspaceRecordingConsentRow extends QueryResultRow {
  workspace_id: string;
  user_id: string;
  policy_version: string;
  accepted_at: Date | string;
}

interface MissingWorkspaceRecordingConsentRow extends QueryResultRow {
  user_id: string;
}

interface QueryOneExecutor {
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<T | null>;
}

interface EndRecordingTransactionResult {
  payload: EndRecordingPayload;
  job: MeetingReportJobPayload | null;
  stateChange: MeetingStateChange | null;
}

interface LeaveMeetingTransactionResult {
  payload: LeaveMeetingPayload;
  job: MeetingReportJobPayload | null;
  stateEvents: MeetingStateRealtimeEventInput[];
}

interface StartMeetingDraft {
  roomKey?: unknown;
  recordingConsent?: unknown;
}

interface RecordingConsentDraft {
  accepted: true;
  policyVersion: string;
}

interface MeetingRoomNameDraft {
  name?: unknown;
}

export interface MeetingPayload {
  id: string;
  workspaceId: string;
  roomKey: string;
  livekitRoomName: string;
  createdById: string;
  endedById: string | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingRoomPayload {
  id: string;
  workspaceId: string;
  roomKey: string;
  name: string;
  isDefault: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingRoomListPayload {
  rooms: MeetingRoomPayload[];
}

export interface MeetingRoomMutationPayload {
  room: MeetingRoomPayload;
}

export interface DeleteMeetingRoomPayload {
  deleted: true;
}

export interface CurrentUserActiveMeetingPayload {
  meeting: MeetingPayload | null;
  meetingRoom: MeetingRoomPayload | null;
}

export interface ParticipantPayload {
  id: string;
  meetingId: string;
  userId: string;
  livekitIdentity: string;
  joinedAt: string;
  leftAt: string | null;
  isActive: boolean;
  user: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  };
}

export interface RecordingPayload {
  id: string;
  meetingId: string;
  status: RecordingStatus;
  audioFileUrl: string | null;
  audioFileKey: string | null;
  durationSec: number | null;
  fileSizeBytes: number | null;
  startedAt: string;
  endedAt: string | null;
  errorMessage: string | null;
}

export interface MeetingAgentMeetingSearchQuery {
  roomName?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface MeetingAgentMeetingSearchPayload {
  meeting: MeetingPayload;
  roomName: string;
}

export interface CurrentMeetingPayload {
  meeting: MeetingPayload | null;
  currentRecording: RecordingPayload | null;
  activeParticipantCount: number;
}

export interface StartMeetingPayload {
  meeting: MeetingPayload;
  participant: ParticipantPayload;
  livekit: LiveKitJoinPayload;
  currentRecording: null;
}

export interface RecordingConsentInput {
  accepted: true;
  policyVersion: string;
}

export interface RecordingConsentStatusPayload {
  accepted: boolean;
  policyVersion: string;
}

export interface JoinMeetingPayload {
  meeting: MeetingPayload;
  participant: ParticipantPayload;
  livekit: LiveKitJoinPayload;
  currentRecording: RecordingPayload | null;
}

export interface StartRecordingPayload {
  meeting: MeetingPayload;
  recording: RecordingPayload;
}

export interface EndRecordingPayload {
  meeting: MeetingPayload;
  recording: RecordingPayload;
  report: MeetingReportSummaryPayload | null;
}

export interface LeaveMeetingPayload {
  participant: ParticipantPayload;
  meetingEnded: boolean;
  meeting: MeetingPayload;
  currentRecording: RecordingPayload | null;
}

export interface LiveKitParticipantDepartureInput {
  roomName: string | null;
  participantIdentity: string | null;
  eventCreatedAt: Date | null;
}

export interface LiveKitParticipantDepartureResult {
  job: MeetingReportJobPayload | null;
  stateEvents: MeetingStateRealtimeEventInput[];
}

export interface MeetingDetailPayload {
  meeting: MeetingPayload;
  currentRecording: RecordingPayload | null;
  recordings: RecordingPayload[];
  reports: MeetingReportSummaryPayload[];
  participantCount: number;
  activeParticipantCount: number;
  currentUserParticipant: ParticipantPayload | null;
}

export interface RecordingListPayload {
  recordings: RecordingPayload[];
}

export interface CurrentRecordingPayload {
  recording: RecordingPayload | null;
}

export interface ParticipantListPayload {
  participants: ParticipantPayload[];
}

const MAIN_MEETING_ROOM = "MAIN_MEETING_ROOM";
const WORKSPACE_RECORDING_CONSENT_POLICY_VERSION = "v1";
const UNIQUE_VIOLATION_CODE = "23505";
const ACTIVE_MEETING_UNIQUE_INDEX = "unique_active_meeting_per_room";
const MEETING_ALREADY_IN_PROGRESS_ERROR_CODE =
  "MEETING_ALREADY_IN_PROGRESS";
const MEETING_ALREADY_IN_PROGRESS_MESSAGE = "A meeting is already in progress";
const ACTIVE_MEETING_PARTICIPATION_EXISTS_MESSAGE =
  "Current user is already participating in another active meeting";
const DEFAULT_MEETING_ROOM_NAME = "기본 회의실";
const MEETING_ROOM_NAME_MAX_LENGTH = 100;
const ACTIVE_MEETING_ROOM_NAME_UNIQUE_INDEX =
  "unique_active_meeting_room_name";
const SAFE_EGRESS_START_ERROR = "LiveKit Egress start failed";
const SAFE_EGRESS_STOP_ERROR = "LiveKit Egress stop failed";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly workspaceService: WorkspaceService,
    private readonly liveKitTokenService: LiveKitTokenService,
    private readonly liveKitEgressService: LiveKitEgressService,
    private readonly meetingReportLifecycleService: MeetingReportLifecycleService,
    private readonly meetingNotificationService: MeetingNotificationService,
    private readonly meetingStateRealtimePublisher?: MeetingStateRealtimePublisherService
  ) {}

  getModuleInfo() {
    return {
      domain: "meeting",
      apiContract: "docs/api/meeting-api.md"
    };
  }

  async getCurrentMeeting(
    currentUserId: string,
    workspaceId: string
  ): Promise<CurrentMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const currentMeeting = await this.findCurrentMeeting(
      workspaceId,
      MAIN_MEETING_ROOM
    );

    if (!currentMeeting) {
      return {
        meeting: null,
        currentRecording: null,
        activeParticipantCount: 0
      };
    }

    return {
      meeting: this.mapMeeting(currentMeeting),
      currentRecording: this.mapNullableCurrentRecording(currentMeeting),
      activeParticipantCount: Number(currentMeeting.active_participant_count)
    };
  }

  async getCurrentUserActiveMeeting(
    currentUserId: string
  ): Promise<CurrentUserActiveMeetingPayload> {
    const activeMeeting = await this.database.queryOne<
      CurrentMeetingRow & { meeting_room_id: string; meeting_room_name: string; meeting_room_created_by_id: string | null; meeting_room_created_at: Date | string; meeting_room_updated_at: Date | string }
    >(
      `
        SELECT
          meetings.id,
          meetings.workspace_id,
          meetings.room_key,
          meetings.livekit_room_name,
          meetings.created_by_id,
          meetings.ended_by_id,
          meetings.started_at,
          meetings.ended_at,
          meetings.created_at,
          meetings.updated_at,
          meeting_rooms.id AS meeting_room_id,
          meeting_rooms.name AS meeting_room_name,
          meeting_rooms.created_by_id AS meeting_room_created_by_id,
          meeting_rooms.created_at AS meeting_room_created_at,
          meeting_rooms.updated_at AS meeting_room_updated_at,
          NULL::uuid AS recording_id,
          NULL::uuid AS recording_meeting_id,
          NULL::text AS recording_livekit_egress_id,
          NULL::text AS recording_status,
          NULL::text AS recording_audio_file_url,
          NULL::text AS recording_audio_file_key,
          NULL::int AS recording_duration_sec,
          NULL::bigint AS recording_file_size_bytes,
          NULL::timestamptz AS recording_started_at,
          NULL::timestamptz AS recording_ended_at,
          NULL::text AS recording_error_message,
          0::int AS active_participant_count
        FROM meeting_participants
        JOIN meetings
          ON meetings.id = meeting_participants.meeting_id
        JOIN meeting_rooms
          ON meeting_rooms.workspace_id = meetings.workspace_id
          AND meeting_rooms.room_key = meetings.room_key
          AND meeting_rooms.archived_at IS NULL
        JOIN workspace_members
          ON workspace_members.workspace_id = meetings.workspace_id
          AND workspace_members.user_id = meeting_participants.user_id
        WHERE meeting_participants.user_id = $1::uuid
          AND meeting_participants.left_at IS NULL
          AND meetings.ended_at IS NULL
        ORDER BY meeting_participants.joined_at DESC, meetings.id ASC
        LIMIT 1
      `,
      [currentUserId]
    );

    if (!activeMeeting) {
      return { meeting: null, meetingRoom: null };
    }

    const isDefault = await this.isDefaultMeetingRoom(
      this.database,
      activeMeeting.workspace_id,
      activeMeeting.meeting_room_id
    );

    return {
      meeting: this.mapMeeting(activeMeeting),
      meetingRoom: this.mapMeetingRoom(
        {
          id: activeMeeting.meeting_room_id,
          workspace_id: activeMeeting.workspace_id,
          room_key: activeMeeting.room_key,
          name: activeMeeting.meeting_room_name,
          created_by_id: activeMeeting.meeting_room_created_by_id,
          created_at: activeMeeting.meeting_room_created_at,
          updated_at: activeMeeting.meeting_room_updated_at
        },
        isDefault
      )
    };
  }

  async getRecordingConsentStatus(
    currentUserId: string,
    workspaceId: string
  ): Promise<RecordingConsentStatusPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const consent = await this.database.queryOne<{ accepted: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM workspace_recording_consents
          WHERE workspace_id = $1::uuid
            AND user_id = $2::uuid
            AND policy_version = $3
        ) AS accepted
      `,
      [workspaceId, currentUserId, WORKSPACE_RECORDING_CONSENT_POLICY_VERSION]
    );
    return {
      accepted: consent?.accepted === true,
      policyVersion: WORKSPACE_RECORDING_CONSENT_POLICY_VERSION
    };
  }

  async startMeeting(
    currentUserId: string,
    workspaceId: string,
    body: unknown
  ): Promise<StartMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const { roomKey, recordingConsent } = this.normalizeStartMeetingBody(body);

    try {
      const result = await this.database.transaction(async (transaction) => {
        await this.assertNoOtherActiveMeetingParticipant(
          transaction,
          currentUserId
        );
        const existingMeeting = await this.findCurrentMeeting(
          workspaceId,
          roomKey,
          transaction
        );
        if (existingMeeting) {
          throw this.meetingAlreadyInProgress();
        }

        return this.createStartedMeeting(
          transaction,
          workspaceId,
          roomKey,
          currentUserId,
          recordingConsent
        );
      });
      await this.publishMeetingStarted(workspaceId, result.meeting.id);
      return result;
    } catch (error) {
      if (this.isConstraintError(error, ACTIVE_MEETING_UNIQUE_INDEX)) {
        throw this.meetingAlreadyInProgress();
      }

      throw error;
    }
  }

  async listMeetingRooms(
    currentUserId: string,
    workspaceId: string
  ): Promise<MeetingRoomListPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const rooms = await this.database.query<MeetingRoomRow>(
      `
        SELECT id, workspace_id, room_key, name, created_by_id, created_at, updated_at
        FROM meeting_rooms
        WHERE workspace_id = $1
          AND archived_at IS NULL
        ORDER BY created_at ASC, id ASC
      `,
      [workspaceId]
    );

    return {
      rooms: rooms.map((room, index) => this.mapMeetingRoom(room, index === 0))
    };
  }

  async createMeetingRoom(
    currentUserId: string,
    workspaceId: string,
    body: unknown
  ): Promise<MeetingRoomMutationPayload> {
    await this.assertWorkspaceOwnerAccess(currentUserId, workspaceId);
    const name = this.normalizeMeetingRoomName(body);

    try {
      const room = await this.database.queryOne<MeetingRoomRow>(
        `
          WITH generated AS (
            SELECT gen_random_uuid() AS id
          )
          INSERT INTO meeting_rooms (
            id,
            workspace_id,
            room_key,
            name,
            created_by_id
          )
          SELECT
            generated.id,
            $1::uuid,
            'ROOM_' || generated.id::text,
            $2,
            $3::uuid
          FROM generated
          RETURNING id, workspace_id, room_key, name, created_by_id, created_at, updated_at
        `,
        [workspaceId, name, currentUserId]
      );

      if (!room) {
        throw badRequest("Meeting room could not be created");
      }

      return {
        room: this.mapMeetingRoom(
          room,
          await this.isDefaultMeetingRoom(this.database, workspaceId, room.id)
        )
      };
    } catch (error) {
      if (this.isConstraintError(error, ACTIVE_MEETING_ROOM_NAME_UNIQUE_INDEX)) {
        throw conflict("A meeting room with this name already exists");
      }

      throw error;
    }
  }

  async updateMeetingRoom(
    currentUserId: string,
    workspaceId: string,
    meetingRoomId: string,
    body: unknown
  ): Promise<MeetingRoomMutationPayload> {
    await this.assertWorkspaceOwnerAccess(currentUserId, workspaceId);
    const name = this.normalizeMeetingRoomName(body);

    try {
      const room = await this.database.transaction(async (transaction) => {
        const existing = await this.findActiveMeetingRoom(
          transaction,
          workspaceId,
          meetingRoomId,
          { lockRoom: true }
        );
        if (!existing) {
          throw notFound("Meeting room not found");
        }
        return transaction.queryOne<MeetingRoomRow>(
          `
            UPDATE meeting_rooms
            SET name = $3, updated_at = now()
            WHERE workspace_id = $1
              AND id = $2::uuid
              AND archived_at IS NULL
            RETURNING id, workspace_id, room_key, name, created_by_id, created_at, updated_at
          `,
          [workspaceId, meetingRoomId, name]
        );
      });

      if (!room) {
        throw notFound("Meeting room not found");
      }

      return {
        room: this.mapMeetingRoom(
          room,
          await this.isDefaultMeetingRoom(this.database, workspaceId, room.id)
        )
      };
    } catch (error) {
      if (this.isConstraintError(error, ACTIVE_MEETING_ROOM_NAME_UNIQUE_INDEX)) {
        throw conflict("A meeting room with this name already exists");
      }

      throw error;
    }
  }

  async deleteMeetingRoom(
    currentUserId: string,
    workspaceId: string,
    meetingRoomId: string
  ): Promise<DeleteMeetingRoomPayload> {
    await this.assertWorkspaceOwnerAccess(currentUserId, workspaceId);

    await this.database.transaction(async (transaction) => {
      const room = await this.findActiveMeetingRoom(
        transaction,
        workspaceId,
        meetingRoomId,
        { lockRoom: true }
      );
      if (!room) {
        throw notFound("Meeting room not found");
      }
      if (await this.isDefaultMeetingRoom(transaction, workspaceId, meetingRoomId)) {
        throw badRequest("Default meeting room cannot be deleted");
      }

      const activeMeeting = await this.findCurrentMeeting(
        workspaceId,
        room.room_key,
        transaction
      );
      if (activeMeeting) {
        throw conflict("Meeting room with an active meeting cannot be deleted");
      }

      await transaction.queryOne(
        `
          UPDATE meeting_rooms
          SET archived_at = now(), updated_at = now()
          WHERE workspace_id = $1
            AND id = $2::uuid
            AND archived_at IS NULL
          RETURNING id
        `,
        [workspaceId, meetingRoomId]
      );
    });

    return { deleted: true };
  }

  async getCurrentMeetingForRoom(
    currentUserId: string,
    workspaceId: string,
    meetingRoomId: string
  ): Promise<CurrentMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const room = await this.requireActiveMeetingRoom(
      this.database,
      workspaceId,
      meetingRoomId
    );
    return this.currentMeetingPayload(workspaceId, room.room_key);
  }

  async startMeetingInRoom(
    currentUserId: string,
    workspaceId: string,
    meetingRoomId: string,
    body: unknown
  ): Promise<StartMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const { recordingConsent } = this.normalizeStartMeetingBody(body);

    try {
      const result = await this.database.transaction(async (transaction) => {
        const room = await this.requireActiveMeetingRoom(
          transaction,
          workspaceId,
          meetingRoomId,
          { lockRoom: true }
        );
        const existingMeeting = await this.findCurrentMeeting(
          workspaceId,
          room.room_key,
          transaction
        );
        if (existingMeeting) {
          throw this.meetingAlreadyInProgress();
        }

        await this.assertNoOtherActiveMeetingParticipant(
          transaction,
          currentUserId
        );

        return this.createStartedMeeting(
          transaction,
          workspaceId,
          room.room_key,
          currentUserId,
          recordingConsent
        );
      });
      await this.publishMeetingStarted(workspaceId, result.meeting.id);
      return result;
    } catch (error) {
      if (this.isConstraintError(error, ACTIVE_MEETING_UNIQUE_INDEX)) {
        throw this.meetingAlreadyInProgress();
      }

      throw error;
    }
  }

  async joinMeeting(
    currentUserId: string,
    workspaceId: string,
    meetingId: string,
    body: unknown
  ): Promise<JoinMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const { recordingConsent } = this.normalizeStartMeetingBody(body);
    const result = await this.database.transaction(async (transaction) => {
      const meeting = await this.findMeetingById(transaction, workspaceId, meetingId, {
        lockMeeting: true
      });

      if (!meeting) {
        throw notFound("Meeting not found");
      }

      if (meeting.ended_at !== null) {
        throw badRequest("Meeting has already ended");
      }

      await this.ensureWorkspaceRecordingConsent(
        transaction,
        workspaceId,
        currentUserId,
        recordingConsent
      );

      await this.assertNoOtherActiveMeetingParticipant(
        transaction,
        currentUserId,
        meetingId
      );

      const participant = await this.upsertParticipant(
        transaction,
        meetingId,
        currentUserId
      );
      const livekit = await this.liveKitTokenService.createJoinToken({
        livekitRoomName: meeting.livekit_room_name,
        livekitIdentity: participant.livekit_identity,
        participantName: participant.user_name
      });

      return {
        meeting: this.mapMeeting(meeting),
        participant: this.mapParticipant(participant),
        livekit,
        currentRecording: this.mapNullableCurrentRecording(meeting)
      };
    });
    await this.publishMeetingStateEvent({
      workspaceId,
      meetingId: result.meeting.id,
      change: "participant_joined"
    });
    return result;
  }

  async getMeeting(
    currentUserId: string,
    workspaceId: string,
    meetingId: string
  ): Promise<MeetingDetailPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const meeting = await this.findMeetingById(this.database, workspaceId, meetingId);

    if (!meeting) {
      throw notFound("Meeting not found");
    }

    const recordings = await this.listRecordingRows(meetingId);
    const reports = await this.meetingReportLifecycleService.listForMeeting(meetingId);
    const participantCounts = await this.countParticipants(meetingId);
    const currentUserParticipant = await this.findParticipantSummary(
      this.database,
      meetingId,
      currentUserId
    );

    return {
      meeting: this.mapMeeting(meeting),
      currentRecording: this.mapNullableCurrentRecording(meeting),
      recordings: recordings.map((recording) => this.mapRecording(recording)),
      reports,
      participantCount: participantCounts.participantCount,
      activeParticipantCount: participantCounts.activeParticipantCount,
      currentUserParticipant:
        currentUserParticipant === null
          ? null
          : this.mapParticipant(currentUserParticipant)
    };
  }

  async leaveMeeting(
    currentUserId: string,
    workspaceId: string,
    meetingId: string
  ): Promise<LeaveMeetingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const result = await this.database.transaction<LeaveMeetingTransactionResult>(
      async (transaction) => {
        const meeting = await this.findMeetingById(
          transaction,
          workspaceId,
          meetingId,
          {
            lockMeeting: true
          }
        );

        if (!meeting) {
          throw notFound("Meeting not found");
        }

        const existingParticipant = await this.findActiveParticipant(
          transaction,
          meetingId,
          currentUserId
        );
        if (!existingParticipant) {
          throw notFound("Participant not found");
        }

        const activeParticipantCount = await this.countActiveParticipants(
          transaction,
          meetingId
        );
        const wasActive = existingParticipant.left_at === null;
        const shouldEndMeeting =
          wasActive && activeParticipantCount === 1 && meeting.ended_at === null;

        const runningRecording =
          shouldEndMeeting && meeting.recording_id !== null
            ? await this.findRunningRecording(transaction, meetingId, {
                lockRecording: true
              })
            : null;
        const stoppedRecording =
          runningRecording === null
            ? null
            : await this.stopRunningRecording(transaction, meeting, runningRecording);

        if (stoppedRecording !== null && stoppedRecording.status !== "COMPLETED") {
          throw badRequest("Running recording could not be completed before leaving");
        }

        const reportPreparation =
          stoppedRecording === null
            ? { report: null, job: null }
            : await this.meetingReportLifecycleService.prepareForStoppedRecording(
                transaction,
                stoppedRecording
              );
        const participant = await this.markParticipantLeft(
          transaction,
          existingParticipant.id
        );
        const endedMeeting = shouldEndMeeting
          ? await this.endMeetingIfStillActive(transaction, workspaceId, meetingId)
          : null;

        return {
          payload: {
            participant: this.mapParticipant(participant),
            meetingEnded: endedMeeting !== null,
            meeting: this.mapMeeting(endedMeeting ?? meeting),
            currentRecording:
              stoppedRecording === null
                ? this.mapNullableCurrentRecording(meeting)
                : null
          },
          job: reportPreparation.job,
          stateEvents: wasActive
            ? [
                {
                  workspaceId,
                  meetingId,
                  change: "participant_left"
                },
                ...(endedMeeting === null
                  ? []
                  : [{ workspaceId, meetingId, change: "ended" as const }]),
                ...(stoppedRecording === null
                  ? []
                  : [
                      {
                        workspaceId,
                        meetingId,
                        change:
                          stoppedRecording.status === "FAILED"
                            ? "recording_failed" as const
                            : "recording_ended" as const
                      }
                    ])
              ]
            : []
        };
      }
    );

    await this.meetingReportLifecycleService.publishOutbox(result.job);
    await this.meetingReportLifecycleService.publishReportEvent(
      result.job?.reportId
    );
    await this.publishMeetingStateEvents(result.stateEvents);

    return result.payload;
  }

  async reconcileLiveKitParticipantDeparture(
    transaction: DatabaseTransaction,
    input: LiveKitParticipantDepartureInput
  ): Promise<LiveKitParticipantDepartureResult> {
    if (
      input.roomName === null ||
      input.participantIdentity === null ||
      input.eventCreatedAt === null
    ) {
      return { job: null, stateEvents: [] };
    }

    const meeting = await this.findActiveMeetingByLiveKitRoomName(
      transaction,
      input.roomName
    );
    if (meeting === null) {
      return { job: null, stateEvents: [] };
    }

    const participant = await this.findParticipantByLiveKitIdentity(
      transaction,
      meeting.id,
      input.participantIdentity,
      { lockParticipant: true }
    );
    if (
      participant === null ||
      participant.left_at !== null ||
      input.eventCreatedAt.getTime() <= this.toDate(participant.joined_at).getTime()
    ) {
      return { job: null, stateEvents: [] };
    }

    const activeParticipantCount = await this.countActiveParticipants(
      transaction,
      meeting.id
    );
    const shouldEndMeeting = activeParticipantCount === 1;
    const runningRecording =
      shouldEndMeeting && meeting.recording_id !== null
        ? await this.findRunningRecording(transaction, meeting.id, {
            lockRecording: true
          })
        : null;
    const stoppedRecording =
      runningRecording === null
        ? null
        : await this.stopRunningRecording(transaction, meeting, runningRecording);
    const reportPreparation =
      stoppedRecording === null
        ? { report: null, job: null }
        : await this.meetingReportLifecycleService.prepareForStoppedRecording(
            transaction,
            stoppedRecording
          );

    await this.markParticipantLeft(transaction, participant.id);

    if (shouldEndMeeting) {
      await this.endMeetingIfStillActive(
        transaction,
        meeting.workspace_id,
        meeting.id
      );
    }

    return {
      job: reportPreparation.job,
      stateEvents: [
        {
          workspaceId: meeting.workspace_id,
          meetingId: meeting.id,
          change: "participant_left"
        },
        ...(shouldEndMeeting
          ? [{ workspaceId: meeting.workspace_id, meetingId: meeting.id, change: "ended" as const }]
          : []),
        ...(stoppedRecording === null
          ? []
          : [
              {
                workspaceId: meeting.workspace_id,
                meetingId: meeting.id,
                change:
                  stoppedRecording.status === "FAILED"
                    ? "recording_failed" as const
                    : "recording_ended" as const
              }
            ])
      ]
    };
  }

  async enqueueReconciledMeetingReportJob(
    job: MeetingReportJobPayload | null
  ): Promise<void> {
    await this.meetingReportLifecycleService.publishOutbox(job);
  }

  async publishReconciledMeetingStateEvents(
    stateEvents: MeetingStateRealtimeEventInput[]
  ): Promise<void> {
    await this.publishMeetingStateEvents(stateEvents);
  }

  async startRecording(
    currentUserId: string,
    workspaceId: string,
    meetingId: string
  ): Promise<StartRecordingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);

    const prepared = await this.database.transaction(async (transaction) => {
      const meeting = await this.findMeetingById(transaction, workspaceId, meetingId, {
        lockMeeting: true
      });

      if (!meeting) {
        throw notFound("Meeting not found");
      }

      if (meeting.ended_at !== null) {
        throw badRequest("Meeting has already ended");
      }

      await this.assertActiveParticipant(transaction, meetingId, currentUserId);
      await this.assertAllActiveParticipantsHaveRecordingConsent(
        transaction,
        workspaceId,
        meetingId
      );

      const runningRecording = await this.findRunningRecording(
        transaction,
        meetingId,
        {
          lockRecording: true
        }
      );
      if (runningRecording) {
        return {
          shouldStartEgress: false as const,
          meeting: this.mapMeeting(meeting),
          recording: this.mapRecording(runningRecording)
        };
      }

      const recordingId = await this.generateId(transaction);
      const audioFileKey = this.buildAudioFileKey(
        workspaceId,
        meetingId,
        recordingId
      );

      const recording = await this.insertRunningRecording(transaction, {
        recordingId,
        meetingId,
        livekitEgressId: null,
        audioFileKey
      });

      return {
        shouldStartEgress: true as const,
        meeting,
        recording,
        audioFileKey,
        livekitRoomName: meeting.livekit_room_name
      };
    });

    if (!prepared.shouldStartEgress) {
      return {
        meeting: prepared.meeting,
        recording: prepared.recording
      };
    }

    let livekitEgressId: string;
    try {
      const egress = await this.liveKitEgressService.startRoomAudioOnlyEgress({
        livekitRoomName: prepared.livekitRoomName,
        audioFileKey: prepared.audioFileKey
      });
      livekitEgressId = egress.livekitEgressId;
    } catch {
      const recording = await this.database.transaction((transaction) =>
        this.updateRecordingFailed(
          transaction,
          prepared.recording,
          SAFE_EGRESS_START_ERROR
        )
      );
      await this.publishMeetingStateEvent({
        workspaceId,
        meetingId,
        change: "recording_failed"
      });

      return {
        meeting: this.mapMeeting(prepared.meeting),
        recording: this.mapRecording(recording)
      };
    }

    try {
      const recording = await this.database.transaction((transaction) =>
        this.updateRecordingLiveKitEgressId(
          transaction,
          prepared.recording,
          livekitEgressId
        )
      );
      await this.publishMeetingStateEvent({
        workspaceId,
        meetingId,
        change: "recording_started"
      });

      return {
        meeting: this.mapMeeting(prepared.meeting),
        recording: this.mapRecording(recording)
      };
    } catch (error) {
      await this.stopStartedEgressAfterPersistenceFailure(livekitEgressId);
      const failedRecording = await this.markRecordingFailedAfterPersistenceFailure(
        prepared.recording
      );
      if (failedRecording !== null) {
        await this.publishMeetingStateEvent({
          workspaceId,
          meetingId,
          change: "recording_failed"
        });
      }
      throw error;
    }
  }

  async endRecordingAndCreateReport(
    currentUserId: string,
    workspaceId: string,
    meetingId: string,
    recordingId: string
  ): Promise<EndRecordingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const result = await this.database.transaction<EndRecordingTransactionResult>(
      async (transaction) => {
        const meeting = await this.findMeetingById(
          transaction,
          workspaceId,
          meetingId,
          {
            lockMeeting: true
          }
        );

        if (!meeting) {
          throw notFound("Meeting not found");
        }

        await this.assertActiveParticipant(transaction, meetingId, currentUserId);

        const recording = await this.findRecordingById(
          transaction,
          meetingId,
          recordingId,
          {
            lockRecording: true
          }
        );

        if (!recording) {
          throw notFound("Recording not found");
        }

        const stoppedRecording =
          recording.status === "RUNNING"
            ? await this.stopRunningRecording(transaction, meeting, recording)
            : recording;
        const reportPreparation =
          await this.meetingReportLifecycleService.prepareForStoppedRecording(
            transaction,
            stoppedRecording
          );

        return {
          payload: {
            meeting: this.mapMeeting(meeting),
            recording: this.mapRecording(stoppedRecording),
            report: reportPreparation.report
          },
          job: reportPreparation.job,
          stateChange:
            recording.status !== "RUNNING"
              ? null
              : stoppedRecording.status === "FAILED"
                ? "recording_failed"
                : "recording_ended"
        };
      }
    );

    await this.meetingReportLifecycleService.publishOutbox(result.job);
    await this.meetingReportLifecycleService.publishReportEvent(
      result.job?.reportId
    );
    await this.meetingReportLifecycleService.publishReportEvent(
      result.payload.report?.id
    );
    if (result.stateChange !== null) {
      await this.publishMeetingStateEvent({
        workspaceId,
        meetingId,
        change: result.stateChange
      });
    }
    return result.payload;
  }

  async listRecordings(
    currentUserId: string,
    workspaceId: string,
    meetingId: string
  ): Promise<RecordingListPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    await this.assertMeetingExists(workspaceId, meetingId);
    const recordings = await this.listRecordingRows(meetingId);

    return {
      recordings: recordings.map((recording) => this.mapRecording(recording))
    };
  }

  async getCurrentRecording(
    currentUserId: string,
    workspaceId: string,
    meetingId: string
  ): Promise<CurrentRecordingPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const meeting = await this.findMeetingById(this.database, workspaceId, meetingId);

    if (!meeting) {
      throw notFound("Meeting not found");
    }

    return {
      recording: this.mapNullableCurrentRecording(meeting)
    };
  }

  async listParticipants(
    currentUserId: string,
    workspaceId: string,
    meetingId: string
  ): Promise<ParticipantListPayload> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    await this.assertMeetingExists(workspaceId, meetingId);
    const participants = await this.listParticipantRows(meetingId);

    return {
      participants: participants.map((participant) =>
        this.mapParticipant(participant)
      )
    };
  }

  async listMeetingsForAgent(
    currentUserId: string,
    workspaceId: string,
    query: MeetingAgentMeetingSearchQuery
  ): Promise<{ meetings: MeetingAgentMeetingSearchPayload[] }> {
    await this.assertWorkspaceAccess(currentUserId, workspaceId);
    const limit = this.agentResolutionLimit(query.limit);
    const normalizedRoomName = query.roomName
      ? this.normalizeAgentResolutionText(query.roomName)
      : null;
    const values: unknown[] = [workspaceId];
    const roomNameCondition =
      normalizedRoomName === null
        ? ""
        : `AND lower(regexp_replace(BTRIM(meeting_rooms.name), '\\s+', ' ', 'g')) = $${values.push(normalizedRoomName)}`;
    const fromCondition = query.from
      ? `AND meetings.started_at >= $${values.push(query.from)}::timestamptz`
      : "";
    const toCondition = query.to
      ? `AND meetings.started_at < $${values.push(query.to)}::timestamptz`
      : "";
    const rows = await this.database.query<
      MeetingRow & { meeting_room_name: string }
    >(
      `
        SELECT
          meetings.id,
          meetings.workspace_id,
          meetings.room_key,
          meetings.livekit_room_name,
          meetings.created_by_id,
          meetings.ended_by_id,
          meetings.started_at,
          meetings.ended_at,
          meetings.created_at,
          meetings.updated_at,
          meeting_rooms.name AS meeting_room_name
        FROM meetings
        JOIN meeting_rooms
          ON meeting_rooms.workspace_id = meetings.workspace_id
          AND meeting_rooms.room_key = meetings.room_key
        WHERE meetings.workspace_id = $1
          ${roomNameCondition}
          ${fromCondition}
          ${toCondition}
        ORDER BY meetings.started_at DESC, meetings.id ASC
        LIMIT $${values.push(limit)}
      `,
      values
    );
    return {
      meetings: rows.map((row) => ({
        meeting: this.mapMeeting(row),
        roomName: row.meeting_room_name
      }))
    };
  }

  private agentResolutionLimit(value: number | undefined): number {
    if (!Number.isInteger(value) || value === undefined) {
      return 4;
    }
    return Math.min(Math.max(value, 1), 20);
  }

  private normalizeAgentResolutionText(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
  }

  private async createStartedMeeting(
    transaction: DatabaseTransaction,
    workspaceId: string,
    roomKey: string,
    currentUserId: string,
    recordingConsent: RecordingConsentDraft | null
  ): Promise<StartMeetingPayload> {
    await this.ensureWorkspaceRecordingConsent(
      transaction,
      workspaceId,
      currentUserId,
      recordingConsent
    );

    const startedMeeting = await transaction.queryOne<StartMeetingRow>(
      `
        WITH generated AS (
          SELECT gen_random_uuid() AS meeting_id
        ),
        inserted_meeting AS (
          INSERT INTO meetings (
            id,
            workspace_id,
            room_key,
            livekit_room_name,
            created_by_id
          )
          SELECT
            generated.meeting_id,
            $1::uuid,
            $2,
            'meeting-' || generated.meeting_id::text,
            $3::uuid
          FROM generated
          RETURNING *
        ),
        inserted_participant AS (
          INSERT INTO meeting_participants (
            meeting_id,
            user_id,
            livekit_identity
          )
          SELECT
            inserted_meeting.id,
            $3::uuid,
            'meeting-' || inserted_meeting.id::text || '-user-' || ($3::uuid)::text
          FROM inserted_meeting
          RETURNING *
        )
        SELECT
          inserted_meeting.id AS meeting_id,
          inserted_meeting.workspace_id AS meeting_workspace_id,
          inserted_meeting.room_key AS meeting_room_key,
          inserted_meeting.livekit_room_name AS meeting_livekit_room_name,
          inserted_meeting.created_by_id AS meeting_created_by_id,
          inserted_meeting.ended_by_id AS meeting_ended_by_id,
          inserted_meeting.started_at AS meeting_started_at,
          inserted_meeting.ended_at AS meeting_ended_at,
          inserted_meeting.created_at AS meeting_created_at,
          inserted_meeting.updated_at AS meeting_updated_at,
          inserted_participant.id AS participant_id,
          inserted_participant.meeting_id AS participant_meeting_id,
          inserted_participant.user_id AS participant_user_id,
          inserted_participant.livekit_identity AS participant_livekit_identity,
          inserted_participant.joined_at AS participant_joined_at,
          inserted_participant.left_at AS participant_left_at,
          users.name AS participant_user_name,
          users.avatar_url AS participant_user_avatar_url
        FROM inserted_meeting
        JOIN inserted_participant
          ON inserted_participant.meeting_id = inserted_meeting.id
        JOIN users
          ON users.id = inserted_participant.user_id
      `,
      [workspaceId, roomKey, currentUserId]
    );

    if (!startedMeeting) {
      throw badRequest("Meeting could not be started");
    }

    const livekit = await this.liveKitTokenService.createJoinToken({
      livekitRoomName: startedMeeting.meeting_livekit_room_name,
      livekitIdentity: startedMeeting.participant_livekit_identity,
      participantName: startedMeeting.participant_user_name
    });

    return this.mapStartMeeting(startedMeeting, livekit);
  }

  private async publishMeetingStarted(
    workspaceId: string,
    meetingId: string
  ): Promise<void> {
    await this.publishMeetingStateEvent({
      workspaceId,
      meetingId,
      change: "started"
    });
  }

  private async currentMeetingPayload(
    workspaceId: string,
    roomKey: string
  ): Promise<CurrentMeetingPayload> {
    const currentMeeting = await this.findCurrentMeeting(workspaceId, roomKey);

    if (!currentMeeting) {
      return {
        meeting: null,
        currentRecording: null,
        activeParticipantCount: 0
      };
    }

    return {
      meeting: this.mapMeeting(currentMeeting),
      currentRecording: this.mapNullableCurrentRecording(currentMeeting),
      activeParticipantCount: Number(currentMeeting.active_participant_count)
    };
  }

  private async assertWorkspaceAccess(
    currentUserId: string,
    workspaceId: string
  ): Promise<void> {
    await this.workspaceService.assertWorkspaceAccess(currentUserId, workspaceId);
  }

  private async assertWorkspaceOwnerAccess(
    currentUserId: string,
    workspaceId: string
  ): Promise<void> {
    await this.workspaceService.assertWorkspaceOwnerAccess(
      currentUserId,
      workspaceId
    );
  }

  private meetingAlreadyInProgress() {
    return new ApiError(
      HttpStatus.BAD_REQUEST,
      MEETING_ALREADY_IN_PROGRESS_ERROR_CODE,
      MEETING_ALREADY_IN_PROGRESS_MESSAGE
    );
  }

  private activeMeetingParticipationExists() {
    return conflict(ACTIVE_MEETING_PARTICIPATION_EXISTS_MESSAGE);
  }

  private async assertMeetingExists(
    workspaceId: string,
    meetingId: string
  ): Promise<MeetingRow> {
    const meeting = await this.findMeetingById(this.database, workspaceId, meetingId);

    if (!meeting) {
      throw notFound("Meeting not found");
    }

    return meeting;
  }

  private async requireActiveMeetingRoom(
    executor: QueryOneExecutor,
    workspaceId: string,
    meetingRoomId: string,
    options: { lockRoom?: boolean } = {}
  ): Promise<MeetingRoomRow> {
    const room = await this.findActiveMeetingRoom(
      executor,
      workspaceId,
      meetingRoomId,
      options
    );
    if (!room) {
      throw notFound("Meeting room not found");
    }

    return room;
  }

  private async findActiveMeetingRoom(
    executor: QueryOneExecutor,
    workspaceId: string,
    meetingRoomId: string,
    options: { lockRoom?: boolean } = {}
  ): Promise<MeetingRoomRow | null> {
    if (!UUID_PATTERN.test(meetingRoomId)) {
      return null;
    }

    return executor.queryOne<MeetingRoomRow>(
      `
        SELECT id, workspace_id, room_key, name, created_by_id, created_at, updated_at
        FROM meeting_rooms
        WHERE workspace_id = $1
          AND id = $2::uuid
          AND archived_at IS NULL
        ${options.lockRoom === true ? "FOR UPDATE" : ""}
      `,
      [workspaceId, meetingRoomId]
    );
  }

  private async isDefaultMeetingRoom(
    executor: QueryOneExecutor,
    workspaceId: string,
    meetingRoomId: string
  ): Promise<boolean> {
    const defaultRoom = await executor.queryOne<{ id: string }>(
      `
        SELECT id
        FROM meeting_rooms
        WHERE workspace_id = $1
          AND archived_at IS NULL
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `,
      [workspaceId]
    );

    return defaultRoom?.id === meetingRoomId;
  }

  private async assertNoOtherActiveMeetingParticipant(
    transaction: DatabaseTransaction,
    currentUserId: string,
    allowedMeetingId?: string
  ): Promise<void> {
    await transaction.execute(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [currentUserId]
    );

    const activeParticipant = await transaction.queryOne<{ meeting_id: string }>(
      `
        SELECT meeting_participants.meeting_id
        FROM meeting_participants
        JOIN meetings
          ON meetings.id = meeting_participants.meeting_id
        WHERE meeting_participants.user_id = $1::uuid
          AND meeting_participants.left_at IS NULL
          AND meetings.ended_at IS NULL
          ${allowedMeetingId ? "AND meeting_participants.meeting_id <> $2::uuid" : ""}
        ORDER BY meeting_participants.joined_at DESC, meeting_participants.meeting_id ASC
        LIMIT 1
        FOR UPDATE OF meeting_participants
      `,
      allowedMeetingId ? [currentUserId, allowedMeetingId] : [currentUserId]
    );

    if (activeParticipant) {
      throw this.activeMeetingParticipationExists();
    }
  }

  private async findCurrentMeeting(
    workspaceId: string,
    roomKey: string,
    executor: QueryOneExecutor = this.database
  ): Promise<CurrentMeetingRow | null> {
    return executor.queryOne<CurrentMeetingRow>(
      `
        SELECT
          meetings.id,
          meetings.workspace_id,
          meetings.room_key,
          meetings.livekit_room_name,
          meetings.created_by_id,
          meetings.ended_by_id,
          meetings.started_at,
          meetings.ended_at,
          meetings.created_at,
          meetings.updated_at,
          current_recording.id AS recording_id,
          current_recording.meeting_id AS recording_meeting_id,
          current_recording.livekit_egress_id AS recording_livekit_egress_id,
          current_recording.status AS recording_status,
          current_recording.audio_file_url AS recording_audio_file_url,
          current_recording.audio_file_key AS recording_audio_file_key,
          current_recording.duration_sec AS recording_duration_sec,
          current_recording.file_size_bytes AS recording_file_size_bytes,
          current_recording.started_at AS recording_started_at,
          current_recording.ended_at AS recording_ended_at,
          current_recording.error_message AS recording_error_message,
          COALESCE(active_participants.count, 0)::int AS active_participant_count
        FROM meetings
        LEFT JOIN LATERAL (
          SELECT
            meeting_recordings.id,
            meeting_recordings.meeting_id,
            meeting_recordings.livekit_egress_id,
            meeting_recordings.status,
            meeting_recordings.audio_file_url,
            meeting_recordings.audio_file_key,
            meeting_recordings.duration_sec,
            meeting_recordings.file_size_bytes,
            meeting_recordings.started_at,
            meeting_recordings.ended_at,
            meeting_recordings.error_message
          FROM meeting_recordings
          WHERE meeting_recordings.meeting_id = meetings.id
            AND meeting_recordings.status = 'RUNNING'
          ORDER BY meeting_recordings.started_at DESC, meeting_recordings.id ASC
          LIMIT 1
        ) AS current_recording ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS count
          FROM meeting_participants
          WHERE meeting_participants.meeting_id = meetings.id
            AND meeting_participants.left_at IS NULL
        ) AS active_participants ON true
        WHERE meetings.workspace_id = $1
          AND meetings.room_key = $2
          AND meetings.ended_at IS NULL
        ORDER BY meetings.started_at DESC, meetings.id ASC
        LIMIT 1
      `,
      [workspaceId, roomKey]
    );
  }

  private async findMeetingById(
    executor: QueryOneExecutor,
    workspaceId: string,
    meetingId: string,
    options: { lockMeeting?: boolean } = {}
  ): Promise<CurrentMeetingRow | null> {
    if (!UUID_PATTERN.test(meetingId)) {
      return null;
    }

    return executor.queryOne<CurrentMeetingRow>(
      `
        SELECT
          meetings.id,
          meetings.workspace_id,
          meetings.room_key,
          meetings.livekit_room_name,
          meetings.created_by_id,
          meetings.ended_by_id,
          meetings.started_at,
          meetings.ended_at,
          meetings.created_at,
          meetings.updated_at,
          current_recording.id AS recording_id,
          current_recording.meeting_id AS recording_meeting_id,
          current_recording.livekit_egress_id AS recording_livekit_egress_id,
          current_recording.status AS recording_status,
          current_recording.audio_file_url AS recording_audio_file_url,
          current_recording.audio_file_key AS recording_audio_file_key,
          current_recording.duration_sec AS recording_duration_sec,
          current_recording.file_size_bytes AS recording_file_size_bytes,
          current_recording.started_at AS recording_started_at,
          current_recording.ended_at AS recording_ended_at,
          current_recording.error_message AS recording_error_message,
          COALESCE(active_participants.count, 0)::int AS active_participant_count
        FROM meetings
        LEFT JOIN LATERAL (
          SELECT
            meeting_recordings.id,
            meeting_recordings.meeting_id,
            meeting_recordings.livekit_egress_id,
            meeting_recordings.status,
            meeting_recordings.audio_file_url,
            meeting_recordings.audio_file_key,
            meeting_recordings.duration_sec,
            meeting_recordings.file_size_bytes,
            meeting_recordings.started_at,
            meeting_recordings.ended_at,
            meeting_recordings.error_message
          FROM meeting_recordings
          WHERE meeting_recordings.meeting_id = meetings.id
            AND meeting_recordings.status = 'RUNNING'
          ORDER BY meeting_recordings.started_at DESC, meeting_recordings.id ASC
          LIMIT 1
        ) AS current_recording ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS count
          FROM meeting_participants
          WHERE meeting_participants.meeting_id = meetings.id
            AND meeting_participants.left_at IS NULL
        ) AS active_participants ON true
        WHERE meetings.workspace_id = $1
          AND meetings.id = $2
        LIMIT 1
        ${options.lockMeeting === true ? "FOR UPDATE OF meetings" : ""}
      `,
      [workspaceId, meetingId]
    );
  }

  private async findActiveMeetingByLiveKitRoomName(
    executor: QueryOneExecutor,
    liveKitRoomName: string
  ): Promise<CurrentMeetingRow | null> {
    return executor.queryOne<CurrentMeetingRow>(
      `
        SELECT
          meetings.id,
          meetings.workspace_id,
          meetings.room_key,
          meetings.livekit_room_name,
          meetings.created_by_id,
          meetings.ended_by_id,
          meetings.started_at,
          meetings.ended_at,
          meetings.created_at,
          meetings.updated_at,
          current_recording.id AS recording_id,
          current_recording.meeting_id AS recording_meeting_id,
          current_recording.livekit_egress_id AS recording_livekit_egress_id,
          current_recording.status AS recording_status,
          current_recording.audio_file_url AS recording_audio_file_url,
          current_recording.audio_file_key AS recording_audio_file_key,
          current_recording.duration_sec AS recording_duration_sec,
          current_recording.file_size_bytes AS recording_file_size_bytes,
          current_recording.started_at AS recording_started_at,
          current_recording.ended_at AS recording_ended_at,
          current_recording.error_message AS recording_error_message,
          active_participants.count AS active_participant_count
        FROM meetings
        LEFT JOIN LATERAL (
          SELECT
            id,
            meeting_id,
            livekit_egress_id,
            status,
            audio_file_url,
            audio_file_key,
            duration_sec,
            file_size_bytes,
            started_at,
            ended_at,
            error_message
          FROM meeting_recordings
          WHERE meeting_recordings.meeting_id = meetings.id
            AND meeting_recordings.status = 'RUNNING'
          ORDER BY meeting_recordings.started_at DESC, meeting_recordings.id ASC
          LIMIT 1
        ) AS current_recording ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS count
          FROM meeting_participants
          WHERE meeting_participants.meeting_id = meetings.id
            AND meeting_participants.left_at IS NULL
        ) AS active_participants ON true
        WHERE meetings.livekit_room_name = $1
          AND meetings.ended_at IS NULL
        LIMIT 1
        FOR UPDATE OF meetings
      `,
      [liveKitRoomName]
    );
  }

  private async listRecordingRows(meetingId: string): Promise<RecordingRow[]> {
    return this.database.query<RecordingRow>(
      `
        SELECT
          id,
          meeting_id,
          livekit_egress_id,
          status,
          audio_file_url,
          audio_file_key,
          duration_sec,
          file_size_bytes,
          started_at,
          ended_at,
          error_message
        FROM meeting_recordings
        WHERE meeting_id = $1
        ORDER BY started_at DESC, id ASC
      `,
      [meetingId]
    );
  }

  private async findRunningRecording(
    executor: QueryOneExecutor,
    meetingId: string,
    options: { lockRecording?: boolean } = {}
  ): Promise<RecordingRow | null> {
    return executor.queryOne<RecordingRow>(
      `
        SELECT
          id,
          meeting_id,
          livekit_egress_id,
          status,
          audio_file_url,
          audio_file_key,
          duration_sec,
          file_size_bytes,
          started_at,
          ended_at,
          error_message
        FROM meeting_recordings
        WHERE meeting_id = $1
          AND status = 'RUNNING'
        ORDER BY started_at DESC, id ASC
        LIMIT 1
        ${options.lockRecording === true ? "FOR UPDATE" : ""}
      `,
      [meetingId]
    );
  }

  private async findRecordingById(
    executor: QueryOneExecutor,
    meetingId: string,
    recordingId: string,
    options: { lockRecording?: boolean } = {}
  ): Promise<RecordingRow | null> {
    if (!UUID_PATTERN.test(recordingId)) {
      return null;
    }

    return executor.queryOne<RecordingRow>(
      `
        SELECT
          id,
          meeting_id,
          livekit_egress_id,
          status,
          audio_file_url,
          audio_file_key,
          duration_sec,
          file_size_bytes,
          started_at,
          ended_at,
          error_message
        FROM meeting_recordings
        WHERE meeting_id = $1
          AND id = $2
        LIMIT 1
        ${options.lockRecording === true ? "FOR UPDATE" : ""}
      `,
      [meetingId, recordingId]
    );
  }

  private async generateId(executor: QueryOneExecutor): Promise<string> {
    const generated = await executor.queryOne<GeneratedIdRow>(
      "SELECT gen_random_uuid()::text AS id"
    );

    if (!generated) {
      throw badRequest("Identifier could not be generated");
    }

    return generated.id;
  }

  private async insertRunningRecording(
    executor: QueryOneExecutor,
    input: {
      recordingId: string;
      meetingId: string;
      livekitEgressId: string | null;
      audioFileKey: string;
    }
  ): Promise<RecordingRow> {
    const recording = await executor.queryOne<RecordingRow>(
      `
        INSERT INTO meeting_recordings (
          id,
          meeting_id,
          livekit_egress_id,
          status,
          audio_file_url,
          audio_file_key
        )
        VALUES ($1, $2, $3, 'RUNNING', NULL, $4)
        RETURNING
          id,
          meeting_id,
          livekit_egress_id,
          status,
          audio_file_url,
          audio_file_key,
          duration_sec,
          file_size_bytes,
          started_at,
          ended_at,
          error_message
      `,
      [
        input.recordingId,
        input.meetingId,
        input.livekitEgressId,
        input.audioFileKey
      ]
    );

    if (!recording) {
      throw badRequest("Recording could not be started");
    }

    return recording;
  }

  private async updateRecordingLiveKitEgressId(
    executor: QueryOneExecutor,
    recording: RecordingRow,
    livekitEgressId: string
  ): Promise<RecordingRow> {
    const updatedRecording = await executor.queryOne<RecordingRow>(
      `
        UPDATE meeting_recordings
        SET
          livekit_egress_id = $2,
          updated_at = now()
        WHERE id = $1
          AND status = 'RUNNING'
          AND livekit_egress_id IS NULL
        RETURNING
          id,
          meeting_id,
          livekit_egress_id,
          status,
          audio_file_url,
          audio_file_key,
          duration_sec,
          file_size_bytes,
          started_at,
          ended_at,
          error_message
      `,
      [recording.id, livekitEgressId]
    );

    if (!updatedRecording) {
      throw badRequest("Recording Egress id could not be saved");
    }

    return updatedRecording;
  }

  private async insertFailedRecording(
    executor: QueryOneExecutor,
    input: {
      recordingId: string;
      meetingId: string;
      audioFileKey: string;
      errorMessage: string;
    }
  ): Promise<RecordingRow> {
    const recording = await executor.queryOne<RecordingRow>(
      `
        INSERT INTO meeting_recordings (
          id,
          meeting_id,
          status,
          audio_file_url,
          audio_file_key,
          ended_at,
          error_message
        )
        VALUES ($1, $2, 'FAILED', NULL, $3, now(), $4)
        RETURNING
          id,
          meeting_id,
          livekit_egress_id,
          status,
          audio_file_url,
          audio_file_key,
          duration_sec,
          file_size_bytes,
          started_at,
          ended_at,
          error_message
      `,
      [input.recordingId, input.meetingId, input.audioFileKey, input.errorMessage]
    );

    if (!recording) {
      throw badRequest("Recording failure could not be saved");
    }

    return recording;
  }

  private async updateRecordingCompleted(
    executor: QueryOneExecutor,
    recording: RecordingRow,
    result: StopLiveKitEgressResult
  ): Promise<RecordingRow> {
    const updatedRecording = await executor.queryOne<RecordingRow>(
      `
        UPDATE meeting_recordings
        SET
          status = 'COMPLETED',
          audio_file_url = NULL,
          audio_file_key = COALESCE($2, audio_file_key),
          duration_sec = COALESCE(
            $3,
            GREATEST(1, EXTRACT(EPOCH FROM (now() - started_at))::int)
          ),
          file_size_bytes = $4,
          ended_at = now(),
          error_message = NULL,
          updated_at = now()
        WHERE id = $1
          AND status = 'RUNNING'
        RETURNING
          id,
          meeting_id,
          livekit_egress_id,
          status,
          audio_file_url,
          audio_file_key,
          duration_sec,
          file_size_bytes,
          started_at,
          ended_at,
          error_message
      `,
      [
        recording.id,
        result.audioFileKey ?? recording.audio_file_key,
        result.durationSec,
        result.fileSizeBytes
      ]
    );

    if (!updatedRecording) {
      throw badRequest("Recording could not be completed");
    }

    return updatedRecording;
  }

  private async publishMeetingStateEvent(
    input: MeetingStateRealtimeEventInput
  ): Promise<void> {
    if (input.change === "ended") {
      try {
        await this.meetingNotificationService.cancelPendingInvitationsForMeeting(
          input.meetingId
        );
      } catch {
        this.logger.warn(
          `Meeting invitation cancellation failed meeting_id=${input.meetingId}`
        );
      }
    }
    await this.meetingStateRealtimePublisher?.publishStateUpdatedSafely(input);
  }

  private async publishMeetingStateEvents(
    events: MeetingStateRealtimeEventInput[]
  ): Promise<void> {
    for (const event of events) {
      await this.publishMeetingStateEvent(event);
    }
  }

  private async updateRecordingFailed(
    executor: QueryOneExecutor,
    recording: RecordingRow,
    errorMessage: string
  ): Promise<RecordingRow> {
    const updatedRecording = await executor.queryOne<RecordingRow>(
      `
        UPDATE meeting_recordings
        SET
          status = 'FAILED',
          ended_at = now(),
          error_message = $2,
          updated_at = now()
        WHERE id = $1
          AND status = 'RUNNING'
        RETURNING
          id,
          meeting_id,
          livekit_egress_id,
          status,
          audio_file_url,
          audio_file_key,
          duration_sec,
          file_size_bytes,
          started_at,
          ended_at,
          error_message
      `,
      [recording.id, errorMessage]
    );

    if (!updatedRecording) {
      throw badRequest("Recording could not be failed");
    }

    return updatedRecording;
  }

  private async countParticipants(
    meetingId: string
  ): Promise<{ participantCount: number; activeParticipantCount: number }> {
    const result = await this.database.queryOne<ParticipantCountRow>(
      `
        SELECT
          COUNT(DISTINCT user_id)::int AS participant_count,
          (COUNT(DISTINCT user_id) FILTER (WHERE left_at IS NULL))::int
            AS active_participant_count
        FROM meeting_participants
        WHERE meeting_id = $1
      `,
      [meetingId]
    );

    return {
      participantCount: Number(result?.participant_count ?? 0),
      activeParticipantCount: Number(result?.active_participant_count ?? 0)
    };
  }

  private async listParticipantRows(meetingId: string): Promise<ParticipantRow[]> {
    return this.database.query<ParticipantRow>(
      `
        WITH participant_summaries AS (
          SELECT
            meeting_id,
            user_id,
            MIN(joined_at) AS joined_at,
            CASE
              WHEN BOOL_OR(left_at IS NULL) THEN NULL
              ELSE MAX(left_at)
            END AS left_at,
            (
              ARRAY_AGG(
                id
                ORDER BY (left_at IS NULL) DESC, joined_at DESC, id DESC
              )
            )[1] AS id,
            (
              ARRAY_AGG(
                livekit_identity
                ORDER BY (left_at IS NULL) DESC, joined_at DESC, id DESC
              )
            )[1] AS livekit_identity
          FROM meeting_participants
          WHERE meeting_id = $1
          GROUP BY meeting_id, user_id
        )
        SELECT
          participant_summaries.id,
          participant_summaries.meeting_id,
          participant_summaries.user_id,
          participant_summaries.livekit_identity,
          participant_summaries.joined_at,
          participant_summaries.left_at,
          users.name AS user_name,
          users.avatar_url AS user_avatar_url
        FROM participant_summaries
        JOIN users ON users.id = participant_summaries.user_id
        ORDER BY participant_summaries.joined_at ASC, participant_summaries.id ASC
      `,
      [meetingId]
    );
  }

  private async upsertParticipant(
    executor: QueryOneExecutor,
    meetingId: string,
    currentUserId: string
  ): Promise<ParticipantRow> {
    const participant = await executor.queryOne<ParticipantRow>(
      `
        WITH participant_lock AS (
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ($1::uuid)::text || ':' || ($2::uuid)::text,
              0
            )
          )
        ),
        active_participant AS (
          SELECT meeting_participants.*
          FROM meeting_participants
          CROSS JOIN participant_lock
          WHERE meeting_id = $1::uuid
            AND user_id = $2::uuid
            AND left_at IS NULL
          FOR UPDATE
        ),
        inserted_participant AS (
          INSERT INTO meeting_participants (
            meeting_id,
            user_id,
            livekit_identity
          )
          SELECT meeting_id, user_id, livekit_identity
          FROM (
            SELECT
              $1::uuid AS meeting_id,
              $2::uuid AS user_id,
              'meeting-' || ($1::uuid)::text || '-user-' || ($2::uuid)::text
                AS livekit_identity
          ) AS candidate
          WHERE NOT EXISTS (SELECT 1 FROM active_participant)
          ON CONFLICT DO NOTHING
          RETURNING *
        ),
        resolved_participant AS (
          SELECT * FROM active_participant
          UNION ALL
          SELECT * FROM inserted_participant
        )
        SELECT
          resolved_participant.id,
          resolved_participant.meeting_id,
          resolved_participant.user_id,
          resolved_participant.livekit_identity,
          resolved_participant.joined_at,
          resolved_participant.left_at,
          users.name AS user_name,
          users.avatar_url AS user_avatar_url
        FROM resolved_participant
        JOIN users
          ON users.id = resolved_participant.user_id
      `,
      [meetingId, currentUserId]
    );

    if (participant) {
      return participant;
    }

    // Before 072, the former global unique constraint rejects the insert above.
    // This transaction already holds the participant advisory lock, so only that
    // old-schema compatibility path can reactivate one latest closed row. After
    // 072 the insert succeeds for a new session and this path is not used.
    const reactivatedParticipant = await executor.queryOne<ParticipantRow>(
      `
        WITH active_participant AS (
          SELECT *
          FROM meeting_participants
          WHERE meeting_id = $1::uuid
            AND user_id = $2::uuid
            AND left_at IS NULL
          FOR UPDATE
        ),
        legacy_participant AS (
          SELECT id
          FROM meeting_participants
          WHERE meeting_id = $1::uuid
            AND user_id = $2::uuid
            AND left_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM active_participant)
          ORDER BY joined_at DESC, id DESC
          LIMIT 1
          FOR UPDATE
        ),
        reactivated_participant AS (
          UPDATE meeting_participants
          SET
            joined_at = now(),
            left_at = NULL,
            livekit_identity =
              'meeting-' || ($1::uuid)::text || '-user-' || ($2::uuid)::text,
            updated_at = now()
          WHERE id = (SELECT id FROM legacy_participant)
          RETURNING *
        ),
        resolved_participant AS (
          SELECT * FROM active_participant
          UNION ALL
          SELECT * FROM reactivated_participant
        )
        SELECT
          resolved_participant.id,
          resolved_participant.meeting_id,
          resolved_participant.user_id,
          resolved_participant.livekit_identity,
          resolved_participant.joined_at,
          resolved_participant.left_at,
          users.name AS user_name,
          users.avatar_url AS user_avatar_url
        FROM resolved_participant
        JOIN users ON users.id = resolved_participant.user_id
      `,
      [meetingId, currentUserId]
    );

    if (!reactivatedParticipant) {
      throw badRequest("Meeting participant could not be saved");
    }

    return reactivatedParticipant;
  }

  private async findParticipantSummary(
    executor: QueryOneExecutor,
    meetingId: string,
    currentUserId: string
  ): Promise<ParticipantRow | null> {
    return executor.queryOne<ParticipantRow>(
      `
        WITH participant_summary AS (
          SELECT
            meeting_id,
            user_id,
            MIN(joined_at) AS joined_at,
            CASE
              WHEN BOOL_OR(left_at IS NULL) THEN NULL
              ELSE MAX(left_at)
            END AS left_at,
            (
              ARRAY_AGG(
                id
                ORDER BY (left_at IS NULL) DESC, joined_at DESC, id DESC
              )
            )[1] AS id,
            (
              ARRAY_AGG(
                livekit_identity
                ORDER BY (left_at IS NULL) DESC, joined_at DESC, id DESC
              )
            )[1] AS livekit_identity
          FROM meeting_participants
          WHERE meeting_id = $1
            AND user_id = $2
          GROUP BY meeting_id, user_id
        )
        SELECT
          participant_summary.id,
          participant_summary.meeting_id,
          participant_summary.user_id,
          participant_summary.livekit_identity,
          participant_summary.joined_at,
          participant_summary.left_at,
          users.name AS user_name,
          users.avatar_url AS user_avatar_url
        FROM participant_summary
        JOIN users ON users.id = participant_summary.user_id
        LIMIT 1
      `,
      [meetingId, currentUserId]
    );
  }

  private async findActiveParticipant(
    executor: QueryOneExecutor,
    meetingId: string,
    currentUserId: string
  ): Promise<ParticipantRow | null> {
    return executor.queryOne<ParticipantRow>(
      `
        SELECT
          meeting_participants.id,
          meeting_participants.meeting_id,
          meeting_participants.user_id,
          meeting_participants.livekit_identity,
          meeting_participants.joined_at,
          meeting_participants.left_at,
          users.name AS user_name,
          users.avatar_url AS user_avatar_url
        FROM meeting_participants
        JOIN users ON users.id = meeting_participants.user_id
        WHERE meeting_participants.meeting_id = $1
          AND meeting_participants.user_id = $2
          AND meeting_participants.left_at IS NULL
        LIMIT 1
      `,
      [meetingId, currentUserId]
    );
  }

  private async findParticipantByLiveKitIdentity(
    executor: QueryOneExecutor,
    meetingId: string,
    liveKitIdentity: string,
    options: { lockParticipant?: boolean } = {}
  ): Promise<ParticipantRow | null> {
    return executor.queryOne<ParticipantRow>(
      `
        SELECT
          meeting_participants.id,
          meeting_participants.meeting_id,
          meeting_participants.user_id,
          meeting_participants.livekit_identity,
          meeting_participants.joined_at,
          meeting_participants.left_at,
          users.name AS user_name,
          users.avatar_url AS user_avatar_url
        FROM meeting_participants
        JOIN users
          ON users.id = meeting_participants.user_id
        WHERE meeting_participants.meeting_id = $1
          AND meeting_participants.livekit_identity = $2
          AND meeting_participants.left_at IS NULL
        LIMIT 1
        ${options.lockParticipant === true ? "FOR UPDATE OF meeting_participants" : ""}
      `,
      [meetingId, liveKitIdentity]
    );
  }

  private async assertActiveParticipant(
    executor: QueryOneExecutor,
    meetingId: string,
    currentUserId: string
  ): Promise<void> {
    const participant = await this.findActiveParticipant(
      executor,
      meetingId,
      currentUserId
    );

    if (!participant || participant.left_at !== null) {
      throw forbidden("Current user is not an active meeting participant");
    }
  }

  private async ensureWorkspaceRecordingConsent(
    executor: QueryOneExecutor,
    workspaceId: string,
    currentUserId: string,
    recordingConsent: RecordingConsentDraft | null
  ): Promise<void> {
    const existingConsent = await executor.queryOne<WorkspaceRecordingConsentRow>(
      `
        SELECT workspace_id, user_id, policy_version, accepted_at
        FROM workspace_recording_consents
        WHERE workspace_id = $1::uuid
          AND user_id = $2::uuid
          AND policy_version = $3
        LIMIT 1
      `,
      [workspaceId, currentUserId, WORKSPACE_RECORDING_CONSENT_POLICY_VERSION]
    );

    if (existingConsent) {
      return;
    }

    if (recordingConsent === null) {
      throw workspaceRecordingConsentRequired();
    }

    const insertedConsent = await executor.queryOne<WorkspaceRecordingConsentRow>(
      `
        INSERT INTO workspace_recording_consents (
          workspace_id,
          user_id,
          policy_version
        )
        VALUES ($1::uuid, $2::uuid, $3)
        ON CONFLICT (workspace_id, user_id, policy_version) DO NOTHING
        RETURNING workspace_id, user_id, policy_version, accepted_at
      `,
      [workspaceId, currentUserId, recordingConsent.policyVersion]
    );

    if (insertedConsent) {
      return;
    }

    const concurrentConsent = await executor.queryOne<WorkspaceRecordingConsentRow>(
      `
        SELECT workspace_id, user_id, policy_version, accepted_at
        FROM workspace_recording_consents
        WHERE workspace_id = $1::uuid
          AND user_id = $2::uuid
          AND policy_version = $3
        LIMIT 1
      `,
      [workspaceId, currentUserId, WORKSPACE_RECORDING_CONSENT_POLICY_VERSION]
    );

    if (!concurrentConsent) {
      throw workspaceRecordingConsentRequired();
    }
  }

  private async assertAllActiveParticipantsHaveRecordingConsent(
    executor: QueryOneExecutor,
    workspaceId: string,
    meetingId: string
  ): Promise<void> {
    const participantWithoutConsent =
      await executor.queryOne<MissingWorkspaceRecordingConsentRow>(
        `
          SELECT meeting_participants.user_id
          FROM meeting_participants
          WHERE meeting_participants.meeting_id = $1::uuid
            AND meeting_participants.left_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM workspace_recording_consents
              WHERE workspace_recording_consents.workspace_id = $2::uuid
                AND workspace_recording_consents.user_id = meeting_participants.user_id
                AND workspace_recording_consents.policy_version = $3
            )
          LIMIT 1
        `,
        [meetingId, workspaceId, WORKSPACE_RECORDING_CONSENT_POLICY_VERSION]
      );

    if (participantWithoutConsent) {
      throw workspaceRecordingConsentRequired();
    }
  }

  private async markParticipantLeft(
    executor: QueryOneExecutor,
    participantId: string
  ): Promise<ParticipantRow> {
    const participant = await executor.queryOne<ParticipantRow>(
      `
        WITH updated_participant AS (
          UPDATE meeting_participants
          SET
            left_at = now(),
            updated_at = now()
          WHERE id = $1
            AND left_at IS NULL
          RETURNING *
        )
        SELECT
          updated_participant.id,
          updated_participant.meeting_id,
          updated_participant.user_id,
          updated_participant.livekit_identity,
          updated_participant.joined_at,
          updated_participant.left_at,
          users.name AS user_name,
          users.avatar_url AS user_avatar_url
        FROM updated_participant
        JOIN users
          ON users.id = updated_participant.user_id
      `,
      [participantId]
    );

    if (!participant) {
      throw notFound("Participant not found");
    }

    return participant;
  }

  private async countActiveParticipants(
    executor: QueryOneExecutor,
    meetingId: string
  ): Promise<number> {
    const result = await executor.queryOne<ActiveParticipantCountRow>(
      `
        SELECT COUNT(*)::int AS active_participant_count
        FROM meeting_participants
        WHERE meeting_id = $1
          AND left_at IS NULL
      `,
      [meetingId]
    );

    return Number(result?.active_participant_count ?? 0);
  }

  private async endMeetingIfStillActive(
    executor: QueryOneExecutor,
    workspaceId: string,
    meetingId: string
  ): Promise<MeetingRow | null> {
    return executor.queryOne<MeetingRow>(
      `
        UPDATE meetings
        SET
          ended_at = now(),
          updated_at = now()
        WHERE workspace_id = $1
          AND id = $2
          AND ended_at IS NULL
        RETURNING *
      `,
      [workspaceId, meetingId]
    );
  }

  private async stopRunningRecording(
    executor: DatabaseTransaction,
    meeting: CurrentMeetingRow,
    recording = this.toCurrentRecordingRow(meeting)
  ): Promise<RecordingRow> {
    if (recording === null) {
      throw badRequest("No running recording found");
    }

    if (recording.livekit_egress_id === null) {
      return this.updateRecordingFailed(
        executor,
        recording,
        SAFE_EGRESS_STOP_ERROR
      );
    }

    try {
      const result = await this.liveKitEgressService.stopEgress(
        recording.livekit_egress_id
      );

      if (result.status === "FAILED") {
        return this.updateRecordingFailed(
          executor,
          recording,
          result.errorMessage ?? SAFE_EGRESS_STOP_ERROR
        );
      }

      return this.updateRecordingCompleted(executor, recording, result);
    } catch {
      return this.updateRecordingFailed(
        executor,
        recording,
        SAFE_EGRESS_STOP_ERROR
      );
    }
  }

  private async stopStartedEgressAfterPersistenceFailure(
    livekitEgressId: string
  ): Promise<void> {
    try {
      await this.liveKitEgressService.stopEgress(livekitEgressId);
    } catch {
      // Best effort cleanup: the original persistence error remains the API result.
    }
  }

  private async markRecordingFailedAfterPersistenceFailure(
    recording: RecordingRow
  ): Promise<RecordingRow | null> {
    try {
      return await this.database.transaction((transaction) =>
        this.updateRecordingFailed(
          transaction,
          recording,
          SAFE_EGRESS_START_ERROR
        )
      );
    } catch {
      // Best effort cleanup: the original persistence error remains the API result.
      return null;
    }
  }

  private buildAudioFileKey(
    workspaceId: string,
    meetingId: string,
    recordingId: string
  ): string {
    const prefix = (process.env.LIVEKIT_EGRESS_S3_PREFIX ?? "recordings/meetings")
      .trim()
      .replace(/^\/+|\/+$/g, "");

    return [
      prefix,
      `workspaces/${workspaceId}`,
      `meetings/${meetingId}`,
      `recordings/${recordingId}.mp3`
    ]
      .filter(Boolean)
      .join("/");
  }

  private normalizeStartMeetingBody(body: unknown): {
    roomKey: string;
    recordingConsent: RecordingConsentDraft | null;
  } {
    if (body === undefined || body === null) {
      return { roomKey: MAIN_MEETING_ROOM, recordingConsent: null };
    }

    if (typeof body !== "object" || Array.isArray(body)) {
      throw badRequest("Request body must be an object");
    }

    const draft = body as StartMeetingDraft;
    const recordingConsent = this.normalizeRecordingConsent(
      draft.recordingConsent
    );
    if (draft.roomKey === undefined || draft.roomKey === null) {
      return { roomKey: MAIN_MEETING_ROOM, recordingConsent };
    }

    if (typeof draft.roomKey !== "string") {
      throw badRequest("roomKey must be a string");
    }

    const roomKey = draft.roomKey.trim();
    if (roomKey !== MAIN_MEETING_ROOM) {
      throw badRequest("roomKey must be MAIN_MEETING_ROOM");
    }

    return { roomKey, recordingConsent };
  }

  private normalizeRecordingConsent(
    value: unknown
  ): RecordingConsentDraft | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== "object" || Array.isArray(value)) {
      throw badRequest("recordingConsent must be an object");
    }

    const draft = value as { accepted?: unknown; policyVersion?: unknown };
    if (draft.accepted !== true) {
      throw badRequest("recordingConsent.accepted must be true");
    }
    if (draft.policyVersion !== WORKSPACE_RECORDING_CONSENT_POLICY_VERSION) {
      throw badRequest(
        `recordingConsent.policyVersion must be ${WORKSPACE_RECORDING_CONSENT_POLICY_VERSION}`
      );
    }

    return {
      accepted: true,
      policyVersion: WORKSPACE_RECORDING_CONSENT_POLICY_VERSION
    };
  }

  private normalizeMeetingRoomName(body: unknown): string {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw badRequest("Request body must be an object");
    }

    const draft = body as MeetingRoomNameDraft;
    if (typeof draft.name !== "string") {
      throw badRequest("name must be a string");
    }

    const name = draft.name.trim().replace(/\s+/g, " ");
    if (!name) {
      throw badRequest("name is required");
    }
    if (name.length > MEETING_ROOM_NAME_MAX_LENGTH) {
      throw badRequest(
        `name must be at most ${MEETING_ROOM_NAME_MAX_LENGTH} characters`
      );
    }
    if (name === DEFAULT_MEETING_ROOM_NAME) {
      throw badRequest("Default meeting room name is reserved");
    }

    return name;
  }

  private mapMeetingRoom(
    room: MeetingRoomRow,
    isDefault = room.room_key === MAIN_MEETING_ROOM
  ): MeetingRoomPayload {
    return {
      id: room.id,
      workspaceId: room.workspace_id,
      roomKey: room.room_key,
      name: room.name,
      isDefault,
      createdById: room.created_by_id,
      createdAt: this.toIsoString(room.created_at),
      updatedAt: this.toIsoString(room.updated_at)
    };
  }

  private mapMeeting(meeting: MeetingRow): MeetingPayload {
    return {
      id: meeting.id,
      workspaceId: meeting.workspace_id,
      roomKey: meeting.room_key,
      livekitRoomName: meeting.livekit_room_name,
      createdById: meeting.created_by_id,
      endedById: meeting.ended_by_id,
      startedAt: this.toIsoString(meeting.started_at),
      endedAt: this.toNullableIsoString(meeting.ended_at),
      createdAt: this.toIsoString(meeting.created_at),
      updatedAt: this.toIsoString(meeting.updated_at)
    };
  }

  private mapNullableCurrentRecording(row: CurrentMeetingRow): RecordingPayload | null {
    const recording = this.toCurrentRecordingRow(row);
    if (recording === null) {
      return null;
    }

    return this.mapRecording(recording);
  }

  private toCurrentRecordingRow(row: CurrentMeetingRow): RecordingRow | null {
    if (row.recording_id === null || row.recording_meeting_id === null) {
      return null;
    }

    if (row.recording_started_at === null || row.recording_status === null) {
      return null;
    }

    return {
      id: row.recording_id,
      meeting_id: row.recording_meeting_id,
      livekit_egress_id: row.recording_livekit_egress_id,
      status: row.recording_status,
      audio_file_url: row.recording_audio_file_url,
      audio_file_key: row.recording_audio_file_key,
      duration_sec: row.recording_duration_sec,
      file_size_bytes: row.recording_file_size_bytes,
      started_at: row.recording_started_at,
      ended_at: row.recording_ended_at,
      error_message: row.recording_error_message
    };
  }

  private mapRecording(recording: RecordingRow): RecordingPayload {
    return {
      id: recording.id,
      meetingId: recording.meeting_id,
      status: recording.status,
      audioFileUrl: recording.audio_file_url,
      audioFileKey: recording.audio_file_key,
      durationSec: recording.duration_sec,
      fileSizeBytes:
        recording.file_size_bytes === null
          ? null
          : Number(recording.file_size_bytes),
      startedAt: this.toIsoString(recording.started_at),
      endedAt: this.toNullableIsoString(recording.ended_at),
      errorMessage: recording.error_message
    };
  }

  private mapStartMeeting(
    row: StartMeetingRow,
    livekit: LiveKitJoinPayload
  ): StartMeetingPayload {
    return {
      meeting: {
        id: row.meeting_id,
        workspaceId: row.meeting_workspace_id,
        roomKey: row.meeting_room_key,
        livekitRoomName: row.meeting_livekit_room_name,
        createdById: row.meeting_created_by_id,
        endedById: row.meeting_ended_by_id,
        startedAt: this.toIsoString(row.meeting_started_at),
        endedAt: this.toNullableIsoString(row.meeting_ended_at),
        createdAt: this.toIsoString(row.meeting_created_at),
        updatedAt: this.toIsoString(row.meeting_updated_at)
      },
      participant: {
        id: row.participant_id,
        meetingId: row.participant_meeting_id,
        userId: row.participant_user_id,
        livekitIdentity: row.participant_livekit_identity,
        joinedAt: this.toIsoString(row.participant_joined_at),
        leftAt: this.toNullableIsoString(row.participant_left_at),
        isActive: row.participant_left_at === null,
        user: {
          id: row.participant_user_id,
          name: row.participant_user_name,
          avatarUrl: row.participant_user_avatar_url
        }
      },
      livekit,
      currentRecording: null
    };
  }

  private mapParticipant(participant: ParticipantRow): ParticipantPayload {
    return {
      id: participant.id,
      meetingId: participant.meeting_id,
      userId: participant.user_id,
      livekitIdentity: participant.livekit_identity,
      joinedAt: this.toIsoString(participant.joined_at),
      leftAt: this.toNullableIsoString(participant.left_at),
      isActive: participant.left_at === null,
      user: {
        id: participant.user_id,
        name: participant.user_name,
        avatarUrl: participant.user_avatar_url
      }
    };
  }

  private isConstraintError(error: unknown, constraint: string): boolean {
    const candidate = error as { code?: unknown; constraint?: unknown };
    return (
      candidate.code === UNIQUE_VIOLATION_CODE &&
      candidate.constraint === constraint
    );
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  private toNullableIsoString(value: Date | string | null): string | null {
    return value === null ? null : this.toIsoString(value);
  }
}
