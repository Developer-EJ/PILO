import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createClient, type RedisClientType } from "redis";
import {
  isWorkspaceMembershipRevokedEvent,
  WORKSPACE_MEMBERSHIP_REVOCATION_REDIS_CHANNEL
} from "../workspace-membership-revocation/workspace-membership-revocation.types";
import { ScreenShareRoomService } from "./screen-share-room.service";
import { ScreenShareService } from "./screen-share.service";
import { ScreenShareStateService } from "./screen-share-state.service";

@Injectable()
export class ScreenShareMembershipRevocationService
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(
    ScreenShareMembershipRevocationService.name
  );
  private redisClient: RedisClientType | null = null;
  constructor(
    private readonly state: ScreenShareStateService,
    private readonly screenShares: ScreenShareService,
    private readonly rooms: ScreenShareRoomService
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.APP_SERVER_RUNTIME === "github-sync-worker") return;

    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) return;

    const client = this.createRedisClient(redisUrl);
    client.on("error", () => {
      this.logger.error(
        "Screen share membership revocation Redis connection error"
      );
    });

    try {
      await client.connect();
      await client.subscribe(
        WORKSPACE_MEMBERSHIP_REVOCATION_REDIS_CHANNEL,
        message => {
          void this.handleRedisMessage(message);
        }
      );
      this.redisClient = client;
    } catch {
      client.destroy();
      this.logger.error(
        "Screen share membership revocation Redis subscription failed"
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.redisClient;
    this.redisClient = null;
    if (!client) return;

    try {
      await client.quit();
    } catch {
      client.destroy();
    }
  }

  async handleMembershipRevocation(event: unknown): Promise<boolean> {
    if (!isWorkspaceMembershipRevokedEvent(event)) return false;

    try {
      const session = await this.state.getCurrent(event.workspaceId);
      if (!session) return true;

      if (session.sharerUserId === event.userId) {
        await this.screenShares.endForRevocation(
          event.workspaceId,
          event.userId
        );
      } else {
        await this.rooms.removeViewerParticipants(session, event.userId);
      }
      return true;
    } catch {
      this.logger.error("Screen share membership revocation eviction failed");
      return false;
    }
  }

  protected createRedisClient(redisUrl: string): RedisClientType {
    return createClient({ url: redisUrl }) as RedisClientType;
  }

  private async handleRedisMessage(message: string): Promise<void> {
    let event: unknown;
    try {
      event = JSON.parse(message);
    } catch {
      this.logger.warn("Screen share membership revocation payload is invalid");
      return;
    }

    if (!(await this.handleMembershipRevocation(event))) {
      this.logger.error(
        "Screen share membership revocation could not be handled"
      );
    }
  }
}
