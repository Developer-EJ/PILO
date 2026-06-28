import { Injectable } from "@nestjs/common";

@Injectable()
export class AuthRepository {
  readonly storageMode = "not-connected";
}
