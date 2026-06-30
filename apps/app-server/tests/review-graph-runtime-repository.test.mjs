import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  RuntimeReviewGraphRepository,
} = require("../src/modules/review/graph/runtime-review-graph.repository.ts");

const ANALYSIS_ID = "88888888-8888-4888-8888-888888888881";
const PULL_REQUEST_ID = "66666666-6666-4666-8666-666666666661";
const GRAPH_ID = "88888888-8888-4888-8888-8888888888d1";
const NODE_ID = "review-node-runtime-file";
const MEMBER_ID = "33333333-3333-4333-8333-333333333331";

describe("RuntimeReviewGraphRepository database persistence", () => {
  it("restores review graph, nodes, and reviewer states after repository restart", async () => {
    await withDatabaseConnectEnabled(async () => {
      const database = createReviewGraphDatabaseStub();
      const repository = new RuntimeReviewGraphRepository(database);

      const graph = await repository.saveGraph({
        id: GRAPH_ID,
        analysisId: ANALYSIS_ID,
        pullRequestId: PULL_REQUEST_ID,
        summary: "runtime review graph",
        intentSummary: "show generated review order",
        reviewStrategy: "start with the changed Review room component",
        reviewOrder: [NODE_ID],
      });
      const node = await repository.saveNode({
        id: NODE_ID,
        graphId: GRAPH_ID,
        nodeType: "file",
        label: "apps/frontend/components/review/ReviewRoomWorkspace.tsx",
        filePath: "apps/frontend/components/review/ReviewRoomWorkspace.tsx",
        functionName: null,
        riskLevel: "high",
        reviewOrder: 1,
        roleSummary: "renders review room data",
        reviewReason: "connects generated result data to UI",
        position: { x: 120, y: 80 },
      });
      const state = await repository.saveState({
        id: "77777777-7777-4777-8777-777777777771",
        nodeId: NODE_ID,
        reviewerMemberId: MEMBER_ID,
        status: "discuss",
        comment: "Check runtime graph persistence",
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:01:00.000Z",
      });
      const restartedRepository = new RuntimeReviewGraphRepository(database);

      assert.equal(repository.mode, "database");
      assert.deepEqual(
        await restartedRepository.findGraphByAnalysis(ANALYSIS_ID),
        graph,
      );
      assert.deepEqual(
        await restartedRepository.listNodesByGraph(GRAPH_ID),
        [node],
      );
      assert.deepEqual(await restartedRepository.findNodeById(NODE_ID), node);
      assert.deepEqual(
        await restartedRepository.findStateByNodeReviewer(NODE_ID, MEMBER_ID),
        state,
      );
      assert.deepEqual(await restartedRepository.listStatesByNode(NODE_ID), [
        state,
      ]);
      assert.equal(
        database.calls.some((call) => /INSERT INTO review_graphs/.test(call.sql)),
        true,
      );
      assert.equal(
        database.calls.some((call) => /INSERT INTO review_nodes/.test(call.sql)),
        true,
      );
      assert.equal(
        database.calls.some((call) =>
          /INSERT INTO node_review_states/.test(call.sql),
        ),
        true,
      );
    });
  });

  it("falls back to memory storage when database connection is explicitly skipped", async () => {
    await withDatabaseConnectSkipped(async () => {
      const database = createReviewGraphDatabaseStub();
      const repository = new RuntimeReviewGraphRepository(database);

      await repository.saveGraph({
        id: GRAPH_ID,
        analysisId: ANALYSIS_ID,
        pullRequestId: PULL_REQUEST_ID,
        summary: null,
        intentSummary: "pending",
        reviewStrategy: "wait for graph output",
        reviewOrder: [],
      });

      assert.equal(repository.mode, "memory");
      assert.equal(
        (await repository.findGraphByAnalysis(ANALYSIS_ID)).id,
        GRAPH_ID,
      );
      assert.equal(database.calls.length, 0);
    });
  });
});

async function withDatabaseConnectEnabled(callback) {
  const previous = process.env.PILO_SKIP_DATABASE_CONNECT;
  delete process.env.PILO_SKIP_DATABASE_CONNECT;

  try {
    await callback();
  } finally {
    restoreDatabaseSkip(previous);
  }
}

async function withDatabaseConnectSkipped(callback) {
  const previous = process.env.PILO_SKIP_DATABASE_CONNECT;
  process.env.PILO_SKIP_DATABASE_CONNECT = "true";

  try {
    await callback();
  } finally {
    restoreDatabaseSkip(previous);
  }
}

function restoreDatabaseSkip(previous) {
  if (previous === undefined) {
    delete process.env.PILO_SKIP_DATABASE_CONNECT;
    return;
  }

  process.env.PILO_SKIP_DATABASE_CONNECT = previous;
}

