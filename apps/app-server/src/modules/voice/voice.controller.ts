import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  SubmitVoiceAudioChunkRequestDto,
  UpdateVoiceSessionRecordingStatusRequestDto,
  UpdateVoiceRoomStatusRequestDto,
  VoiceAudioTranscriptResponseDto,
  VoiceRoomResponseDto,
  VoiceSessionResponseDto,
  VoiceScaffoldResponseDto,
} from "./dto/voice-room-response.dto";
import { VoiceRouteGuard } from "./voice-route.guard";
import { VoiceService } from "./voice.service";

@Controller()
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Get("voice")
  getScaffoldStatus(): VoiceScaffoldResponseDto {
    return this.voiceService.getScaffoldStatus();
  }

  @Post("workspaces/:workspaceId/meetings/:meetingId/voice-room")
  @UseGuards(VoiceRouteGuard)
  createVoiceRoom(
    @Param("workspaceId") workspaceId: string,
    @Param("meetingId") meetingId: string,
  ): VoiceRoomResponseDto {
    return this.voiceService.createVoiceRoom(workspaceId, meetingId);
  }

  @Get("voice-rooms/:voiceRoomId")
  @UseGuards(VoiceRouteGuard)
  getVoiceRoom(
    @Param("voiceRoomId") voiceRoomId: string,
  ): VoiceRoomResponseDto {
    return this.voiceService.getVoiceRoom(voiceRoomId);
  }

  @Get("workspaces/:workspaceId/meetings/:meetingId/voice-room")
  @UseGuards(VoiceRouteGuard)
  getVoiceRoomForMeeting(
    @Param("workspaceId") workspaceId: string,
    @Param("meetingId") meetingId: string,
  ): VoiceRoomResponseDto {
    return this.voiceService.getVoiceRoomForMeeting(workspaceId, meetingId);
  }

  @Patch("voice-rooms/:voiceRoomId/status")
  @UseGuards(VoiceRouteGuard)
  updateVoiceRoomStatus(
    @Param("voiceRoomId") voiceRoomId: string,
    @Body() requestBody: UpdateVoiceRoomStatusRequestDto,
  ): VoiceRoomResponseDto {
    return this.voiceService.updateVoiceRoomStatus(voiceRoomId, requestBody);
  }

  @Post("voice-rooms/:voiceRoomId/sessions")
  @UseGuards(VoiceRouteGuard)
  joinVoiceSession(
    @Param("voiceRoomId") voiceRoomId: string,
  ): VoiceSessionResponseDto {
    return this.voiceService.joinVoiceSession(voiceRoomId);
  }

  @Get("voice-rooms/:voiceRoomId/sessions")
  @UseGuards(VoiceRouteGuard)
  listVoiceSessions(
    @Param("voiceRoomId") voiceRoomId: string,
  ): VoiceSessionResponseDto[] {
    return this.voiceService.listVoiceSessions(voiceRoomId);
  }

  @Patch("voice-sessions/:voiceSessionId/leave")
  @UseGuards(VoiceRouteGuard)
  leaveVoiceSession(
    @Param("voiceSessionId") voiceSessionId: string,
  ): VoiceSessionResponseDto {
    return this.voiceService.leaveVoiceSession(voiceSessionId);
  }

  @Patch("voice-sessions/:voiceSessionId/recording-status")
  @UseGuards(VoiceRouteGuard)
  updateVoiceSessionRecordingStatus(
    @Param("voiceSessionId") voiceSessionId: string,
    @Body() requestBody: UpdateVoiceSessionRecordingStatusRequestDto,
  ): VoiceSessionResponseDto {
    return this.voiceService.updateVoiceSessionRecordingStatus(
      voiceSessionId,
      requestBody,
    );
  }

  @Post("voice-sessions/:voiceSessionId/audio-chunks")
  @UseGuards(VoiceRouteGuard)
  submitAudioChunk(
    @Param("voiceSessionId") voiceSessionId: string,
    @Body() requestBody: SubmitVoiceAudioChunkRequestDto,
  ): VoiceAudioTranscriptResponseDto {
    return this.voiceService.submitAudioChunk(voiceSessionId, requestBody);
  }
}
