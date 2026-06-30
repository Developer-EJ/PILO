import { Injectable } from "@nestjs/common";
import {
  SttProvider,
  TranscribeAudioChunkInput,
  TranscribeAudioChunkOutput,
} from "./stt-provider.adapter";

@Injectable()
export class LocalSttProvider implements SttProvider {
  async transcribeAudioChunk(
    input: TranscribeAudioChunkInput,
  ): Promise<TranscribeAudioChunkOutput> {
    return {
      text: `Local STT chunk ${input.sequence} captured ${input.audioByteLength} bytes of ${input.mimeType} audio.`,
      provider: "local",
      isLocalTranscript: true,
    };
  }
}
