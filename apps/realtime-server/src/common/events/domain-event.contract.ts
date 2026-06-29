export interface DomainEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  type: string;
  workspaceId: string;
  payload: TPayload;
  occurredAt: string;
}
