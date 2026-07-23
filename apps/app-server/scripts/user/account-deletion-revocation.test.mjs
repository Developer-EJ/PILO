import assert from "node:assert/strict";
import test from "node:test";

import { GoogleCalendarSyncService } from "../../dist/modules/calendar/google-calendar-sync.service.js";
import { SettingsService } from "../../dist/modules/settings/settings.service.js";
import { UserService } from "../../dist/modules/user/user.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceIds = [
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333"
];
const ownerWorkspaceIds = [workspaceIds[1]];

function createDatabase({ failCommit = false, sequence }) {
  const database = {
    statements: [],
    transactionResult: Symbol("not-called"),
    async transaction(callback) {
      sequence.push("transaction:begin");
      const result = await callback({
        async execute(text) {
          database.statements.push(text);
          sequence.push(
            text.includes("pg_advisory_xact_lock")
              ? "calendar:locked"
              : text.includes("DELETE FROM google_calendar_connections")
                ? "calendar:cleaned"
                : text.includes("DELETE FROM workspace_members")
                  ? "membership:deleted"
                  : "account:mutated"
          );
          return { rowCount: 1, rows: [] };
        },
        async query(text) {
          assert.match(text, /DELETE FROM workspace_members/);
          assert.match(text, /RETURNING workspace_id/);
          sequence.push("membership:deleted-returning");
          return workspaceIds.map((workspace_id) => ({ workspace_id }));
        },
        async queryOne(text) {
          if (/FROM users[\s\S]*FOR UPDATE/.test(text)) {
            sequence.push("user:locked");
            return { id: userId };
          }
          return null;
        }
      });
      database.transactionResult = result;
      if (failCommit) {
        sequence.push("transaction:rollback");
        throw new Error("commit failed");
      }
      sequence.push("transaction:commit");
      return result;
    }
  };
  return database;
}

function createOutbox(sequence, { publishFailedWorkspaceId } = {}) {
  return {
    enqueued: [],
    published: [],
    async enqueueMembershipRevoked(_transaction, workspaceId, targetUserId) {
      sequence.push(`revocation:enqueued:${workspaceId}`);
      const id = `outbox:${workspaceId}:${targetUserId}`;
      this.enqueued.push({ id, workspaceId, userId: targetUserId });
      return id;
    },
    async publishOutbox(id) {
      const workspaceId = id.split(":")[1];
      sequence.push(
        workspaceId === publishFailedWorkspaceId
          ? `revocation:publish-failed:${workspaceId}`
          : `revocation:published:${workspaceId}`
      );
      this.published.push(id);
    }
  };
}

function createGoogleCalendar(sequence) {
  return {
    async lockAccountLifecycleInTransaction(transaction, targetUserId) {
      assert.equal(targetUserId, userId);
      await transaction.execute("SELECT pg_advisory_xact_lock($1::bigint)", [-1n]);
    },
    async cleanupAccountInTransaction(transaction, targetUserId) {
      assert.equal(targetUserId, userId);
      await transaction.execute(
        "DELETE FROM google_calendar_connections WHERE user_id=$1",
        [targetUserId]
      );
    }
  };
}

function createWorkspaceService(
  sequence,
  blockedWorkspaces = [],
  workspaceIdsToDelete = ownerWorkspaceIds
) {
  return {
    sweepRequests: 0,
    async prepareOwnedWorkspacesForAccountDeletion() {
      sequence.push("workspace:prepared");
      return {
        blockedWorkspaces,
        workspaceIdsToDelete:
          blockedWorkspaces.length === 0 ? workspaceIdsToDelete : [],
        shouldRequestSweep: blockedWorkspaces.length === 0
      };
    },
    async scheduleOwnedWorkspacesForAccountDeletion(
      _transaction,
      targetUserId,
      targetWorkspaceIds
    ) {
      assert.equal(targetUserId, userId);
      assert.deepEqual(targetWorkspaceIds, workspaceIdsToDelete);
      assert.ok(
        targetWorkspaceIds.every(workspaceId =>
          sequence.includes(`revocation:enqueued:${workspaceId}`)
        ),
        "Workspace deletion must be scheduled after revocation outbox enqueue"
      );
      sequence.push("workspace:scheduled");
    },
    requestDeletionSweep() {
      sequence.push("workspace:sweep");
      this.sweepRequests += 1;
    }
  };
}

