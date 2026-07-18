import { Injectable } from "@nestjs/common";
import { AccessToken, TrackSource, VideoGrant } from "livekit-server-sdk";
import { serviceUnavailable } from "./screen-share.errors";

export type CreateScreenShareTokenInput = {
  identity: string;
  roomName: string;
  participantName: string;
};

export type ScreenShareTokenPayload = {
  livekitUrl: string;
  livekitToken: string;
  expiresAt: string;
};

const LIVEKIT_JOIN_TOKEN_TTL_SECONDS = 60 * 60;

@Injectable()
export class ScreenShareTokenService {
  async createPublisherToken(
    input: CreateScreenShareTokenInput
  ): Promise<ScreenShareTokenPayload> {
    const publisherGrant: VideoGrant = {
      room: input.roomName,
      roomJoin: true,
      canPublish: true,
      canPublishSources: [TrackSource.SCREEN_SHARE],
      canPublishData: false,
      canSubscribe: false
    };
    return this.createToken(input, publisherGrant);
  }

  async createViewerToken(
    input: CreateScreenShareTokenInput
  ): Promise<ScreenShareTokenPayload> {
    const viewerGrant: VideoGrant = {
      room: input.roomName,
      roomJoin: true,
      canPublish: false,
      canPublishData: false,
      canSubscribe: true
    };
    return this.createToken(input, viewerGrant);
  }

  private async createToken(
    input: CreateScreenShareTokenInput,
    grant: VideoGrant
  ): Promise<ScreenShareTokenPayload> {
    try {
      const config = this.getConfig();
      const expiresAt = new Date(
        Date.now() + LIVEKIT_JOIN_TOKEN_TTL_SECONDS * 1000
      ).toISOString();
      const accessToken = new AccessToken(config.apiKey, config.apiSecret, {
        identity: input.identity,
        name: input.participantName,
        ttl: LIVEKIT_JOIN_TOKEN_TTL_SECONDS
      });
      accessToken.addGrant(grant);

      return {
        livekitUrl: config.livekitUrl,
        livekitToken: await accessToken.toJwt(),
        expiresAt
      };
    } catch {
      throw serviceUnavailable("Screen sharing is unavailable");
    }
  }

  private getConfig(): {
    apiKey: string;
    apiSecret: string;
    livekitUrl: string;
  } {
    return {
      apiKey: this.requireConfig(process.env.LIVEKIT_API_KEY),
      apiSecret: this.requireConfig(process.env.LIVEKIT_API_SECRET),
      livekitUrl: this.requireConfig(process.env.LIVEKIT_URL)
    };
  }

  private requireConfig(value: string | undefined): string {
    if (!value?.trim()) {
      throw serviceUnavailable("Screen sharing is unavailable");
    }
    return value.trim();
  }
}
