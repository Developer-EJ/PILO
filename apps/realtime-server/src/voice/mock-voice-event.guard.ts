import { BadRequestException, Injectable } from "@nestjs/common";

@Injectable()
export class MockVoiceEventGuard {
  assertAllowed(payload: unknown): void {
    if (!this.isRecord(payload) || payload.mockAuth !== true) {
      throw new BadRequestException("mockAuth must be true for voice events");
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
