import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    if (
      process.env.PILO_SKIP_DATABASE_CONNECT === "true" ||
      !process.env.DATABASE_URL
    ) {
      return;
    }

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async ping() {
    await this.$queryRaw`SELECT 1`;
    return true;
  }
}