function createReviewGraphDatabaseStub() {
  const state = {
    graphsById: new Map(),
    graphIdsByAnalysis: new Map(),
    nodesById: new Map(),
    nodeIdsByGraph: new Map(),
    statesById: new Map(),
    stateIdsByNodeReviewer: new Map(),
  };
  const calls = [];
  const database = {
    state,
    calls,
    async $queryRaw(strings, ...values) {
      const sql = normalizeSql(strings);
      const params = queryParams(values);
      calls.push({ sql, values: params });

      if (/SELECT .* FROM review_graphs.*WHERE analysis_id =/.test(sql)) {
        const analysisId = findUuid(params);
        const graphId = state.graphIdsByAnalysis.get(analysisId);
        return rowForGraph(state.graphsById.get(graphId));
      }

      if (/INSERT INTO review_graphs/.test(sql)) {
        const [
          id,
          analysisId,
          pullRequestId,
          summary,
          intentSummary,
          reviewStrategy,
          reviewOrderJson,
        ] = params;
        const existingId = state.graphIdsByAnalysis.get(analysisId);
        const graph = {
          id: existingId ?? id,
          analysisId,
          pullRequestId,
          summary,
          intentSummary,
          reviewStrategy,
          reviewOrder: JSON.parse(reviewOrderJson),
        };

        state.graphsById.set(graph.id, graph);
        state.graphIdsByAnalysis.set(analysisId, graph.id);
        return rowForGraph(graph);
      }

      if (/SELECT .* FROM review_nodes.*WHERE id =/.test(sql)) {
        return rowForNode(state.nodesById.get(params[0]));
      }

      if (/SELECT .* FROM review_nodes.*WHERE graph_id =/.test(sql)) {
        const graphId = findUuid(params);

        return (state.nodeIdsByGraph.get(graphId) ?? [])
          .flatMap((nodeId) => rowForNode(state.nodesById.get(nodeId)))
          .sort((left, right) => left.reviewOrder - right.reviewOrder);
      }

      if (/INSERT INTO review_nodes/.test(sql)) {
        const [
          id,
          graphId,
          nodeType,
          label,
          filePath,
          functionName,
          riskLevel,
          reviewOrder,
          roleSummary,
          reviewReason,
          positionJson,
        ] = params;
        const node = {
          id,
          graphId,
          nodeType,
          label,
          filePath,
          functionName,
          riskLevel,
          reviewOrder,
          roleSummary,
          reviewReason,
          position: JSON.parse(positionJson),
        };
        const nodeIds = state.nodeIdsByGraph.get(graphId) ?? [];

        state.nodesById.set(id, node);
        if (!nodeIds.includes(id)) {
          state.nodeIdsByGraph.set(graphId, [...nodeIds, id]);
        }

        return rowForNode(node);
      }

      if (
        /SELECT .* FROM node_review_states.*WHERE node_id =.*AND reviewer_member_id/.test(
          sql,
        )
      ) {
        const [nodeId, reviewerMemberId] = params;
        const stateId = state.stateIdsByNodeReviewer.get(
          stateKey(nodeId, reviewerMemberId),
        );

        return rowForState(state.statesById.get(stateId));
      }

      if (/SELECT .* FROM node_review_states.*WHERE node_id =/.test(sql)) {
        const nodeId = params[0];

        return [...state.statesById.values()].filter(
          (entry) => entry.nodeId === nodeId,
        );
      }

      if (/INSERT INTO node_review_states/.test(sql)) {
        const [
          id,
          nodeId,
          reviewerMemberId,
          status,
          comment,
          createdAt,
          updatedAt,
        ] = params;
        const existingId = state.stateIdsByNodeReviewer.get(
          stateKey(nodeId, reviewerMemberId),
        );
        const existing = state.statesById.get(existingId);
        const reviewState = {
          id: existing?.id ?? id,
          nodeId,
          reviewerMemberId,
          status,
          comment,
          createdAt: existing?.createdAt ?? createdAt,
          updatedAt,
        };

        state.statesById.set(reviewState.id, reviewState);
        state.stateIdsByNodeReviewer.set(
          stateKey(nodeId, reviewerMemberId),
          reviewState.id,
        );
        return rowForState(reviewState);
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  return database;
}

function rowForGraph(graph) {
  return graph
    ? [
        {
          id: graph.id,
          analysisId: graph.analysisId,
          pullRequestId: graph.pullRequestId,
          summary: graph.summary,
          intentSummary: graph.intentSummary,
          reviewStrategy: graph.reviewStrategy,
          reviewOrder: graph.reviewOrder,
        },
      ]
    : [];
}

function rowForNode(node) {
  return node
    ? [
        {
          id: node.id,
          graphId: node.graphId,
          nodeType: node.nodeType,
          label: node.label,
          filePath: node.filePath,
          functionName: node.functionName,
          riskLevel: node.riskLevel,
          reviewOrder: node.reviewOrder,
          roleSummary: node.roleSummary,
          reviewReason: node.reviewReason,
          position: node.position,
        },
      ]
    : [];
}

function rowForState(state) {
  return state
    ? [
        {
          id: state.id,
          nodeId: state.nodeId,
          reviewerMemberId: state.reviewerMemberId,
          status: state.status,
          comment: state.comment,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
        },
      ]
    : [];
}

function queryParams(values) {
  return values.filter(
    (value) =>
      !(
        value &&
        typeof value === "object" &&
        Array.isArray(value.strings)
      ),
  );
}

function stateKey(nodeId, reviewerMemberId) {
  return `${nodeId}:${reviewerMemberId}`;
}

function findUuid(values) {
  return values.find(
    (value) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value),
  );
}

function normalizeSql(strings) {
  const parts = Array.isArray(strings)
    ? Array.from(strings)
    : Array.isArray(strings?.strings)
      ? strings.strings
      : [String(strings)];

  return parts.join("?").replace(/\s+/g, " ").trim();
}
