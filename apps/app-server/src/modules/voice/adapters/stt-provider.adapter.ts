export const STT_PROVIDER = Symbol("STT_PROVIDER");

export type TranscribeAudioChunkInput = {
  voiceSessionId: string;
  meetingId: string;
  speakerMemberId: string | null;
  sequence: number;
  mimeType: string;
  audioBase64: string;
  audioByteLength: number;
  capturedStartedAt: string | null;
  capturedEndedAt: string | null;
};

export type TranscribeAudioChunkOutput = {
  text: string;
  provider: "local" | "openai" | string;
  isLocalTranscript: boolean;
};

export interface SttProvider {
  transcribeAudioChunk(
    input: TranscribeAudioChunkInput,
  ): Promise<TranscribeAudioChunkOutput>;
}