function createSubject({ database, outbox, sequence, workspaceService }) {
  return new UserService(
    database,
    outbox,
    createGoogleCalendar(sequence),
    workspaceService
  );
}

test("계정 탈퇴 transaction은 Calendar 정리와 Workspace 삭제 준비를 함께 commit한다", async () => {
  const sequence = [];
  const database = createDatabase({ sequence });
  const outbox = createOutbox(sequence);
  const workspaceService = createWorkspaceService(sequence);
  const service = createSubject({ database, outbox, sequence, workspaceService });

  await service.deleteCurrentUser(userId, { confirmationText: "계정 탈퇴" });

  assert.deepEqual(database.transactionResult, {
    outboxIds: workspaceIds.map(
      (workspaceId) => `outbox:${workspaceId}:${userId}`
    ),
    shouldRequestWorkspaceSweep: true
  });
  assert.ok(sequence.indexOf("calendar:locked") < sequence.indexOf("user:locked"));
  assert.ok(sequence.indexOf("workspace:prepared") < sequence.indexOf("calendar:cleaned"));
  assert.ok(sequence.indexOf("calendar:cleaned") < sequence.indexOf("transaction:commit"));
  assert.ok(
    sequence.indexOf(`revocation:enqueued:${ownerWorkspaceIds[0]}`) <
      sequence.indexOf("workspace:scheduled")
  );
  assert.ok(sequence.indexOf("workspace:scheduled") < sequence.indexOf("transaction:commit"));
  assert.equal(
    database.statements.some((text) => text.includes("UPDATE user_sessions")),
    true
  );
  assert.equal(
    database.statements.some((text) =>
      text.includes("UPDATE github_oauth_connections")
    ),
    true
  );
  assert.equal(
    database.statements.some(
      (text) => text.includes("UPDATE users") && text.includes("deleted_at = now()")
    ),
    true
  );
});

test("계정 탈퇴는 commit 후 membership 회수 event를 발행하고 Workspace sweep을 요청한다", async () => {
  const sequence = [];
  const database = createDatabase({ sequence });
  const outbox = createOutbox(sequence);
  const workspaceService = createWorkspaceService(sequence);
  const service = createSubject({ database, outbox, sequence, workspaceService });

  assert.deepEqual(
    await service.deleteCurrentUser(userId, { confirmationText: "계정 탈퇴" }),
    { deleted: true }
  );
  assert.deepEqual(
    outbox.enqueued,
    workspaceIds.map((workspaceId) => ({
      id: `outbox:${workspaceId}:${userId}`,
      workspaceId,
      userId
    }))
  );
  const commitIndex = sequence.indexOf("transaction:commit");
  assert.ok(
    sequence
      .filter((entry) => entry.startsWith("revocation:enqueued:"))
      .every((entry) => sequence.indexOf(entry) < commitIndex)
  );
  assert.ok(
    sequence
      .filter((entry) => entry.startsWith("revocation:published:"))
      .every((entry) => sequence.indexOf(entry) > commitIndex)
  );
  assert.ok(sequence.indexOf("workspace:sweep") > commitIndex);
});

test("blocker가 있는 owner Workspace는 이름과 원인을 포함한 409를 반환하고 전체 rollback한다", async () => {
  const sequence = [];
  const database = createDatabase({ sequence });
  const outbox = createOutbox(sequence);
  const blockedWorkspaces = [
    {
      workspaceId: workspaceIds[0],
      name: "PILO Team",
      memberCount: 2,
      reasons: ["MEMBERS_REMAIN"]
    }
  ];
  const workspaceService = createWorkspaceService(sequence, blockedWorkspaces);
  const service = createSubject({ database, outbox, sequence, workspaceService });

  await assert.rejects(
    () => service.deleteCurrentUser(userId, { confirmationText: "계정 탈퇴" }),
    (error) => {
      assert.equal(error.getStatus(), 409);
      assert.match(error.getResponse().error.message, /PILO Team/);
      assert.deepEqual(error.getResponse().error.details, { blockedWorkspaces });
      return true;
    }
  );
  assert.equal(sequence.includes("calendar:cleaned"), false);
  assert.deepEqual(outbox.enqueued, []);
});

