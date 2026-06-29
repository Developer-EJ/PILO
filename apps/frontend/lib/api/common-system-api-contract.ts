import type { NotificationCreateRequest } from "../types/public-contracts";

export interface CommonSystemApiContract {
  createNotification(request: NotificationCreateRequest): Promise<void>;
}
