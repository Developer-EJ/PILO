import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");
require("reflect-metadata");

const { MODULE_METADATA } = require("@nestjs/common/constants");
const {
  WorkspaceAccessPublicService,
} = require("../src/modules/workspace/public/workspace-access-public.service");
const {
  WorkspaceModule,
} = require("../src/modules/workspace/workspace.module");
const {
  WorkspaceMemberAccessService,
} = require("../src/modules/workspace/workspace-member-access.service");

describe("WorkspaceModule", () => {
  it("exports the public workspace access contract instead of the internal member access service", () => {
    const exportsMetadata =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, WorkspaceModule) ?? [];

    assert.ok(exportsMetadata.includes(WorkspaceAccessPublicService));
    assert.equal(exportsMetadata.includes(WorkspaceMemberAccessService), false);
  });
});