test("계정 탈퇴 transaction 실패는 회수 event와 Workspace sweep을 실행하지 않는다", async () => {
  const sequence = [];
  const outbox = createOutbox(sequence);
  const workspaceService = createWorkspaceService(sequence);
  const service = createSubject({
    database: createDatabase({ failCommit: true, sequence }),
    outbox,
    sequence,
    workspaceService
  });

  await assert.rejects(() =>
    service.deleteCurrentUser(userId, { confirmationText: "계정 탈퇴" })
  );
  assert.deepEqual(outbox.published, []);
  assert.equal(workspaceService.sweepRequests, 0);
});

test("회수 event 발행 실패는 성공 응답과 다른 Workspace 발행을 막지 않는다", async () => {
  const sequence = [];
  const outbox = createOutbox(sequence, {
    publishFailedWorkspaceId: workspaceIds[0]
  });
  const service = createSubject({
    database: createDatabase({ sequence }),
    outbox,
    sequence,
    workspaceService: createWorkspaceService(sequence)
  });

  assert.deepEqual(
    await service.deleteCurrentUser(userId, { confirmationText: "계정 탈퇴" }),
    { deleted: true }
  );
  assert.deepEqual(
    outbox.published,
    workspaceIds.map((workspaceId) => `outbox:${workspaceId}:${userId}`)
  );
});

class RaceDatabase {
  constructor() {
    this.deleted = false;
    this.settings = null;
    this.waiters = [];
    this.lockTail = Promise.resolve();
  }

