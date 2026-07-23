import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  WorkspaceDeletionService,
  getWorkspaceDeletionRetryDelayMs
} = require("../../dist/modules/workspace/workspace-deletion.service.js");
const {
  WorkspaceService
} = require("../../dist/modules/workspace/workspace.service.js");

const workspaceServiceSource = await readFile(
  new URL("../../src/modules/workspace/workspace.service.ts", import.meta.url),
  "utf8"
);
const deletionServiceSource = await readFile(
  new URL(
    "../../src/modules/workspace/workspace-deletion.service.ts",
    import.meta.url
  ),
  "utf8"
);
const deletionMigration = await readFile(
  new URL(
    "../../../../db/migrations/107_create_workspace_deletion_lifecycle.sql",
    import.meta.url
  ),
  "utf8"
);

class FakeDatabase {
  constructor({ claim, failDelete = false, readyJob = true }) {
    this.calls = [];
    this.claim = claim;
    this.failDelete = failDelete;
    this.readyJob = readyJob;
  }

  async query(text, values) {
    this.calls.push({ method: "query", text, values });
    if (text.includes("FROM workspace_deletion_jobs AS job")) {
      return this.readyJob ? [{ id: this.claim.deletion_job_id }] : [];
    }
    if (text.includes("FROM workspace_deletion_targets")) {
      return [{ id: this.claim.id }];
    }
    return [];
  }

  async execute(text, values) {
    this.calls.push({ method: "execute", text, values });
    if (text.includes("status = 'completed'")) {
      return { rowCount: this.failDelete ? 0 : 1 };
    }
    if (text.includes("last_error_code = 'EXTERNAL_OBJECT_DELETE_FAILED'")) {
      return { rowCount: 1 };
    }
    if (text.includes("DELETE FROM workspaces")) {
      return { rowCount: 1 };
    }
    return { rowCount: 0 };
  }

  async transaction(operation) {
    this.calls.push({ method: "transaction", text: "", values: [] });
    return operation({
      execute: (text, values) => this.execute(text, values),
      queryOne: async (text, values) => {
        this.calls.push({ method: "queryOne", text, values });
        if (text.includes("WITH candidate")) return this.claim;
        if (text.includes("FROM workspace_deletion_jobs AS job")) {
          return this.readyJob
            ? {
                id: this.claim.deletion_job_id,
                workspace_id: this.claim.workspace_id
              }
            : null;
        }
        return null;
      }
    });
  }
}

class FakeS3Client {
  constructor(shouldFail = false) {
    this.commands = [];
    this.destroyCalls = 0;
    this.shouldFail = shouldFail;
  }

  async send(command) {
    this.commands.push(command);
    if (this.shouldFail) throw new Error("S3 unavailable");
  }

  destroy() {
    this.destroyCalls += 1;
  }
}

class TestWorkspaceDeletionService extends WorkspaceDeletionService {
  constructor(database, client) {
    super(database);
    this.client = client;
    this.configs = [];
  }

  createS3Client(config) {
    this.configs.push(config);
    return this.client;
  }
}

class DeleteRequestDatabase {
  constructor(deletionStatus = "active") {
    this.calls = [];
    this.deletionStatus = deletionStatus;
  }

  async transaction(operation) {
    return operation({
      execute: async (text, values) => {
        this.calls.push({ method: "execute", text, values });
        return { rowCount: 1 };
      },
      queryOne: async (text, values) => {
        this.calls.push({ method: "queryOne", text, values });
        if (text.includes("FOR UPDATE OF w")) {
          return {
            id: claim.workspace_id,
            name: "Delete me",
            icon: null,
            owner_user_id: "55555555-5555-4555-8555-555555555555",
            role: "owner",
            deletion_status: this.deletionStatus,
            created_at: "2026-07-23T00:00:00.000Z",
            updated_at: "2026-07-23T00:00:00.000Z"
          };
        }
        if (text.includes("other_member_exists")) {
          return {
            other_member_exists: false,
            github_installation_exists: false,
            active_meeting_exists: false,
            active_sync_exists: false
          };
        }
        if (text.includes("INSERT INTO workspace_deletion_jobs")) {
          return { id: claim.deletion_job_id };
        }
        return null;
      }
    });
  }
}

const originalEnv = {
  AWS_REGION: process.env.AWS_REGION,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_UPLOADS_BUCKET: process.env.S3_UPLOADS_BUCKET
};
process.env.AWS_REGION = "ap-northeast-2";
process.env.S3_ENDPOINT = "http://localhost:4566";
process.env.S3_UPLOADS_BUCKET = "private-test-bucket";

const claim = {
  id: "11111111-1111-4111-8111-111111111111",
  deletion_job_id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "33333333-3333-4333-8333-333333333333",
  target_type: "drive_object",
  object_key: "private/workspace/file.bin",
  attempt_count: 1,
  claim_token: "44444444-4444-4444-8444-444444444444"
};

