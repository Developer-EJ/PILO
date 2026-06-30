import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");
require("reflect-metadata");

const { MODULE_METADATA } = require("@nestjs/common/constants");
const { AgentModule } = require("../src/modules/agent/agent.module");
const {
  AGENT_OWNER_ACTION_EXECUTOR,
  AgentOwnerActionExecutorService,
} = require("../src/modules/agent/agent-owner-action.executor");
const {
  AgentRegistryRepository,
} = require("../src/modules/agent/agent-registry.repository");
const {
  AgentRegistryService,
} = require("../src/modules/agent/agent-registry.service");
const {
  AgentRuntimeController,
} = require("../src/modules/agent/agent-runtime.controller");
const {
  AgentRuntimeService,
} = require("../src/modules/agent/agent-runtime.service");
const { JuhyungModule } = require("../src/modules/juhyung/juhyung.module");
const {
  JuhyungTaskDraftPublicWriteAdapter,
  TASK_DRAFT_PUBLIC_WRITE_ADAPTER,
} = require("../src/modules/juhyung/public/task-draft-public-write.adapter");
const { MeetingModule } = require("../src/modules/meeting/meeting.module");
const {
  MEETING_ACTION_ITEM_TASK_DRAFT_SOURCE,
  MeetingActionItemTaskDraftSourceAdapter,
} = require("../src/modules/meeting/public/meeting-action-item-taskdraft-source.adapter");
const {
  WorkspaceModule,
} = require("../src/modules/workspace/workspace.module");

describe("AgentModule", () => {
  it("registers the Agent runtime controller and exports runtime boundaries", () => {
    const controllersMetadata =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AgentModule) ?? [];
    const importsMetadata =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentModule) ?? [];
    const providersMetadata =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AgentModule) ?? [];
    const exportsMetadata =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, AgentModule) ?? [];

    assert.ok(controllersMetadata.includes(AgentRuntimeController));
    assert.ok(importsMetadata.includes(JuhyungModule));
    assert.ok(importsMetadata.includes(MeetingModule));
    assert.ok(importsMetadata.includes(WorkspaceModule));
    assert.ok(providersMetadata.includes(AgentOwnerActionExecutorService));
    assert.ok(
      providersMetadata.some(
        (provider) =>
          provider.provide === AGENT_OWNER_ACTION_EXECUTOR &&
          provider.useExisting === AgentOwnerActionExecutorService,
      ),
    );
    assert.ok(exportsMetadata.includes(AgentRegistryRepository));
    assert.ok(exportsMetadata.includes(AgentRegistryService));
    assert.ok(exportsMetadata.includes(AgentRuntimeService));
  });

  it("exports only the TaskDraft public write token from JuhyungModule", () => {
    const providersMetadata =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, JuhyungModule) ?? [];
    const exportsMetadata =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, JuhyungModule) ?? [];

    assert.ok(providersMetadata.includes(JuhyungTaskDraftPublicWriteAdapter));
    assert.ok(exportsMetadata.includes(TASK_DRAFT_PUBLIC_WRITE_ADAPTER));
    assert.equal(
      exportsMetadata.includes(JuhyungTaskDraftPublicWriteAdapter),
      false,
    );
  });

  it("exports only the Meeting ActionItem TaskDraft source token from MeetingModule", () => {
    const providersMetadata =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MeetingModule) ?? [];
    const exportsMetadata =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, MeetingModule) ?? [];

    assert.ok(
      providersMetadata.includes(MeetingActionItemTaskDraftSourceAdapter),
    );
    assert.ok(exportsMetadata.includes(MEETING_ACTION_ITEM_TASK_DRAFT_SOURCE));
    assert.equal(
      exportsMetadata.includes(MeetingActionItemTaskDraftSourceAdapter),
      false,
    );
  });
});
