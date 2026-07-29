import assert from "node:assert/strict";
import test from "node:test";

import { createMeetingReportRefreshCoalescer } from "./meeting-report-refresh-coalescer.ts";

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test("같은 reportId와 updatedAt의 realtime 이벤트만 하나로 병합한다", async () => {
  const gate = deferred();
  const refreshedReportIds = [];
  const coalescer = createMeetingReportRefreshCoalescer();
  const event = {
    reportId: "report-1",
    updatedAt: "2026-07-29T00:00:00.000Z",
  };
  const refresh = async () => {
    refreshedReportIds.push("report-1");
    await gate.promise;
  };

  const first = coalescer.run({ ...event }, refresh);
  const duplicate = coalescer.run({ ...event }, refresh);

  assert.equal(first, duplicate);
  assert.deepEqual(refreshedReportIds, ["report-1"]);

  gate.resolve();
  await first;
});

test("같은 reportId의 더 최신 updatedAt은 현재 요청 뒤 trailing refresh한다", async () => {
  const gate = deferred();
  const refreshedSnapshots = [];
  const coalescer = createMeetingReportRefreshCoalescer();

  const summarizing = coalescer.run(
    {
      reportId: "report-1",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
    async () => {
      refreshedSnapshots.push("SUMMARIZING");
      await gate.promise;
    },
  );
  const completed = coalescer.run(
    {
      reportId: "report-1",
      updatedAt: "2026-07-29T00:00:01.000Z",
    },
    async () => {
      refreshedSnapshots.push("COMPLETED");
    },
  );

  assert.equal(summarizing, completed);
  assert.deepEqual(refreshedSnapshots, ["SUMMARIZING"]);

  gate.resolve();
  await Promise.all([summarizing, completed]);
  assert.deepEqual(refreshedSnapshots, ["SUMMARIZING", "COMPLETED"]);
});

test("in-flight 중 여러 최신 이벤트는 가장 최신 closure로 trailing refresh 한 번만 실행한다", async () => {
  const gate = deferred();
  const refreshedSnapshots = [];
  const coalescer = createMeetingReportRefreshCoalescer();

  const first = coalescer.run(
    {
      reportId: "report-1",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
    async () => {
      refreshedSnapshots.push("SUMMARIZING");
      await gate.promise;
    },
  );
  const pendingCompleted = coalescer.run(
    {
      reportId: "report-1",
      updatedAt: "2026-07-29T00:00:01.000Z",
    },
    async () => {
      refreshedSnapshots.push("COMPLETED");
    },
  );
  const pendingContentUpdate = coalescer.run(
    {
      reportId: "report-1",
      updatedAt: "2026-07-29T00:00:02.000Z",
    },
    async () => {
      refreshedSnapshots.push("CONTENT_UPDATED");
    },
  );
  const outOfOrderEvent = coalescer.run(
    {
      reportId: "report-1",
      updatedAt: "2026-07-29T00:00:01.500Z",
    },
    async () => {
      refreshedSnapshots.push("OUT_OF_ORDER");
    },
  );

  assert.equal(pendingCompleted, pendingContentUpdate);
  assert.equal(pendingContentUpdate, outOfOrderEvent);
  assert.deepEqual(refreshedSnapshots, ["SUMMARIZING"]);

  gate.resolve();
  await Promise.all([first, pendingCompleted, pendingContentUpdate]);
  assert.deepEqual(refreshedSnapshots, ["SUMMARIZING", "CONTENT_UPDATED"]);
});

test("현재 refresh가 실패해도 예약된 최신 trailing refresh는 실행한다", async () => {
  const gate = deferred();
  const refreshedSnapshots = [];
  const coalescer = createMeetingReportRefreshCoalescer();

  const failed = coalescer.run(
    {
      reportId: "report-1",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
    async () => {
      refreshedSnapshots.push("SUMMARIZING");
      await gate.promise;
      throw new Error("snapshot failed");
    },
  );
  const completed = coalescer.run(
    {
      reportId: "report-1",
      updatedAt: "2026-07-29T00:00:01.000Z",
    },
    async () => {
      refreshedSnapshots.push("COMPLETED");
    },
  );

  gate.resolve();
  assert.equal(failed, completed);
  await assert.rejects(completed, /snapshot failed/);
  assert.deepEqual(refreshedSnapshots, ["SUMMARIZING", "COMPLETED"]);
});

test("서로 다른 reportId와 완료 후 새 이벤트는 각각 refresh한다", async () => {
  const refreshedReportIds = [];
  const coalescer = createMeetingReportRefreshCoalescer();

  await Promise.all([
    coalescer.run(
      {
        reportId: "report-1",
        updatedAt: "2026-07-29T00:00:00.000Z",
      },
      async () => {
        refreshedReportIds.push("report-1");
      },
    ),
    coalescer.run(
      {
        reportId: "report-2",
        updatedAt: "2026-07-29T00:00:00.000Z",
      },
      async () => {
        refreshedReportIds.push("report-2");
      },
    ),
  ]);
  await coalescer.run(
    {
      reportId: "report-1",
      updatedAt: "2026-07-29T00:00:01.000Z",
    },
    async () => {
      refreshedReportIds.push("report-1");
    },
  );

  assert.deepEqual(refreshedReportIds, ["report-1", "report-2", "report-1"]);
});
