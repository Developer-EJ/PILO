import { Injectable } from "@nestjs/common";
import {
  CreateProviderRoomNameInput,
  VoiceRoomProvider,
} from "./voice-room-provider.adapter";

@Injectable()
export class MockVoiceRoomProvider implements VoiceRoomProvider {
  createRoomName(input: CreateProviderRoomNameInput): string {
    return `mock-voice-room-${input.workspaceId}-${input.meetingId}`;
  }
}
