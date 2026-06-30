import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { MeetingModule } from "../meeting/meeting.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { MockVoiceRoomProvider } from "./adapters/mock-voice-room-provider.adapter";
import { VOICE_ROOM_PROVIDER } from "./adapters/voice-room-provider.adapter";
import { VOICE_REPOSITORY } from "./repositories/voice.repository";
import { RuntimeVoiceRepository } from "./repositories/voice.runtime-repository";
import { VoiceController } from "./voice.controller";
import { VoiceRouteGuard } from "./voice-route.guard";
import { VoiceService } from "./voice.service";

@Module({
  imports: [AuthModule, DatabaseModule, MeetingModule, WorkspaceModule],
  controllers: [VoiceController],
  providers: [
    VoiceService,
    VoiceRouteGuard,
    {
      provide: VOICE_REPOSITORY,
      useClass: RuntimeVoiceRepository,
    },
    {
      provide: VOICE_ROOM_PROVIDER,
      useClass: MockVoiceRoomProvider,
    },
  ],
  exports: [VoiceService],
})
export class VoiceModule {}
