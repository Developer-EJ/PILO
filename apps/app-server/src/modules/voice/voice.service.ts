import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Buffer } from "node:buffer";
import {
  CURRENT_MEMBER_ADAPTER,
  CurrentMemberAdapter,
} from "../meeting/adapters/current-member.adapter";
import { MeetingService } from "../meeting/meeting.service";
import {
  VOICE_ROOM_PROVIDER,
  VoiceRoomProvider,
} from "./adapters/voice-room-provider.adapter";
import {
  SubmitVoiceAudioChunkRequestDto,
  UpdateVoiceSessionRecordingStatusRequestDto,
  UpdateVoiceRoomStatusRequestDto,
  VoiceAudioTranscriptResponseDto,
  VoiceRoomResponseDto,
  VoiceSessionResponseDto,
  VoiceScaffoldResponseDto,
} from "./dto/voice-room-response.dto";
import {
  VOICE_REPOSITORY,
  VoiceRepository,
} from "./repositories/voice.repository";
import {
  VOICE_SESSION_RECORDING_STATUS_VALUES,
  VOICE_ROOM_STATUS_VALUES,
  VoiceRoomRecord,
  VoiceRoomStatus,
  VoiceSessionRecord,
  VoiceSessionRecordingStatus,
} from "./types/voice.types";

@Injectable()
export class VoiceService {
  constructor(
    @Inject(VOICE_REPOSITORY)
    private readonly voiceRepository: VoiceRepository,
    @Inject(VOICE_ROOM_PROVIDER)
    private readonly voiceRoomProvider: VoiceRoomProvider,
    private readonly meetingService: MeetingService,
    @Inject(CURRENT_MEMBER_ADAPTER)
    private readonly currentMemberAdapter: CurrentMemberAdapter,
  ) {}

  getScaffoldStatus(): VoiceScaffoldResponseDto {
    return {
      module: "voice",
      repositoryMode: this.voiceRepository.mode,
    };
  }

  createVoiceRoom(
    workspaceId: string,
    meetingId: string,
  ): VoiceRoomResponseDto {
    const meeting = this.meetingService.getMeetingForWorkspace(
      this.requireNonEmptyString(workspaceId, "workspaceId"),
      this.requireNonEmptyString(meetingId, "meetingId"),
    );
    const existingVoiceRoom = this.voiceRepository.findVoiceRoomByMeetingId(
      meeting.id,
    );

    if (existingVoiceRoom) {
      return existingVoiceRoom;
    }

    return this.voiceRepository.createVoiceRoom({
      workspaceId: meeting.workspaceId,
      meetingId: meeting.id,
      livekitRoomName: this.voiceRoomProvider.createRoomName({
        workspaceId: meeting.workspaceId,
        meetingId: meeting.id,
      }),
    });
  }

  getVoiceRoom(voiceRoomId: string): VoiceRoomResponseDto {
    return this.requireVoiceRoom(voiceRoomId);
  }

  getVoiceRoomForMeeting(
    workspaceId: string,
    meetingId: string,
  ): VoiceRoomResponseDto {
    const meeting = this.meetingService.getMeetingForWorkspace(
      this.requireNonEmptyString(workspaceId, "workspaceId"),
      this.requireNonEmptyString(meetingId, "meetingId"),
    );
    const voiceRoom = this.voiceRepository.findVoiceRoomByMeetingId(meeting.id);

    if (!voiceRoom) {
      throw new NotFoundException("Voice room not found for meeting");
    }

    return voiceRoom;
  }

  updateVoiceRoomStatus(
    voiceRoomId: string,
    requestBody: UpdateVoiceRoomStatusRequestDto,
  ): VoiceRoomResponseDto {
    const voiceRoom = this.requireVoiceRoom(voiceRoomId);

    return this.voiceRepository.updateVoiceRoom(voiceRoom.id, {
      status: this.parseVoiceRoomStatus(requestBody.status),
      updatedAt: new Date().toISOString(),
    });
  }

