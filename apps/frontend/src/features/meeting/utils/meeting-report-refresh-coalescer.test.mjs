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

test("같은 reportId의 realtime refresh는 기존 요청이 진행 중이면 하나로 병합한다", async () => {
  const gate = deferred();
  const refreshedReportIds = [];
  const coalescer = createMeetingReportRefreshCoalescer();
  const refresh = async () => {
    refreshedReportIds.push("report-1");
    await gate.promise;
  };

  const first = coalescer.run("report-1", refresh);
  const duplicate = coalescer.run("report-1", refresh);

  assert.equal(first, duplicate);
  assert.deepEqual(refreshedReportIds, ["report-1"]);

  gate.resolve();
  await first;
});

test("서로 다른 reportId와 완료 후 새 이벤트는 각각 refresh한다", async () => {
  const refreshedReportIds = [];
  const coalescer = createMeetingReportRefreshCoalescer();

  await Promise.all([
    coalescer.run("report-1", async () => {
      refreshedReportIds.push("report-1");
    }),
    coalescer.run("report-2", async () => {
      refreshedReportIds.push("report-2");
    }),
  ]);
  await coalescer.run("report-1", async () => {
    refreshedReportIds.push("report-1");
  });

  assert.deepEqual(refreshedReportIds, ["report-1", "report-2", "report-1"]);
});
