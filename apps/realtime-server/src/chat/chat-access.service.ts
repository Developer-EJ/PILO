import type { RealtimeDatabase } from "../database/database";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChatAccessContext = {
  userId?: string;
};

export function createChatAccessService(database: RealtimeDatabase) {
  return {
    async canJoinWorkspace(context: ChatAccessContext, workspaceId: string) {
      if (!context.userId || !UUID_PATTERN.test(workspaceId)) return false;

      const membership = await database.queryOne<{ id: string }>(
        `SELECT member.id
         FROM workspace_members AS member
         JOIN workspaces AS workspace
           ON workspace.id = member.workspace_id
          AND workspace.deletion_status = 'active'
         WHERE member.workspace_id = $1
           AND member.user_id = $2
         LIMIT 1`,
        [workspaceId, context.userId],
      );

      return Boolean(membership);
    },
  };
}
