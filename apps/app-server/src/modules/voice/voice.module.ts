import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MeetingModule } from "../meeting/meeting.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { MockVoiceRoomProvider } from "./adapters/mock-voice-room-provider.adapter";
import { VOICE_ROOM_PROVIDER } from "./adapters/voice-room-provider.adapter";
import { MockVoiceRepository } from "./repositories/voice.mock-repository";
import { VOICE_REPOSITORY } from "./repositories/voice.repository";
import { VoiceController } from "./voice.controller";
import { VoiceRouteGuard } from "./voice-route.guard";
import { VoiceService } from "./voice.service";

@Module({
  imports: [AuthModule, MeetingModule, WorkspaceModule],
  controllers: [VoiceController],
  providers: [
    VoiceService,
    VoiceRouteGuard,
    {
      provide: VOICE_REPOSITORY,
      useClass: MockVoiceRepository,
    },
    {
      provide: VOICE_ROOM_PROVIDER,
      useClass: MockVoiceRoomProvider,
    },
  ],
  exports: [VoiceService],
})
export class VoiceModule {}
