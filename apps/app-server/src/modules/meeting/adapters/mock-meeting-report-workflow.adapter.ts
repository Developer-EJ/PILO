import { Injectable } from "@nestjs/common";
import {
  MeetingReportWorkflowClient,
  MeetingReportWorkflowInput,
  MeetingReportWorkflowOutput,
  MeetingReportWorkflowTrace,
} from "./meeting-report-workflow.adapter";

@Injectable()
export class MockMeetingReportWorkflowClient
  implements MeetingReportWorkflowClient
{
  generateReport(
    input: MeetingReportWorkflowInput,
  ): MeetingReportWorkflowOutput {
    const sourceCount = input.memoBodies.length + input.transcriptBodies.length;
    const trace: MeetingReportWorkflowTrace[] = [
      {
        stepName: "collect_sources",
        message: `${sourceCount}개 회의 기록을 수집했다.`,
        metadata: {
          memoCount: input.memoBodies.length,
          transcriptCount: input.transcriptBodies.length,
        },
      },
      {
        stepName: "build_report_artifacts",
        message: "deterministic mock으로 회의록 artifact를 생성했다.",
        metadata: {
          usesLlm: false,
        },
      },
    ];

    if (sourceCount === 0) {
      return {
        summary: `${input.meetingTitle} 회의록 초안입니다.`,
        decisions: [],
        risks: [],
        nextAgendas: [],
        actionItems: [],
        trace,
        error: null,
      };
    }

    const firstSource = this.toSnippet(
      input.memoBodies[0] ?? input.transcriptBodies[0] ?? input.meetingTitle,
    );

    return {
      summary: `${input.meetingTitle} 회의에서 ${sourceCount}개 기록을 정리했다.`,
      decisions: [
        {
          content: `${firstSource} 기준으로 후속 작업 범위를 확정했다.`,
          status: "decided",
          linkedTaskId: null,
        },
      ],
      risks: [
        {
          content:
            "회의 기록 기반 결정사항이 실제 Task contract와 어긋날 수 있다.",
          severity: sourceCount > 1 ? "medium" : "low",
          sortOrder: 0,
        },
      ],
      nextAgendas: [
        {
          title: `${input.meetingTitle} 후속 진행 상황 확인`,
          sortOrder: 0,
        },
      ],
      actionItems: [
        {
          title: `${input.meetingTitle} 후속 작업 정리`,
          description: `${sourceCount}개 회의 기록에서 나온 실행 항목을 Task draft 후보로 정리한다.`,
          assigneeSuggestionMemberId: null,
          dueDateSuggestion: null,
          priority: "medium",
        },
      ],
      trace,
      error: null,
    };
  }

  private toSnippet(value: string): string {
    const normalized = value.trim().replace(/\s+/g, " ");

    if (normalized.length <= 80) {
      return normalized;
    }

    return `${normalized.slice(0, 80)}...`;
  }
}
