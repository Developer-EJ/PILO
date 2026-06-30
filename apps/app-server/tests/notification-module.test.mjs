import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import "reflect-metadata";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  ForbiddenException,
  RequestMethod,
  UnauthorizedException,
} = require("@nestjs/common");
const { METHOD_METADATA, PATH_METADATA } = require("@nestjs/common/constants");
const {
  NotificationController,
} = require("../src/modules/notification/notification.controller");
const {
  NotificationService,
} = require("../src/modules/notification/notification.service");
const {
  MockNotificationRepository,
} = require("../src/modules/notification/repositories/notification.mock-repository");
const {
  NOTIFICATION_REPOSITORY,
} = require("../src/modules/notification/repositories/notification.repository");
const {
  WorkspaceAccessError,
} = require("../src/modules/workspace/workspace.service");

const currentUser = {
  id: "user-1",
  name: "User One",
  email: "user-one@example.com",
  avatarUrl: null,
  providers: ["github"],
  lastLoginAt: "2026-06-30T00:00:00.000Z",
};

const otherUser = {
  ...currentUser,
  id: "user-2",
  email: "user-two@example.com",
};

function createCurrentMemberAdapter() {
  return {
    calls: [],
    async requireCurrentMember(input) {
      this.calls.push(input);

      if (input.workspaceId === "missing-workspace") {
        throw new WorkspaceAccessError(input.workspaceId);
      }

      return {
        currentMember: {
          workspaceId: input.workspaceId,
          memberId: `member-${input.currentUser.id}`,
          userId: input.currentUser.id,
          role: "member",
          displayName: null,
        },
        permissions: {},
      };
    },
  };
}

function createNotificationService() {
  const repository = new MockNotificationRepository();
  const currentMemberAdapter = createCurrentMemberAdapter();
  const service = new NotificationService(repository, currentMemberAdapter);

  return {
    currentMemberAdapter,
    repository,
    service,
  };
}

