import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MeetingService } from "../meeting/meeting.service";
import {
  VOICE_ROOM_PROVIDER,
  VoiceRoomProvider,
} from "./adapters/voice-room-provider.adapter";
import {
  UpdateVoiceRoomStatusRequestDto,
  VoiceRoomResponseDto,
  VoiceScaffoldResponseDto,
} from "./dto/voice-room-response.dto";
import {
  VOICE_REPOSITORY,
  VoiceRepository,
} from "./repositories/voice.repository";
import {
  VOICE_ROOM_STATUS_VALUES,
  VoiceRoomRecord,
  VoiceRoomStatus,
} from "./types/voice.types";

@Injectable()
export class VoiceService {
  constructor(
    @Inject(VOICE_REPOSITORY)
    private readonly voiceRepository: VoiceRepository,
    @Inject(VOICE_ROOM_PROVIDER)
    private readonly voiceRoomProvider: VoiceRoomProvider,
    private readonly meetingService: MeetingService,
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

  private requireVoiceRoom(voiceRoomId: string): VoiceRoomRecord {
    const voiceRoom = this.voiceRepository.findVoiceRoomById(
      this.requireNonEmptyString(voiceRoomId, "voiceRoomId"),
    );

    if (!voiceRoom) {
      throw new NotFoundException("Voice room not found");
    }

    return voiceRoom;
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

  private requireNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    throw new BadRequestException(`${fieldName} must be a non-empty string`);
  }
}