  waitForUserLock() {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async transaction(callback) {
    let releaseUserLock = null;
    const transaction = {
      execute: async (text) => {
        if (/UPDATE users[\s\S]*deleted_at = now\(\)/.test(text)) {
          this.deleted = true;
        }
        if (/DELETE FROM user_settings/.test(text)) {
          this.settings = null;
        }
        return { rowCount: 1, rows: [] };
      },
      query: async (text) =>
        /DELETE FROM workspace_members/.test(text) ? [] : [],
      queryOne: async (text) => {
        if (/FROM users[\s\S]*FOR UPDATE/.test(text)) {
          const previous = this.lockTail;
          this.lockTail = new Promise((resolve) => {
            releaseUserLock = resolve;
          });
          await previous;
          for (const resolve of this.waiters.splice(0)) resolve();
          return this.deleted ? null : { id: userId };
        }
        if (/FROM user_settings/.test(text)) {
          return this.settings;
        }
        if (/INSERT INTO user_settings/.test(text)) {
          this.settings = {
            theme: "dark",
            density: "comfortable",
            default_workspace_id: null,
            default_landing_page: "home",
            restore_last_workspace: true,
            created_at: new Date("2026-07-23T00:00:00.000Z"),
            updated_at: new Date("2026-07-23T00:00:00.000Z")
          };
          return this.settings;
        }
        return null;
      }
    };
    try {
      return await callback(transaction);
    } finally {
      releaseUserLock?.();
    }
  }
}

function createRaceUserService(database) {
  return new UserService(
    database,
    createOutbox([]),
    {
      async lockAccountLifecycleInTransaction() {},
      async cleanupAccountInTransaction() {}
    },
    {
      async prepareOwnedWorkspacesForAccountDeletion() {
        return {
          blockedWorkspaces: [],
          workspaceIdsToDelete: [],
          shouldRequestSweep: false
        };
      },
      async scheduleOwnedWorkspacesForAccountDeletion() {},
      requestDeletionSweep() {}
    }
  );
}

test("탈퇴가 user lock을 먼저 잡으면 in-flight Settings mutation은 설정을 재생성하지 못한다", async () => {
  const database = new RaceDatabase();
  const userService = createRaceUserService(database);
  const settingsService = new SettingsService(database);

  const deletion = userService.deleteCurrentUser(userId, {
    confirmationText: "계정 탈퇴"
  });
  await database.waitForUserLock();
  const mutation = settingsService.updateSettings(userId, { theme: "dark" });
  const [, mutationResult] = await Promise.allSettled([deletion, mutation]);

  assert.equal(mutationResult.status, "rejected");
  assert.equal(mutationResult.reason.getStatus(), 401);
  assert.equal(database.settings, null);
});

test("탈퇴가 user lock을 먼저 잡으면 in-flight Profile mutation도 설정을 재생성하지 못한다", async () => {
  const database = new RaceDatabase();
  const userService = createRaceUserService(database);

  const deletion = userService.deleteCurrentUser(userId, {
    confirmationText: "계정 탈퇴"
  });
  await database.waitForUserLock();
  const mutation = userService.updateCurrentUserProfile(userId, {
    displayName: "다시 생성되면 안 됨"
  });
  const [, mutationResult] = await Promise.allSettled([deletion, mutation]);

  assert.equal(mutationResult.status, "rejected");
  assert.equal(mutationResult.reason.getStatus(), 401);
  assert.equal(database.settings, null);
});

test("Settings mutation이 먼저 끝나도 후속 탈퇴가 설정을 최종 삭제한다", async () => {
  const database = new RaceDatabase();
  const userService = createRaceUserService(database);
  const settingsService = new SettingsService(database);

  const mutation = settingsService.updateSettings(userId, { theme: "dark" });
  await database.waitForUserLock();
  const deletion = userService.deleteCurrentUser(userId, {
    confirmationText: "계정 탈퇴"
  });
  await Promise.all([mutation, deletion]);

  assert.equal(database.settings, null);
  assert.equal(database.deleted, true);
});

test("Calendar 계정 정리는 credential과 모든 미완료 outbox를 transaction 안에서 제거한다", async () => {
  const statements = [];
  const service = new GoogleCalendarSyncService(
    {},
    {},
    {},
    {}
  );
  await service.cleanupAccountInTransaction(
    {
      async execute(text, values) {
        statements.push({ text, values });
        return { rowCount: 1 };
      }
    },
    userId
  );

  assert.equal(
    statements.some(({ text }) =>
      text.includes("DELETE FROM google_calendar_oauth_states")
    ),
    true
  );
  assert.equal(
    statements.some(
      ({ text }) =>
        text.includes("calendar_event_google_syncs") &&
        text.includes("status <> 'disconnected'")
    ),
    true
  );
  assert.equal(
    statements.some(
      ({ text }) =>
        text.includes("calendar_google_sync_outbox") &&
        text.includes("status <> 'delivered'") &&
        text.includes("claim_token=NULL")
    ),
    true
  );
  assert.equal(
    statements.some(({ text }) =>
      text.includes("DELETE FROM google_calendar_connections")
    ),
    true
  );
});

test("claim 뒤 계정 정리로 outbox가 종료되면 Calendar provider를 호출하지 않는다", async () => {
  let providerCalls = 0;
  const claim = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    calendar_event_id: 42,
    connection_user_id: userId,
    operation: "create",
    payload: {
      id: 42,
      title: "Deleted account event",
      description: null,
      isAllDay: true,
      startDate: "2026-07-23",
      endDate: "2026-07-23",
      startTime: null,
      endTime: null,
      updatedAt: "2026-07-23T00:00:00.000Z"
    },
    attempt_count: 1,
    claim_token: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  };
  const connection = {
    async execute() {
      return { rowCount: 1 };
    },
    async queryOne(text) {
      if (text.includes("status='publishing'")) return null;
      return null;
    }
  };
  const database = {
    async query() {
      return [{ id: claim.id }];
    },
    async transaction(callback) {
      return callback({
        async queryOne() {
          return claim;
        }
      });
    },
    async withAdvisoryLock(_key, callback) {
      return callback(connection);
    }
  };
  const client = {
    async insertEvent() {
      providerCalls += 1;
      return "remote-id";
    },
    async updateEvent() {
      providerCalls += 1;
    },
    async deleteEvent() {
      providerCalls += 1;
    }
  };
  const service = new GoogleCalendarSyncService(database, {}, client, {});

  await service.publishDue();

  assert.equal(providerCalls, 0);
});

test("탈퇴한 사용자의 Calendar OAuth callback은 token exchange를 호출하지 않는다", async () => {
  let providerCalls = 0;
  const database = {
    async transaction(callback) {
      return callback({
        async queryOne() {
          return { user_id: userId, return_path: "/calendar" };
        }
      });
    },
    async withAdvisoryLock(_key, callback) {
      return callback({
        async queryOne() {
          return null;
        }
      });
    }
  };
  const client = {
    async exchangeCode() {
      providerCalls += 1;
      return { accessToken: "not-used", refreshToken: "not-used" };
    }
  };
  const service = new GoogleCalendarSyncService(database, {}, client, {});

  await assert.rejects(
    () => service.completeConnection({ code: "code", state: "state" }),
    (error) => error.getStatus() === 400
  );
  assert.equal(providerCalls, 0);
});
