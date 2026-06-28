import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  CreateMeetingRequestDto,
  MeetingResponseDto,
  MeetingScaffoldResponseDto,
  UpdateMeetingStatusRequestDto,
} from "./dto/meeting-scaffold-response.dto";
import { MeetingService } from "./meeting.service";

@Controller("api")
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  getScaffoldStatus(): MeetingScaffoldResponseDto {
    return this.meetingService.getScaffoldStatus();
  }

  @Post("workspaces/:workspaceId/meetings")
  createMeeting(
    @Param("workspaceId") workspaceId: string,
    @Body() requestBody: CreateMeetingRequestDto,
  ): MeetingResponseDto {
    return this.meetingService.createMeeting(workspaceId, requestBody);
  }

  @Get("workspaces/:workspaceId/meetings")
  listMeetings(
    @Param("workspaceId") workspaceId: string,
  ): MeetingResponseDto[] {
    return this.meetingService.listMeetings(workspaceId);
  }

  @Get("meetings/:meetingId")
  getMeeting(@Param("meetingId") meetingId: string): MeetingResponseDto {
    return this.meetingService.getMeeting(meetingId);
  }

  @Patch("meetings/:meetingId/status")
  updateMeetingStatus(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: UpdateMeetingStatusRequestDto,
  ): MeetingResponseDto {
    return this.meetingService.updateMeetingStatus(meetingId, requestBody);
  }
}
