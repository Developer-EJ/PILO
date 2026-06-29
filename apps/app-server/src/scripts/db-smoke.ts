import "reflect-metadata";
import { DatabaseService } from "../modules/database/database.service";
import { loadDatabaseEnv } from "./database-env";

class SmokeRollback extends Error {}

loadDatabaseEnv();

async function verifyJuhyungReadWrite(database: DatabaseService) {
  try {
    await database.$transaction(async (transaction) => {
      const uniqueKey = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const [user] = await transaction.$queryRaw<{ id: string }[]>`
        INSERT INTO users (email, name)
        VALUES (${`db-smoke-${uniqueKey}@pilo.local`}, ${"DB Smoke"})
        RETURNING id
      `;

      const workspace = await transaction.workspace.create({
        data: {
          name: `DB Smoke ${uniqueKey}`,
        },
      });

      const member = await transaction.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "owner",
          displayName: "DB Smoke",
        },
      });

      const task = await transaction.task.create({
        data: {
          workspaceId: workspace.id,
          title: "DB smoke task",
          createdByMemberId: member.id,
        },
      });

      const persistedTask = await transaction.task.findFirst({
        where: {
          id: task.id,
          workspaceId: workspace.id,
          deletedAt: null,
        },
      });

      if (!persistedTask) {
        throw new Error("Juhyung task read/write smoke check failed");
      }

      throw new SmokeRollback();
    });
  } catch (error) {
    if (error instanceof SmokeRollback) {
      return;
    }

    throw error;
  }
}

async function main() {
  const database = new DatabaseService();

  try {
    await database.$connect();
    await database.ping();
    await verifyJuhyungReadWrite(database);
    console.log("app-server db smoke ok");
  } finally {
    await database.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
