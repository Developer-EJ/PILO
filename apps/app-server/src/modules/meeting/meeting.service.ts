import { Inject, Injectable } from "@nestjs/common";
import { MeetingScaffoldResponseDto } from "./dto/meeting-scaffold-response.dto";
import {
  MEETING_REPOSITORY,
  MeetingRepository,
} from "./repositories/meeting.repository";

@Injectable()
export class MeetingService {
  constructor(
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepository: MeetingRepository,
  ) {}

  getScaffoldStatus(): MeetingScaffoldResponseDto {
    return {
      module: "meeting",
      repositoryMode: this.meetingRepository.mode,
      meetingStatusValues: this.meetingRepository.listMeetingStatusValues(),
    };
  }
}
