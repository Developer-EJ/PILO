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
  STT_PROVIDER,
  SttProvider,
} from "./adapters/stt-provider.adapter";
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
    @Inject(STT_PROVIDER)
    private readonly sttProvider: SttProvider,
  ) {}

  getScaffoldStatus(): VoiceScaffoldResponseDto {
    return {
      module: "voice",
      repositoryMode: this.voiceRepository.mode,
    };
  }

  async createVoiceRoom(
    workspaceId: string,
    meetingId: string,
  ): Promise<VoiceRoomResponseDto> {
    const meeting = await this.meetingService.getMeetingForWorkspace(
      this.requireNonEmptyString(workspaceId, "workspaceId"),
      this.requireNonEmptyString(meetingId, "meetingId"),
    );
    const existingVoiceRoom = await this.voiceRepository.findVoiceRoomByMeetingId(
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

  async getVoiceRoom(voiceRoomId: string): Promise<VoiceRoomResponseDto> {
    return this.requireVoiceRoom(voiceRoomId);
  }

  async getVoiceRoomForMeeting(
    workspaceId: string,
    meetingId: string,
  ): Promise<VoiceRoomResponseDto> {
    const meeting = await this.meetingService.getMeetingForWorkspace(
      this.requireNonEmptyString(workspaceId, "workspaceId"),
      this.requireNonEmptyString(meetingId, "meetingId"),
    );
    const voiceRoom = await this.voiceRepository.findVoiceRoomByMeetingId(
      meeting.id,
    );

    if (!voiceRoom) {
      throw new NotFoundException("Voice room not found for meeting");
    }

    return voiceRoom;
  }

  async resolveRouteWorkspaceId(input: {
    workspaceId?: string;
    meetingId?: string;
    voiceRoomId?: string;
    voiceSessionId?: string;
  }): Promise<string> {
    if (input.voiceSessionId) {
      const voiceSession = await this.requireVoiceSession(input.voiceSessionId);
      const voiceRoom = await this.requireVoiceRoom(voiceSession.voiceRoomId);

      return this.requireMatchingRouteWorkspace(
        input.workspaceId,
        voiceRoom.workspaceId,
        "Voice session not found in workspace",
      );
    }

    if (input.voiceRoomId) {
      const voiceRoom = await this.requireVoiceRoom(input.voiceRoomId);

      return this.requireMatchingRouteWorkspace(
        input.workspaceId,
        voiceRoom.workspaceId,
        "Voice room not found in workspace",
      );
    }

    if (input.meetingId) {
      const meeting = input.workspaceId
        ? await this.meetingService.getMeetingForWorkspace(
            input.workspaceId,
            input.meetingId,
          )
        : await this.meetingService.getMeeting(input.meetingId);

      return meeting.workspaceId;
    }

    if (input.workspaceId) {
      return this.requireNonEmptyString(input.workspaceId, "workspaceId");
    }

    throw new BadRequestException(
      "workspaceId, meetingId, voiceRoomId, or voiceSessionId is required",
    );
  }

  async updateVoiceRoomStatus(
    voiceRoomId: string,
    requestBody: UpdateVoiceRoomStatusRequestDto,
  ): Promise<VoiceRoomResponseDto> {
    const voiceRoom = await this.requireVoiceRoom(voiceRoomId);

    return this.voiceRepository.updateVoiceRoom(voiceRoom.id, {
      status: this.parseVoiceRoomStatus(requestBody.status),
      updatedAt: new Date().toISOString(),
    });
  }

  async joinVoiceSession(
    voiceRoomId: string,
  ): Promise<VoiceSessionResponseDto> {
    const voiceRoom = await this.requireVoiceRoom(voiceRoomId);

    this.assertVoiceRoomActive(voiceRoom);

    const memberId = this.resolveWorkspaceMemberId(voiceRoom.workspaceId);
    const existingActiveSession =
      await this.voiceRepository.findActiveVoiceSessionByMember(
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

  async listVoiceSessions(
    voiceRoomId: string,
  ): Promise<VoiceSessionResponseDto[]> {
    const voiceRoom = await this.requireVoiceRoom(voiceRoomId);

    return this.voiceRepository.listVoiceSessionsByVoiceRoom(voiceRoom.id);
  }

  async leaveVoiceSession(
    voiceSessionId: string,
  ): Promise<VoiceSessionResponseDto> {
    const voiceSession = await this.requireVoiceSession(voiceSessionId);
    const now = new Date().toISOString();

    this.assertVoiceSessionActive(voiceSession, "leave");

    return this.voiceRepository.updateVoiceSession(voiceSession.id, {
      endedAt: now,
      updatedAt: now,
    });
  }

  async updateVoiceSessionRecordingStatus(
    voiceSessionId: string,
    requestBody: UpdateVoiceSessionRecordingStatusRequestDto,
  ): Promise<VoiceSessionResponseDto> {
    const voiceSession = await this.requireVoiceSession(voiceSessionId);

    this.assertVoiceSessionActive(voiceSession, "update recording status");

    return this.voiceRepository.updateVoiceSession(voiceSession.id, {
      recordingStatus: this.parseVoiceSessionRecordingStatus(
        requestBody.recordingStatus,
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  async submitAudioChunk(
    voiceSessionId: string,
    requestBody: SubmitVoiceAudioChunkRequestDto,
  ): Promise<VoiceAudioTranscriptResponseDto> {
    const voiceSession = await this.requireVoiceSession(voiceSessionId);

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
    const audioBase64 = this.requireNonEmptyString(
      requestBody.audioBase64,
      "audioBase64",
    );
    const audioByteLength = this.parseAudioBase64(audioBase64);
    const startedAt = this.optionalIsoDateTime(
      requestBody.capturedStartedAt,
      "capturedStartedAt",
    );
    const endedAt = this.optionalIsoDateTime(
      requestBody.capturedEndedAt,
      "capturedEndedAt",
    );

    this.validateTimeRange(startedAt, endedAt);

    const transcription = await this.sttProvider.transcribeAudioChunk({
      voiceSessionId: voiceSession.id,
      meetingId: voiceSession.meetingId,
      speakerMemberId: voiceSession.memberId,
      sequence,
      mimeType,
      audioBase64,
      audioByteLength,
      capturedStartedAt: startedAt,
      capturedEndedAt: endedAt,
    });
    const transcriptSegment = await this.meetingService.createTranscriptSegment(
      voiceSession.meetingId,
      {
        speakerMemberId: voiceSession.memberId,
        source: "stt",
        body: this.requireNonEmptyString(transcription.text, "transcriptText"),
        startedAt,
        endedAt,
      },
    );
    const updatedVoiceSession = await this.voiceRepository.updateVoiceSession(
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

  private async requireVoiceRoom(
    voiceRoomId: string,
  ): Promise<VoiceRoomRecord> {
    const voiceRoom = await this.voiceRepository.findVoiceRoomById(
      this.requireNonEmptyString(voiceRoomId, "voiceRoomId"),
    );

    if (!voiceRoom) {
      throw new NotFoundException("Voice room not found");
    }

    return voiceRoom;
  }

  private async requireVoiceSession(
    voiceSessionId: string,
  ): Promise<VoiceSessionRecord> {
    const voiceSession = await this.voiceRepository.findVoiceSessionById(
      this.requireNonEmptyString(voiceSessionId, "voiceSessionId"),
    );

    if (!voiceSession) {
      throw new NotFoundException("Voice session not found");
    }

    return voiceSession;
  }

  private requireMatchingRouteWorkspace(
    routeWorkspaceId: string | undefined,
    actualWorkspaceId: string,
    mismatchMessage: string,
  ): string {
    if (
      routeWorkspaceId &&
      this.requireNonEmptyString(routeWorkspaceId, "workspaceId") !==
        actualWorkspaceId
    ) {
      throw new NotFoundException(mismatchMessage);
    }

    return actualWorkspaceId;
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

    throw new BadRequestException(
      `${fieldName} must be a non-negative integer`,
    );
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
}
