import type { RealtimeDatabase } from "../database/database";

export type WorkspacePresenceAccessContext = {
  userId?: string;
};

export function createWorkspacePresenceAccessService(
  database: RealtimeDatabase,
) {
  return {
    async canJoinWorkspace(
      context: WorkspacePresenceAccessContext,
      workspaceId: string,
    ) {
      if (!context.userId || !workspaceId) return false;

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
