import { DomainEvent } from "../common/events/domain-event.contract";

export type MeetingTranscriptUpdatedEvent = DomainEvent<{
  meetingId: string;
  segmentId: string;
}>;
