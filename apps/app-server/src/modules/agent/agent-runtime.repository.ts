import { Injectable, Optional } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { AgentActionDetail, AgentRunDetail } from "./agent-runtime.types";

const LOCAL_AGENT_NAME = "PILO Local Planning Agent";
const LOCAL_AGENT_DESCRIPTION =
  "Deterministic local MVP planning runner used by the Agent Runtime.";
const RUN_SNAPSHOT_KIND = "agent_run_detail_snapshot";

type RawDatabaseClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
  $transaction?<T>(
    operation: (client: RawDatabaseClient) => Promise<T>,
  ): Promise<T>;
};

type DbAgentRow = {
  id: string;
};

type DbAgentWorkflowRow = {
  id: string;
};

type DbRunIdRow = {
  runId: string;
};

type DbRunSnapshotRow = {
  payload: unknown;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

@Injectable()
export class AgentRuntimeRepository {
  private readonly runs = new Map<string, AgentRunDetail>();
  private readonly actionRunIds = new Map<string, string>();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  get storageMode() {
    return this.shouldUseDatabase ? "database" : "memory";
  }

  async saveRun(run: AgentRunDetail) {
    if (this.shouldUseDatabase) {
      return this.saveDbRun(run);
    }

    const storedRun = clone(run);

    this.runs.set(storedRun.id, storedRun);

    for (const action of storedRun.actions) {
      this.actionRunIds.set(action.id, storedRun.id);
    }

    return clone(storedRun);
  }

  async findRun(runId: string) {
    if (this.shouldUseDatabase) {
      return this.findDbRun(runId);
    }

    const run = this.runs.get(runId);

    return run ? clone(run) : null;
  }

  async findRunByActionId(actionId: string) {
    if (this.shouldUseDatabase) {
      return this.findDbRunByActionId(actionId);
    }

    const runId = this.actionRunIds.get(actionId);

    return runId ? this.findRun(runId) : null;
  }

  async updateAction(action: AgentActionDetail) {
    const run = await this.findRunByActionId(action.id);

    if (!run) {
      return null;
    }

    run.actions = run.actions.map((existingAction) =>
      existingAction.id === action.id ? clone(action) : existingAction,
    );

    return this.saveRun(run);
  }

  async listWorkspaceActions(workspaceId: string) {
    if (this.shouldUseDatabase) {
      return this.listDbWorkspaceActions(workspaceId);
    }

    const actions: AgentActionDetail[] = [];

    for (const run of this.runs.values()) {
      if (run.workspaceId !== workspaceId) continue;
      actions.push(...run.actions.map((action) => clone(action)));
    }

    return actions;
  }

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db(): RawDatabaseClient {
    if (!this.database) {
      throw new Error("DatabaseService is required for Agent Runtime DB mode");
    }

    return this.database as RawDatabaseClient;
  }

  private async withDatabaseTransaction<T>(
    operation: (client: RawDatabaseClient) => Promise<T>,
  ): Promise<T> {
    const db = this.db;

    if (db.$transaction) {
      return db.$transaction((client) => operation(client));
    }

    return operation(db);
  }

  private async saveDbRun(run: AgentRunDetail) {
    return this.withDatabaseTransaction(async (database) => {
      const workflowId = await this.findOrCreateDbWorkflow(
        database,
        run.workflowType,
        run.workflowVersion,
      );
      const storedRun: AgentRunDetail = {
        ...clone(run),
        workflowId,
      };

      await database.$queryRaw`
        INSERT INTO agent_runs (
          id,
          workflow_id,
          workspace_id,
          actor_member_id,
          status,
          input,
          output,
          error,
          started_at,
          finished_at,
          created_at,
          updated_at
        )
        VALUES (
          ${storedRun.id}::uuid,
          ${storedRun.workflowId}::uuid,
          ${storedRun.workspaceId}::uuid,
          ${storedRun.actorMemberId}::uuid,
          ${storedRun.status},
          ${toJsonb(storedRun.input)}::jsonb,
          ${toJsonb(storedRun.output)}::jsonb,
          ${storedRun.error ? JSON.stringify(storedRun.error) : null},
          ${storedRun.startedAt}::timestamptz,
          ${storedRun.finishedAt}::timestamptz,
          ${storedRun.createdAt}::timestamptz,
          ${storedRun.updatedAt}::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          workflow_id = EXCLUDED.workflow_id,
          workspace_id = EXCLUDED.workspace_id,
          actor_member_id = EXCLUDED.actor_member_id,
          status = EXCLUDED.status,
          input = EXCLUDED.input,
          output = EXCLUDED.output,
          error = EXCLUDED.error,
          started_at = EXCLUDED.started_at,
          finished_at = EXCLUDED.finished_at,
          updated_at = EXCLUDED.updated_at
        RETURNING id::text AS id
      `;

      await this.replaceDbRunChildren(database, storedRun);
      await this.replaceDbRunSnapshot(database, storedRun);

      return clone(storedRun);
    });
  }

  private async findDbRun(runId: string) {
    const rows = await this.db.$queryRaw<DbRunSnapshotRow[]>`
      SELECT payload
      FROM agent_contexts
      WHERE run_id = ${runId}::uuid
        AND context_type = 'freeform'
        AND payload->>'kind' = ${RUN_SNAPSHOT_KIND}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return snapshotPayloadToRun(rows[0]?.payload);
  }

  private async findDbRunByActionId(actionId: string) {
    const rows = await this.db.$queryRaw<DbRunIdRow[]>`
      SELECT run_id::text AS "runId"
      FROM agent_actions
      WHERE id = ${actionId}::uuid
      LIMIT 1
    `;

    return rows[0]?.runId ? this.findDbRun(rows[0].runId) : null;
  }

  private async listDbWorkspaceActions(workspaceId: string) {
    const rows = await this.db.$queryRaw<DbRunSnapshotRow[]>`
      SELECT c.payload
      FROM agent_contexts c
      JOIN agent_runs r ON r.id = c.run_id
      WHERE r.workspace_id = ${workspaceId}::uuid
        AND c.context_type = 'freeform'
        AND c.payload->>'kind' = ${RUN_SNAPSHOT_KIND}
      ORDER BY r.updated_at DESC, c.created_at DESC
    `;
    const actions: AgentActionDetail[] = [];

    for (const row of rows) {
      const run = snapshotPayloadToRun(row.payload);

      if (run?.workspaceId === workspaceId) {
        actions.push(...run.actions.map((action) => clone(action)));
      }
    }

    return actions;
  }

  private async findOrCreateDbWorkflow(
    database: RawDatabaseClient,
    type: string,
    version: string,
  ) {
    const existingWorkflows = await database.$queryRaw<DbAgentWorkflowRow[]>`
      SELECT id::text AS id
      FROM agent_workflows
      WHERE type = ${type}
        AND version = ${version}
      LIMIT 1
    `;

    if (existingWorkflows[0]?.id) {
      return existingWorkflows[0].id;
    }

    const agentId = await this.findOrCreateDbAgent(database);
    const workflowRows = await database.$queryRaw<DbAgentWorkflowRow[]>`
      INSERT INTO agent_workflows (
        agent_id,
        type,
        version,
        input_schema,
        output_schema,
        enabled,
        created_at,
        updated_at
      )
      VALUES (
        ${agentId}::uuid,
        ${type},
        ${version},
        '{}'::jsonb,
        '{}'::jsonb,
        true,
        now(),
        now()
      )
      ON CONFLICT (type, version) DO UPDATE SET
        updated_at = agent_workflows.updated_at
      RETURNING id::text AS id
    `;

    return workflowRows[0].id;
  }

  private async findOrCreateDbAgent(database: RawDatabaseClient) {
    const existingAgents = await database.$queryRaw<DbAgentRow[]>`
      SELECT id::text AS id
      FROM agents
      WHERE domain = 'planning'
        AND name = ${LOCAL_AGENT_NAME}
      ORDER BY created_at ASC
      LIMIT 1
    `;

    if (existingAgents[0]?.id) {
      return existingAgents[0].id;
    }

    const agentRows = await database.$queryRaw<DbAgentRow[]>`
      INSERT INTO agents (
        name,
        domain,
        description,
        enabled,
        created_at,
        updated_at
      )
      VALUES (
        ${LOCAL_AGENT_NAME},
        'planning',
        ${LOCAL_AGENT_DESCRIPTION},
        true,
        now(),
        now()
      )
      RETURNING id::text AS id
    `;

    return agentRows[0].id;
  }

  private async replaceDbRunChildren(
    database: RawDatabaseClient,
    run: AgentRunDetail,
  ) {
    await database.$executeRaw`
      DELETE FROM agent_traces
      WHERE run_id = ${run.id}::uuid
    `;
    await database.$executeRaw`
      DELETE FROM agent_run_steps
      WHERE run_id = ${run.id}::uuid
    `;
    await database.$executeRaw`
      DELETE FROM agent_actions
      WHERE run_id = ${run.id}::uuid
    `;

    for (const step of run.steps) {
      await database.$queryRaw`
        INSERT INTO agent_run_steps (
          id,
          run_id,
          step_name,
          status,
          input,
          output,
          error,
          started_at,
          finished_at,
          created_at
        )
        VALUES (
          ${step.id}::uuid,
          ${run.id}::uuid,
          ${step.stepName},
          ${step.status},
          ${toJsonb(step.input)}::jsonb,
          ${toJsonb(step.output)}::jsonb,
          ${step.error ? JSON.stringify(step.error) : null},
          ${step.startedAt}::timestamptz,
          ${step.finishedAt}::timestamptz,
          ${step.createdAt}::timestamptz
        )
        RETURNING id::text AS id
      `;
    }

    for (const action of run.actions) {
      await database.$queryRaw`
        INSERT INTO agent_actions (
          id,
          run_id,
          type,
          source,
          requires_confirmation,
          payload,
          status,
          confirmed_by_member_id,
          confirmed_at,
          executed_at,
          created_at,
          updated_at
        )
        VALUES (
          ${action.id}::uuid,
          ${run.id}::uuid,
          ${action.type},
          ${action.source},
          ${action.requiresConfirmation},
          ${toJsonb(action.payload)}::jsonb,
          ${action.status},
          ${action.confirmedByMemberId}::uuid,
          ${action.confirmedAt}::timestamptz,
          ${action.executedAt}::timestamptz,
          ${run.createdAt}::timestamptz,
          ${run.updatedAt}::timestamptz
        )
        RETURNING id::text AS id
      `;
    }

    for (const trace of run.trace) {
      await database.$queryRaw`
        INSERT INTO agent_traces (
          id,
          run_id,
          step_id,
          message,
          metadata,
          created_at
        )
        VALUES (
          ${trace.id}::uuid,
          ${run.id}::uuid,
          ${trace.stepId}::uuid,
          ${trace.message},
          ${toJsonb(trace.metadata)}::jsonb,
          ${trace.createdAt}::timestamptz
        )
        RETURNING id::text AS id
      `;
    }
  }

  private async replaceDbRunSnapshot(
    database: RawDatabaseClient,
    run: AgentRunDetail,
  ) {
    await database.$executeRaw`
      DELETE FROM agent_contexts
      WHERE run_id = ${run.id}::uuid
        AND context_type = 'freeform'
        AND payload->>'kind' = ${RUN_SNAPSHOT_KIND}
    `;
    await database.$queryRaw`
      INSERT INTO agent_contexts (
        run_id,
        context_type,
        ref_id,
        payload,
        created_at
      )
      VALUES (
        ${run.id}::uuid,
        'freeform',
        null,
        ${toJsonb({
          kind: RUN_SNAPSHOT_KIND,
          run,
        })}::jsonb,
        ${run.updatedAt}::timestamptz
      )
      RETURNING id::text AS id
    `;
  }
}

function toJsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

function snapshotPayloadToRun(payload: unknown): AgentRunDetail | null {
  const resolvedPayload =
    typeof payload === "string" ? safeParseJson(payload) : payload;

  if (
    !isRecord(resolvedPayload) ||
    resolvedPayload.kind !== RUN_SNAPSHOT_KIND
  ) {
    return null;
  }

  if (!isRecord(resolvedPayload.run)) {
    return null;
  }

  return clone(resolvedPayload.run as unknown as AgentRunDetail);
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
