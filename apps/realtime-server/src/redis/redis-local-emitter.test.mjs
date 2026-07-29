import assert from "node:assert/strict";
import test from "node:test";

import { createRedisLocalEmitter } from "../../dist/redis/redis-local-emitter.js";

function createRealtimeTask(taskName) {
  const clusterEmissions = [];
  const localEmissions = [];
  const io = {
    local: {
      to(roomName) {
        return {
          emit(eventName, payload) {
            localEmissions.push({ eventName, payload, roomName, taskName });
          },
        };
      },
    },
    to(roomName) {
      return {
        emit(eventName, payload) {
          clusterEmissions.push({ eventName, payload, roomName, taskName });
        },
      };
    },
  };

  return {
    clusterEmissions,
    emitRedisEventLocally: createRedisLocalEmitter(io),
    localEmissions,
  };
}

test("각 Realtime Task가 같은 Domain Redis 이벤트를 받아도 로컬 소켓에 한 번씩만 전달한다", () => {
  const taskA = createRealtimeTask("A");
  const taskB = createRealtimeTask("B");
  const event = { reportId: "report-1", status: "COMPLETED" };

  taskA.emitRedisEventLocally(
    "workspace:workspace-1:meeting",
    "meeting:report:updated",
    event,
  );
  taskB.emitRedisEventLocally(
    "workspace:workspace-1:meeting",
    "meeting:report:updated",
    event,
  );

  assert.deepEqual(taskA.clusterEmissions, []);
  assert.deepEqual(taskB.clusterEmissions, []);
  assert.deepEqual(taskA.localEmissions, [
    {
      eventName: "meeting:report:updated",
      payload: event,
      roomName: "workspace:workspace-1:meeting",
      taskName: "A",
    },
  ]);
  assert.deepEqual(taskB.localEmissions, [
    {
      eventName: "meeting:report:updated",
      payload: event,
      roomName: "workspace:workspace-1:meeting",
      taskName: "B",
    },
  ]);
});
