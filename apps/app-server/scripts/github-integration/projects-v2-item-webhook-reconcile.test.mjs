import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { GithubWebhookService } = require("../../dist/modules/github-integration/github-webhook.service.js");

const webhookSecret = "test-webhook-secret";
const receivedAt = "2026-07-11T09:00:00.000Z";
const selectedDeliveryId = "projects-v2-item-selected";
const unselectedDeliveryId = "projects-v2-item-unselected";
const invalidDeliveryId = "projects-v2-item-invalid";
const context = {
  action: "edited",
  githubInstallationId: 123,
  projectV2NodeId: "PVT_kwDOExample",
  projectItemNodeId: "PVTI_lADOExample"
};

class FakeDatabase {
  constructor({ selected, deliveries = [] }) {
    this.selected = selected;
    this.deliveries = new Map(deliveries.map((delivery) => [delivery.delivery_id, delivery]));
    this.queries = [];
  }

  async queryOne(text, values = []) {
    this.queries.push({ method: "queryOne", text, values });

    if (/FROM github_webhook_deliveries/i.test(text) && !/INSERT INTO/i.test(text)) {
      return this.deliveries.get(values[0]) ?? null;
    }

    if (/FROM github_installations/i.test(text)) {
      assert.match(text, /JOIN github_projects_v2/i);
      assert.match(text, /JOIN github_project_v2_selections/i);
      assert.match(text, /owner_type\s*=\s*'Organization'/i);
      assert.deepEqual(values, [context.githubInstallationId, context.projectV2NodeId]);
      return this.selected ? { id: "selected-project" } : null;
    }

    if (/INSERT INTO github_webhook_deliveries/i.test(text)) {
      const hasContext = values.length === 8;
      if (hasContext) {
        assert.match(text, /action/i);
        assert.match(text, /github_installation_id/i);
        assert.match(text, /project_v2_node_id/i);
        assert.match(text, /project_item_node_id/i);
      }

      const delivery = {
        delivery_id: values[0],
        event_name: values[1],
        status: values[2],
        received_at: receivedAt,
        processed_at: values[2] === "received" ? null : receivedAt,
        error_message: hasContext ? values[7] : values[3],
        context: hasContext
          ? {
              action: values[3],
              githubInstallationId: values[4],
              projectV2NodeId: values[5],
              projectItemNodeId: values[6]
            }
          : null
      };
      this.deliveries.set(delivery.delivery_id, delivery);
      return delivery;
    }

    throw new Error(`Unexpected query: ${text}`);
  }

  async execute(text, values = []) {
    this.queries.push({ method: "execute", text, values });
    const delivery = this.deliveries.get(values[0]);

    if (delivery && /status='received'/i.test(text)) {
      delivery.status = "received";
      delivery.processed_at = null;
      delivery.error_message = null;
    }

    return { rowCount: 1 };
  }
}

class ConcurrentFakeDatabase extends FakeDatabase {
  constructor() {
    super({ selected: true });
    this.deliveryLookups = 0;
    this.bothInitialLookups = new Promise((resolve) => {
      this.releaseInitialLookups = resolve;
    });
  }

  async queryOne(text, values = []) {
    this.queries.push({ method: "queryOne", text, values });

    if (/FROM github_webhook_deliveries/i.test(text) && !/INSERT INTO/i.test(text)) {
      const delivery = this.deliveries.get(values[0]) ?? null;
      this.deliveryLookups += 1;

      if (this.deliveryLookups <= 2) {
        if (this.deliveryLookups === 2) this.releaseInitialLookups();
        await this.bothInitialLookups;
      }

      return delivery;
    }

    if (/FROM github_installations/i.test(text)) {
      assert.match(text, /JOIN github_projects_v2/i);
      assert.match(text, /JOIN github_project_v2_selections/i);
      assert.deepEqual(values, [context.githubInstallationId, context.projectV2NodeId]);
      return { id: "selected-project" };
    }

    if (/INSERT INTO github_webhook_deliveries/i.test(text)) {
      const existing = this.deliveries.get(values[0]);
      if (existing) return null;

      const delivery = {
        delivery_id: values[0],
        event_name: values[1],
        status: values[2],
        received_at: receivedAt,
        processed_at: null,
        error_message: values[7],
        context: {
          action: values[3],
          githubInstallationId: values[4],
          projectV2NodeId: values[5],
          projectItemNodeId: values[6]
        }
      };
      this.deliveries.set(delivery.delivery_id, delivery);
      return delivery;
    }

    throw new Error(`Unexpected query: ${text}`);
  }
}

