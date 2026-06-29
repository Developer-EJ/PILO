import { DomainEvent } from "../common/events/domain-event.contract";

export type CanvasShapeMovedEvent = DomainEvent<{
  boardId: string;
  shapeId: string;
  x: number;
  y: number;
}>;
