import { Injectable } from "@nestjs/common";
import {
  MeetingReportWorkflowClient,
  MeetingReportWorkflowInput,
  MeetingReportWorkflowOutput,
} from "./meeting-report-workflow.adapter";

@Injectable()
export class MockMeetingReportWorkflowClient
  implements MeetingReportWorkflowClient
{
  generateReport(
    input: MeetingReportWorkflowInput,
  ): MeetingReportWorkflowOutput {
    const sourceCount = input.memoBodies.length + input.transcriptBodies.length;

    if (sourceCount === 0) {
      return {
        summary: `${input.meetingTitle} 회의록 초안입니다.`,
      };
    }

    return {
      summary: `${input.meetingTitle} 회의에서 ${sourceCount}개 기록을 정리했다.`,
    };
  }
}