function sign(rawBody) {
  return `sha256=${createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`;
}

function payload(overrides = {}) {
  return {
    action: context.action,
    installation: { id: context.githubInstallationId },
    projects_v2_item: {
      node_id: context.projectItemNodeId,
      project_node_id: context.projectV2NodeId
    },
    ...overrides
  };
}

function createService(database, enqueuedDeliveryIds) {
  return new GithubWebhookService(
    database,
    { getGithubWebhookConfig: () => ({ webhookSecret }) },
    { enqueueWebhookDelivery: async (deliveryId) => enqueuedDeliveryIds.push(deliveryId) }
  );
}

async function receive(service, deliveryId, body) {
  const rawBody = Buffer.from(JSON.stringify(body));
  return service.receiveGithubWebhook({
    deliveryId,
    eventName: "projects_v2_item",
    signature256: sign(rawBody),
    rawBody,
    body
  });
}

{
  const enqueuedDeliveryIds = [];
  const database = new FakeDatabase({ selected: true });
  const service = createService(database, enqueuedDeliveryIds);

  await receive(service, selectedDeliveryId, payload());

  const delivery = database.deliveries.get(selectedDeliveryId);
  assert.equal(enqueuedDeliveryIds.length, 1, "selected item must be queued");
  assert.equal(delivery.status, "received");
  assert.deepEqual(delivery.context, context);
}

{
  const enqueuedDeliveryIds = [];
  const database = new FakeDatabase({ selected: false });
  const service = createService(database, enqueuedDeliveryIds);

  await receive(service, unselectedDeliveryId, payload());

  const delivery = database.deliveries.get(unselectedDeliveryId);
  assert.equal(enqueuedDeliveryIds.length, 0, "unselected item must not be queued");
  assert.equal(delivery.status, "ignored");
  assert.match(delivery.error_message, /not selected/i);
}

{
  const enqueuedDeliveryIds = [];
  const database = new FakeDatabase({ selected: true });
  const service = createService(database, enqueuedDeliveryIds);

  await receive(
    service,
    invalidDeliveryId,
    payload({ projects_v2_item: { node_id: context.projectItemNodeId } })
  );

  const delivery = database.deliveries.get(invalidDeliveryId);
  assert.equal(enqueuedDeliveryIds.length, 0, "invalid item must not be queued");
  assert.equal(delivery.status, "ignored");
  assert.match(delivery.error_message, /context/i);
}

for (const status of ["received", "ignored"]) {
  const deliveryId = `projects-v2-item-duplicate-${status}`;
  const enqueuedDeliveryIds = [];
  const database = new FakeDatabase({
    selected: true,
    deliveries: [{
      delivery_id: deliveryId,
      event_name: "projects_v2_item",
      status,
      received_at: receivedAt,
      processed_at: status === "received" ? null : receivedAt,
      error_message: status === "ignored" ? "GitHub ProjectV2 webhook project is not selected" : null,
      context
    }]
  });
  const service = createService(database, enqueuedDeliveryIds);

  await receive(service, deliveryId, payload());

  assert.equal(enqueuedDeliveryIds.length, 0, `duplicate ${status} delivery must not be queued`);
}

{
  const deliveryId = "projects-v2-item-concurrent-duplicate";
  const enqueuedDeliveryIds = [];
  const database = new ConcurrentFakeDatabase();
  const service = createService(database, enqueuedDeliveryIds);

  await Promise.all([
    receive(service, deliveryId, payload()),
    receive(service, deliveryId, payload())
  ]);

  assert.equal(database.deliveryLookups, 3, "losing insert must read the winning delivery");
  assert.deepEqual(enqueuedDeliveryIds, [deliveryId], "concurrent duplicate delivery queues once");
}

console.log("projects v2 item webhook reconcile tests passed");
