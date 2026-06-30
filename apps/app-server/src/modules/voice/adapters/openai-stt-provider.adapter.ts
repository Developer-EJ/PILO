import { Injectable } from "@nestjs/common";
import { Buffer } from "node:buffer";
import {
  SttProvider,
  TranscribeAudioChunkInput,
  TranscribeAudioChunkOutput,
} from "./stt-provider.adapter";

type OpenAITranscriptionResponse = {
  text?: unknown;
};

@Injectable()
export class OpenAISttProvider implements SttProvider {
  async transcribeAudioChunk(
    input: TranscribeAudioChunkInput,
  ): Promise<TranscribeAudioChunkOutput> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when PILO_STT_PROVIDER=openai");
    }

    if (
      typeof fetch !== "function" ||
      typeof FormData === "undefined" ||
      typeof Blob === "undefined"
    ) {
      throw new Error("OpenAI STT requires fetch, FormData, and Blob support");
    }

    const audioBytes = Buffer.from(input.audioBase64, "base64");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([audioBytes], { type: input.mimeType }),
      `voice-session-${input.voiceSessionId}-chunk-${input.sequence}.${extensionForMimeType(
        input.mimeType,
      )}`,
    );
    formData.append(
      "model",
      process.env.OPENAI_STT_MODEL?.trim() || "gpt-4o-mini-transcribe",
    );

    const response = await fetch(
      process.env.OPENAI_STT_URL?.trim() ||
        "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `OpenAI transcription failed with status ${response.status}${
          details ? `: ${details}` : ""
        }`,
      );
    }

    const body = (await response.json()) as OpenAITranscriptionResponse;
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      throw new Error("OpenAI transcription response did not include text");
    }

    return {
      text,
      provider: "openai",
      isLocalTranscript: false,
    };
  }
}

function extensionForMimeType(mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedMimeType.includes("webm")) return "webm";
  if (normalizedMimeType.includes("mpeg")) return "mp3";
  if (normalizedMimeType.includes("mp3")) return "mp3";
  if (normalizedMimeType.includes("wav")) return "wav";
  if (normalizedMimeType.includes("ogg")) return "ogg";
  if (normalizedMimeType.includes("mp4")) return "mp4";

  return "webm";
}
