import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  UpdateVoiceRoomStatusRequestDto,
  VoiceRoomResponseDto,
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
}
