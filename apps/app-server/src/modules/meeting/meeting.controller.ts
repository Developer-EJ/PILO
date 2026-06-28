import { Controller } from "@nestjs/common";
import { MeetingScaffoldResponseDto } from "./dto/meeting-scaffold-response.dto";
import { MeetingService } from "./meeting.service";

@Controller("api/meetings")
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  getScaffoldStatus(): MeetingScaffoldResponseDto {
    return this.meetingService.getScaffoldStatus();
  }
}