describe("notification module", () => {
  it("keeps the notification repository behind an injectable token", () => {
    assert.equal(typeof NOTIFICATION_REPOSITORY, "symbol");
  });

  it("exposes scaffold and runtime routes through controller metadata", () => {
    const { service } = createNotificationService();
    const controller = new NotificationController(
      {
        getCurrentUserFromCookieHeader: () => currentUser,
      },
      service,
    );

    assert.deepEqual(service.getScaffoldStatus(), {
      module: "notification",
      repositoryMode: "mock",
    });
    assert.deepEqual(
      controller.getScaffoldStatus(),
      service.getScaffoldStatus(),
    );

    assert.equal(
      Reflect.getMetadata(PATH_METADATA, controller.getScaffoldStatus),
      "notifications",
    );
    assert.equal(
      Reflect.getMetadata(METHOD_METADATA, controller.getScaffoldStatus),
      RequestMethod.GET,
    );
    assert.equal(
      Reflect.getMetadata(PATH_METADATA, controller.listWorkspaceNotifications),
      "workspaces/:workspaceId/notifications",
    );
    assert.equal(
      Reflect.getMetadata(
        METHOD_METADATA,
        controller.listWorkspaceNotifications,
      ),
      RequestMethod.GET,
    );
    assert.equal(
      Reflect.getMetadata(PATH_METADATA, controller.markNotificationRead),
      "notifications/:notificationId/read",
    );
    assert.equal(
      Reflect.getMetadata(METHOD_METADATA, controller.markNotificationRead),
      RequestMethod.PATCH,
    );
    assert.equal(
      Reflect.getMetadata(
        PATH_METADATA,
        controller.markWorkspaceNotificationsRead,
      ),
      "workspaces/:workspaceId/notifications/read-all",
    );
    assert.equal(
      Reflect.getMetadata(
        METHOD_METADATA,
        controller.markWorkspaceNotificationsRead,
      ),
      RequestMethod.PATCH,
    );
  });

  it("lists seeded workspace notifications for the signed-in member only", async () => {
    const { currentMemberAdapter, service } = createNotificationService();
    const notifications = await service.listWorkspaceNotifications({
      workspaceId: "workspace-1",
      currentUser,
    });

    assert.equal(notifications.length, 3);
    assert.deepEqual(
      notifications.map((notification) => notification.type),
      ["agent_approval_required", "review_requested", "task_assigned"],
    );
    assert.equal(
      notifications.every(
        (notification) =>
          notification.workspaceId === "workspace-1" &&
          notification.recipientUserId === currentUser.id &&
          notification.readAt === null,
      ),
      true,
    );
    assert.deepEqual(currentMemberAdapter.calls, [
      {
        workspaceId: "workspace-1",
        currentUser,
      },
    ]);

    await assert.rejects(
      () =>
        service.listWorkspaceNotifications({
          workspaceId: "missing-workspace",
          currentUser,
        }),
      WorkspaceAccessError,
    );
  });

  it("marks one notification read without allowing another user to read it", async () => {
    const { service } = createNotificationService();
    const [notification] = await service.listWorkspaceNotifications({
      workspaceId: "workspace-1",
      currentUser,
    });

    await assert.rejects(
      () =>
        service.markNotificationRead({
          notificationId: notification.id,
          currentUser: otherUser,
        }),
      ForbiddenException,
    );

    const readNotification = await service.markNotificationRead({
      notificationId: notification.id,
      currentUser,
    });

    assert.equal(readNotification.id, notification.id);
    assert.notEqual(readNotification.readAt, null);

    const notifications = await service.listWorkspaceNotifications({
      workspaceId: "workspace-1",
      currentUser,
    });

    assert.equal(
      notifications.find((item) => item.id === notification.id).readAt,
      readNotification.readAt,
    );
  });

  it("marks all unread workspace notifications for the current user", async () => {
    const { service } = createNotificationService();
    await service.listWorkspaceNotifications({
      workspaceId: "workspace-1",
      currentUser,
    });
    await service.listWorkspaceNotifications({
      workspaceId: "workspace-1",
      currentUser: otherUser,
    });

    const result = await service.markWorkspaceNotificationsRead({
      workspaceId: "workspace-1",
      currentUser,
    });

    assert.equal(result.workspaceId, "workspace-1");
    assert.equal(result.recipientUserId, currentUser.id);
    assert.equal(result.updatedCount, 3);
    assert.equal(
      result.notifications.every(
        (notification) =>
          notification.recipientUserId === currentUser.id &&
          notification.readAt !== null,
      ),
      true,
    );

    const otherNotifications = await service.listWorkspaceNotifications({
      workspaceId: "workspace-1",
      currentUser: otherUser,
    });

    assert.equal(
      otherNotifications.every((notification) => notification.readAt === null),
      true,
    );
  });

  it("requires auth in the controller before reading notifications", async () => {
    const { service } = createNotificationService();
    const controller = new NotificationController(
      {
        getCurrentUserFromCookieHeader: () => null,
      },
      service,
    );

    await assert.rejects(
      () =>
        controller.listWorkspaceNotifications(undefined, "workspace-1"),
      UnauthorizedException,
    );
  });

  it("accepts the local MVP user header for notification reads", async () => {
    const { currentMemberAdapter, service } = createNotificationService();
    const controller = new NotificationController(
      {
        getCurrentUserFromCookieHeader: () => null,
      },
      service,
    );

    const notifications = await controller.listWorkspaceNotifications(
      undefined,
      "workspace-1",
      currentUser.id,
    );

    assert.equal(notifications.length, 3);
    assert.equal(
      notifications.every(
        (notification) => notification.recipientUserId === currentUser.id,
      ),
      true,
    );
    assert.deepEqual(currentMemberAdapter.calls, [
      {
        workspaceId: "workspace-1",
        currentUser: {
          id: currentUser.id,
          name: "PILO MVP User",
          email: "local.mvp@pilo.dev",
          avatarUrl: null,
          providers: [],
          lastLoginAt: null,
        },
      },
    ]);
  });
});
