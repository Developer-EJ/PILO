import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authProviderHref } from "../app/login/authProviderHref.mjs";
import packageJson from "../package.json" with { type: "json" };
import contractSchema from "../../../docs/contracts/schemas/pilo-public-contracts.schema.json" with { type: "json" };
import contractCanvasBoardDetailFixture from "../../../docs/contracts/fixtures/canvas-board-detail.fixture.json" with { type: "json" };

describe("frontend package", () => {
  it("keeps the PILO frontend package name", () => {
    assert.equal(packageJson.name, "@pilo/frontend");
  });

  it("keeps auth provider hrefs relative when no app server URL is configured", () => {
    assert.equal(
      authProviderHref("/auth/google/start", undefined),
      "/auth/google/start",
    );
    assert.equal(
      authProviderHref("/auth/github/start", undefined),
      "/auth/github/start",
    );
  });

  it("uses the configured app server URL for auth provider hrefs", () => {
    assert.equal(
      authProviderHref("/auth/google/start", "https://api.pilo.dev/"),
      "https://api.pilo.dev/auth/google/start",
    );
    assert.equal(
      authProviderHref("/auth/github/start", "https://api.pilo.dev"),
      "https://api.pilo.dev/auth/github/start",
    );
  });

  it("keeps Auth frontend contracts aligned with the public schema", () => {
    const defs = contractSchema.$defs;

    assert.deepEqual(defs.AuthProvider.enum, ["google", "github"]);
    assert.deepEqual(defs.CurrentUser.required, [
      "id",
      "email",
      "name",
      "avatarUrl",
      "providers",
      "lastLoginAt",
    ]);
    assert.equal(
      defs.CurrentUser.properties.providers.items.$ref,
      "#/$defs/AuthProvider",
    );
    assert.equal(defs.AuthSessionState.oneOf.length, 2);
    assert.equal(
      defs.AuthSessionState.oneOf[0].properties.user.$ref,
      "#/$defs/CurrentUser",
    );
    assert.deepEqual(defs.AuthSessionState.oneOf[1].properties.user, {
      type: "null",
    });
    assert.equal(
      defs.AuthProvidersResponse.properties.providers.items.$ref,
      "#/$defs/AuthProviderSummary",
    );
    assert.equal(defs.AuthErrorResponse.properties.statusCode.enum[0], 401);
  });

  it("keeps dashboard frontend contracts aligned with the public schema", () => {
    const dashboard = contractSchema.$defs.WorkspaceDashboardReadModel;

    assert.deepEqual(dashboard.required, [
      "workspace",
      "currentMember",
      "preferences",
      "members",
      "tasks",
      "progress",
      "githubIssues",
      "pullRequests",
      "meetingReports",
      "prAnalyses",
      "agentActions",
      "canvasEntities",
      "source",
      "generatedAt",
    ]);
    assert.equal(
      dashboard.properties.workspace.$ref,
      "#/$defs/WorkspaceSummary",
    );
    assert.equal(
      dashboard.properties.currentMember.$ref,
      "#/$defs/CurrentWorkspaceMember",
    );
    assert.equal(
      dashboard.properties.preferences.$ref,
      "#/$defs/DashboardPreferences",
    );
    assert.equal(dashboard.properties.tasks.items.$ref, "#/$defs/TaskSummary");
    assert.equal(
      dashboard.properties.pullRequests.items.$ref,
      "#/$defs/PullRequestSummary",
    );
    assert.deepEqual(dashboard.properties.source.enum, ["fixture", "empty"]);
  });

  it("keeps Canvas board detail fixture aligned with the public schema", () => {
    const defs = contractSchema.$defs;
    const boardDetail = defs.CanvasBoardDetail;

    assert.deepEqual(Object.keys(contractCanvasBoardDetailFixture).sort(), [
      "boardType",
      "connectionCount",
      "connections",
      "filterSetting",
      "id",
      "shapeCount",
      "shapes",
      "title",
      "updatedAt",
      "viewSetting",
      "workspaceId",
    ]);
    assert.deepEqual(
      Object.keys(contractCanvasBoardDetailFixture).sort(),
      Object.keys(boardDetail.properties).sort(),
    );
    assert.equal(
      boardDetail.properties.shapes.items.$ref,
      "#/$defs/CanvasShapeSummary",
    );
    assert.equal(
      boardDetail.properties.connections.items.$ref,
      "#/$defs/CanvasConnectionSummary",
    );
    assert.equal(
      boardDetail.properties.viewSetting.$ref,
      "#/$defs/CanvasViewSetting",
    );
    assert.equal(
      boardDetail.properties.filterSetting.$ref,
      "#/$defs/CanvasFilterSetting",
    );
  });
});
