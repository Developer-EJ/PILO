import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  JoinVoiceSessionRequestDto,
  UpdateVoiceSessionRecordingStatusRequestDto,
  UpdateVoiceRoomStatusRequestDto,
  VoiceRoomResponseDto,
  VoiceSessionResponseDto,
  VoiceScaffoldResponseDto,
} from "./dto/voice-room-response.dto";
import { VoiceService } from "./voice.service";

@Controller("api")
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  getScaffoldStatus(): VoiceScaffoldResponseDto {
    return this.voiceService.getScaffoldStatus();
  }

  @Post("workspaces/:workspaceId/meetings/:meetingId/voice-room")
  createVoiceRoom(
    @Param("workspaceId") workspaceId: string,
    @Param("meetingId") meetingId: string,
  ): VoiceRoomResponseDto {
    return this.voiceService.createVoiceRoom(workspaceId, meetingId);
  }

  @Get("voice-rooms/:voiceRoomId")
  getVoiceRoom(
    @Param("voiceRoomId") voiceRoomId: string,
  ): VoiceRoomResponseDto {
    return this.voiceService.getVoiceRoom(voiceRoomId);
  }

  @Get("workspaces/:workspaceId/meetings/:meetingId/voice-room")
  getVoiceRoomForMeeting(
    @Param("workspaceId") workspaceId: string,
    @Param("meetingId") meetingId: string,
  ): VoiceRoomResponseDto {
    return this.voiceService.getVoiceRoomForMeeting(workspaceId, meetingId);
  }

  @Patch("voice-rooms/:voiceRoomId/status")
  updateVoiceRoomStatus(
    @Param("voiceRoomId") voiceRoomId: string,
    @Body() requestBody: UpdateVoiceRoomStatusRequestDto,
  ): VoiceRoomResponseDto {
    return this.voiceService.updateVoiceRoomStatus(voiceRoomId, requestBody);
  }

  @Post("voice-rooms/:voiceRoomId/sessions")
  joinVoiceSession(
    @Param("voiceRoomId") voiceRoomId: string,
    @Body() requestBody: JoinVoiceSessionRequestDto,
  ): VoiceSessionResponseDto {
    return this.voiceService.joinVoiceSession(voiceRoomId, requestBody);
  }

  @Get("voice-rooms/:voiceRoomId/sessions")
  listVoiceSessions(
    @Param("voiceRoomId") voiceRoomId: string,
  ): VoiceSessionResponseDto[] {
    return this.voiceService.listVoiceSessions(voiceRoomId);
  }

  @Patch("voice-sessions/:voiceSessionId/leave")
  leaveVoiceSession(
    @Param("voiceSessionId") voiceSessionId: string,
  ): VoiceSessionResponseDto {
    return this.voiceService.leaveVoiceSession(voiceSessionId);
  }

  @Patch("voice-sessions/:voiceSessionId/recording-status")
  updateVoiceSessionRecordingStatus(
    @Param("voiceSessionId") voiceSessionId: string,
    @Body() requestBody: UpdateVoiceSessionRecordingStatusRequestDto,
  ): VoiceSessionResponseDto {
    return this.voiceService.updateVoiceSessionRecordingStatus(
      voiceSessionId,
      requestBody,
    );
  }
}