  joinVoiceSession(voiceRoomId: string): VoiceSessionResponseDto {
    const voiceRoom = this.requireVoiceRoom(voiceRoomId);

    this.assertVoiceRoomActive(voiceRoom);

    const memberId = this.resolveWorkspaceMemberId(voiceRoom.workspaceId);
    const existingActiveSession =
      this.voiceRepository.findActiveVoiceSessionByMember(
        voiceRoom.id,
        memberId,
      );

    if (existingActiveSession) {
      throw new BadRequestException(
        "member already has an active voice session",
      );
    }

    return this.voiceRepository.createVoiceSession({
      voiceRoomId: voiceRoom.id,
      meetingId: voiceRoom.meetingId,
      memberId,
    });
  }

  listVoiceSessions(voiceRoomId: string): VoiceSessionResponseDto[] {
    const voiceRoom = this.requireVoiceRoom(voiceRoomId);

    return this.voiceRepository.listVoiceSessionsByVoiceRoom(voiceRoom.id);
  }

  leaveVoiceSession(voiceSessionId: string): VoiceSessionResponseDto {
    const voiceSession = this.requireVoiceSession(voiceSessionId);
    const now = new Date().toISOString();

    this.assertVoiceSessionActive(voiceSession, "leave");

    return this.voiceRepository.updateVoiceSession(voiceSession.id, {
      endedAt: now,
      updatedAt: now,
    });
  }