{
  const database = new DeleteRequestDatabase();
  let sweepRequests = 0;
  const workspace = new WorkspaceService(
    database,
    {},
    { requestSweep: () => sweepRequests += 1 }
  );

  assert.deepEqual(
    await workspace.deleteWorkspace(
      "55555555-5555-4555-8555-555555555555",
      claim.workspace_id,
      { confirmationName: "Delete me" }
    ),
    {
      deletionRequested: true,
      status: "deleting",
      workspaceId: claim.workspace_id
    }
  );
  assert.equal(sweepRequests, 1);
  assert.equal(
    database.calls.some(({ text }) =>
      text.includes("INSERT INTO workspace_deletion_targets")
    ),
    true
  );
  assert.equal(
    database.calls.some(({ text }) =>
      text.includes("deletion_status = 'deleting'")
    ),
    true
  );

  const idempotentDatabase = new DeleteRequestDatabase("deleting");
  const idempotentWorkspace = new WorkspaceService(
    idempotentDatabase,
    {},
    { requestSweep: () => undefined }
  );
  await idempotentWorkspace.deleteWorkspace(
    "55555555-5555-4555-8555-555555555555",
    claim.workspace_id,
    { confirmationName: "Delete me" }
  );
  assert.equal(
    idempotentDatabase.calls.some(({ text }) =>
      text.includes("INSERT INTO workspace_deletion_jobs")
    ),
    false
  );
}

{
  const database = new FakeDatabase({ claim });
  const client = new FakeS3Client();
  const service = new TestWorkspaceDeletionService(database, client);

  await service.processDueDeletionJobs();

  assert.equal(client.commands.length, 1);
  assert.equal(client.commands[0].constructor.name, "DeleteObjectCommand");
  assert.deepEqual(client.commands[0].input, {
    Bucket: "private-test-bucket",
    Key: claim.object_key
  });
  assert.deepEqual(service.configs, [
    {
      awsRegion: "ap-northeast-2",
      bucket: "private-test-bucket",
      endpoint: "http://localhost:4566"
    }
  ]);
  assert.equal(
    database.calls.some(({ text }) =>
      text.includes("status = 'completed'")
    ),
    true
  );
  assert.equal(
    database.calls.some(({ text }) =>
      text.includes("DELETE FROM workspaces")
    ),
    true
  );
  assert.equal(
    database.calls.some(({ text }) =>
      text.includes("pilo.activity_log_tenant_purge")
    ),
    true
  );
  assert.equal(
    database.calls.some(({ text }) =>
      text.includes("pilo.workspace_deletion_finalize")
    ),
    true
  );

  service.onModuleDestroy();
  assert.equal(client.destroyCalls, 1);
}

{
  const database = new FakeDatabase({
    claim,
    failDelete: true,
    readyJob: false
  });
  const client = new FakeS3Client(true);
  const service = new TestWorkspaceDeletionService(database, client);

  await service.processDueDeletionJobs();

  const retry = database.calls.find(({ text }) =>
    text.includes("last_error_code = 'EXTERNAL_OBJECT_DELETE_FAILED'")
  );
  assert.ok(retry);
  assert.equal(retry.values[0], claim.id);
  assert.equal(retry.values[1], claim.claim_token);
  assert.ok(retry.values[2] instanceof Date);
  assert.equal(
    database.calls.some(({ text }) =>
      text.includes("DELETE FROM workspaces")
    ),
    false
  );
  service.onModuleDestroy();
}

assert.equal(getWorkspaceDeletionRetryDelayMs(1), 5_000);
assert.equal(getWorkspaceDeletionRetryDelayMs(100), 24 * 60 * 60_000);

assert.match(workspaceServiceSource, /FOR UPDATE OF w/);
assert.match(workspaceServiceSource, /INSERT INTO workspace_deletion_jobs/);
assert.match(workspaceServiceSource, /'drive_object'/);
assert.match(workspaceServiceSource, /'meeting_recording'/);
assert.match(
  workspaceServiceSource,
  /GREATEST\(now\(\), COALESCE\(drive_upload\.expires_at, now\(\)\)\)/
);
assert.match(workspaceServiceSource, /deletion_status = 'deleting'/);
assert.match(deletionServiceSource, /FOR UPDATE SKIP LOCKED/);
assert.match(deletionServiceSource, /target\.status <> 'completed'/);
assert.doesNotMatch(
  deletionServiceSource,
  /logger\.(?:log|warn|error)\([^)]*(?:object_key|bucket)/s
);
assert.match(
  deletionMigration,
  /CREATE TABLE public\.workspace_deletion_jobs/
);
assert.match(
  deletionMigration,
  /CREATE TABLE public\.workspace_deletion_targets/
);
assert.match(deletionMigration, /enforce_active_workspace_write/);
assert.match(deletionMigration, /enforce_active_meeting_recording_write/);
assert.match(deletionMigration, /enforce_workspace_deletion_finalize/);
assert.match(deletionMigration, /ENABLE ROW LEVEL SECURITY/);
assert.match(deletionMigration, /REVOKE ALL ON TABLE/);

for (const [name, value] of Object.entries(originalEnv)) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

console.log("workspace deletion lifecycle tests passed");
