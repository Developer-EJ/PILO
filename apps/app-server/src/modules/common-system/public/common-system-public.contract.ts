import { NotificationCreateRequest } from "../../../common/contracts/public-contracts";

export interface CommonSystemPublicContract {
  createNotification(request: NotificationCreateRequest): Promise<void>;
}
