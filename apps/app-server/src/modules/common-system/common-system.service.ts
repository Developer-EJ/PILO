import { Injectable } from "@nestjs/common";
import {
  NotImplementedError,
  NotificationCreateRequest,
} from "../../common/contracts/public-contracts";
import { CommonSystemPublicContract } from "./public/common-system-public.contract";

@Injectable()
export class CommonSystemService implements CommonSystemPublicContract {
  createNotification(request: NotificationCreateRequest): Promise<void> {
    void request;
    throw new NotImplementedError(
      "CommonSystemPublicContract.createNotification",
    );
  }
}
