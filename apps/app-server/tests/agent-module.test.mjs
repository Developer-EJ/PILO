import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");
require("reflect-metadata");

const { MODULE_METADATA } = require("@nestjs/common/constants");
const { AgentModule } = require("../src/modules/agent/agent.module");
const {
  AgentRegistryRepository,
} = require("../src/modules/agent/agent-registry.repository");
const {
  AgentRegistryService,
} = require("../src/modules/agent/agent-registry.service");
const {
  AgentRuntimeService,
} = require("../src/modules/agent/agent-runtime.service");

describe("AgentModule", () => {
  it("exports the Agent registry and runtime boundaries", () => {
    const exportsMetadata =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, AgentModule) ?? [];

    assert.ok(exportsMetadata.includes(AgentRegistryRepository));
    assert.ok(exportsMetadata.includes(AgentRegistryService));
    assert.ok(exportsMetadata.includes(AgentRuntimeService));
  });
});
