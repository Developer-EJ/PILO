import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
  JoinVoiceSessionRequestDto,
  UpdateVoiceSessionRecordingStatusRequestDto,
  UpdateVoiceRoomStatusRequestDto,
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

  joinVoiceSession(
    voiceRoomId: string,
    requestBody: JoinVoiceSessionRequestDto,
  ): VoiceSessionResponseDto {
    const voiceRoom = this.requireVoiceRoom(voiceRoomId);

    this.assertVoiceRoomActive(voiceRoom);

    const memberId = this.resolveWorkspaceMemberId(
      voiceRoom.workspaceId,
      requestBody.memberId,
    );
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

  private resolveWorkspaceMemberId(
    workspaceId: string,
    value: unknown,
  ): string {
    const memberId =
      value === undefined || value === null
        ? this.currentMemberAdapter.getCurrentMember(workspaceId).id
        : this.requireNonEmptyString(value, "memberId");
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
}
