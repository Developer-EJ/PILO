import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createClient, type RedisClientType } from "redis";
import type { ChatRedisEventV1 } from "./chat-types";

export const CHAT_REDIS_CHANNEL = "chat:events";

@Injectable()
export class ChatPublisherService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatPublisherService.name);
  private redisClient: RedisClientType | null = null;
  private redisUrl: string | null = null;

  async publish(event: ChatRedisEventV1): Promise<void> {
    try {
      const client = await this.getClient();
      if (!client) return;

      await client.publish(CHAT_REDIS_CHANNEL, JSON.stringify(event));
    } catch {
      this.logger.warn(
        `Chat Redis publish failed type=${event.type} workspace_id=${event.workspaceId}`
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisClient?.quit();
    this.redisClient = null;
    this.redisUrl = null;
  }

  private async getClient(): Promise<RedisClientType | null> {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) return null;

    if (this.redisClient && this.redisUrl === redisUrl) {
      return this.redisClient;
    }

    await this.redisClient?.quit();
    const client = createClient({ url: redisUrl });
    client.on("error", () => {
      this.logger.error("Chat Redis connection error");
    });
    await client.connect();
    this.redisClient = client as RedisClientType;
    this.redisUrl = redisUrl;
    return this.redisClient;
  }
}
