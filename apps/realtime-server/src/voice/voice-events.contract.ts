import { DomainEvent } from "../common/events/domain-event.contract";

export type VoiceRoomStatusChangedEvent = DomainEvent<{
  roomId: string;
  status: "active" | "inactive" | "archived";
}>;