  updateVoiceSessionRecordingStatus(
    voiceSessionId: string,
    requestBody: UpdateVoiceSessionRecordingStatusRequestDto,
  ): VoiceSessionResponseDto {
    const voiceSession = this.requireVoiceSession(voiceSessionId);

    this.assertVoiceSessionActive(voiceSession, "update recording status");

    return this.voiceRepository.updateVoiceSession(voiceSession.id, {
      recordingStatus: this.parseVoiceSessionRecordingStatus(
        requestBody.recordingStatus,
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  submitAudioChunk(
    voiceSessionId: string,
    requestBody: SubmitVoiceAudioChunkRequestDto,
  ): VoiceAudioTranscriptResponseDto {
    const voiceSession = this.requireVoiceSession(voiceSessionId);

    this.assertVoiceSessionActive(voiceSession, "submit audio chunks for");

    if (!voiceSession.meetingId) {
      throw new BadRequestException(
        "Voice session must belong to a meeting for STT transcript creation",
      );
    }

    const sequence = this.requireNonNegativeInteger(
      requestBody.sequence,
      "sequence",
    );
    const mimeType = this.requireNonEmptyString(
      requestBody.mimeType,
      "mimeType",
    );
    const audioByteLength = this.parseAudioBase64(requestBody.audioBase64);
    const startedAt = this.optionalIsoDateTime(
      requestBody.capturedStartedAt,
      "capturedStartedAt",
    );
    const endedAt = this.optionalIsoDateTime(
      requestBody.capturedEndedAt,
      "capturedEndedAt",
    );

    this.validateTimeRange(startedAt, endedAt);

    const transcriptSegment = this.meetingService.createTranscriptSegment(
      voiceSession.meetingId,
      {
        speakerMemberId: voiceSession.memberId,
        source: "stt",
        body: this.createLocalSttTranscript({
          audioByteLength,
          mimeType,
          sequence,
        }),
        startedAt,
        endedAt,
      },
    );
    const updatedVoiceSession = this.voiceRepository.updateVoiceSession(
      voiceSession.id,
      {
        recordingStatus: "completed",
        updatedAt: new Date().toISOString(),
      },
    );

    return {
      voiceSession: updatedVoiceSession,
      transcriptSegment,
    };
  }

  private requireVoiceRoom(voiceRoomId: string): VoiceRoomRecord {
    const voiceRoom = this.voiceRepository.findVoiceRoomById(
      this.requireNonEmptyString(voiceRoomId, "voiceRoomId"),
    );

    if (!voiceRoom) {
      throw new NotFoundException("Voice room not found");
    }

    return voiceRoom;
  }

  private requireVoiceSession(voiceSessionId: string): VoiceSessionRecord {
    const voiceSession = this.voiceRepository.findVoiceSessionById(
      this.requireNonEmptyString(voiceSessionId, "voiceSessionId"),
    );

    if (!voiceSession) {
      throw new NotFoundException("Voice session not found");
    }

    return voiceSession;
  }

  private parseVoiceRoomStatus(value: unknown): VoiceRoomStatus {
    if (
      typeof value === "string" &&
      VOICE_ROOM_STATUS_VALUES.includes(value as VoiceRoomStatus)
    ) {
      return value as VoiceRoomStatus;
    }

    throw new BadRequestException(
      `status must be one of: ${VOICE_ROOM_STATUS_VALUES.join(", ")}`,
    );
  }

  private parseVoiceSessionRecordingStatus(
    value: unknown,
  ): VoiceSessionRecordingStatus {
    if (
      typeof value === "string" &&
      VOICE_SESSION_RECORDING_STATUS_VALUES.includes(
        value as VoiceSessionRecordingStatus,
      )
    ) {
      return value as VoiceSessionRecordingStatus;
    }

    throw new BadRequestException(
      `recordingStatus must be one of: ${VOICE_SESSION_RECORDING_STATUS_VALUES.join(", ")}`,
    );
  }

  private assertVoiceRoomActive(voiceRoom: VoiceRoomRecord): void {
    if (voiceRoom.status !== "active") {
      throw new BadRequestException("Voice room must be active");
    }
  }

  private assertVoiceSessionActive(
    voiceSession: VoiceSessionRecord,
    actionName: string,
  ): void {
    if (voiceSession.endedAt !== null) {
      throw new BadRequestException(`Cannot ${actionName} ended voice session`);
    }
  }

  private resolveWorkspaceMemberId(workspaceId: string): string {
    const memberId = this.currentMemberAdapter.getCurrentMember(workspaceId).id;
    const workspaceMember = this.currentMemberAdapter.getWorkspaceMember(
      workspaceId,
      memberId,
    );

    if (!workspaceMember) {
      throw new BadRequestException(
        "memberId must belong to voice room workspace",
      );
    }

    return workspaceMember.id;
  }

  private requireNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    throw new BadRequestException(`${fieldName} must be a non-empty string`);
  }

  private requireNonNegativeInteger(value: unknown, fieldName: string): number {
    if (Number.isInteger(value) && Number(value) >= 0) {
      return Number(value);
    }

    throw new BadRequestException(`${fieldName} must be a non-negative integer`);
  }

  private optionalIsoDateTime(
    value: unknown,
    fieldName: string,
  ): string | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if (typeof value !== "string") {
      throw new BadRequestException(`${fieldName} must be an ISO datetime`);
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`${fieldName} must be an ISO datetime`);
    }

    return parsedDate.toISOString();
  }

  private validateTimeRange(startedAt: string | null, endedAt: string | null) {
    if (
      startedAt &&
      endedAt &&
      new Date(startedAt).getTime() > new Date(endedAt).getTime()
    ) {
      throw new BadRequestException(
        "capturedStartedAt must be before capturedEndedAt",
      );
    }
  }

  private parseAudioBase64(value: unknown): number {
    const audioBase64 = this.requireNonEmptyString(value, "audioBase64");

    if (
      audioBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)
    ) {
      throw new BadRequestException("audioBase64 must be valid base64 audio");
    }

    const audioBytes = Buffer.from(audioBase64, "base64");
    const normalizedInput = audioBase64.replace(/=+$/, "");
    const normalizedOutput = audioBytes.toString("base64").replace(/=+$/, "");

    if (audioBytes.length === 0 || normalizedInput !== normalizedOutput) {
      throw new BadRequestException("audioBase64 must be valid base64 audio");
    }

    return audioBytes.length;
  }

  private createLocalSttTranscript(input: {
    audioByteLength: number;
    mimeType: string;
    sequence: number;
  }) {
    return `Local STT chunk ${input.sequence} captured ${input.audioByteLength} bytes of ${input.mimeType} audio.`;
  }
}
