import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { MeetingModule } from "../meeting/meeting.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { LocalSttProvider } from "./adapters/local-stt-provider.adapter";
import { OpenAISttProvider } from "./adapters/openai-stt-provider.adapter";
import {
  STT_PROVIDER,
  SttProvider,
} from "./adapters/stt-provider.adapter";
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
    LocalSttProvider,
    OpenAISttProvider,
    {
      provide: VOICE_REPOSITORY,
      useClass: RuntimeVoiceRepository,
    },
    {
      provide: VOICE_ROOM_PROVIDER,
      useClass: MockVoiceRoomProvider,
    },
    {
      provide: STT_PROVIDER,
      useFactory: (
        localSttProvider: LocalSttProvider,
        openAISttProvider: OpenAISttProvider,
      ): SttProvider => {
        const providerName = (
          process.env.PILO_STT_PROVIDER ?? "local"
        ).trim().toLowerCase();

        if (providerName === "openai") {
          if (!process.env.OPENAI_API_KEY?.trim()) {
            throw new Error(
              "OPENAI_API_KEY is required when PILO_STT_PROVIDER=openai",
            );
          }

          return openAISttProvider;
        }

        if (providerName === "" || providerName === "local") {
          return localSttProvider;
        }

        throw new Error(`Unsupported PILO_STT_PROVIDER: ${providerName}`);
      },
      inject: [LocalSttProvider, OpenAISttProvider],
    },
  ],
  exports: [VoiceService],
})
export class VoiceModule {}
