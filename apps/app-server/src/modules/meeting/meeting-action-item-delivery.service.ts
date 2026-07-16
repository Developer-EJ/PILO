import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { QueryResultRow } from "pg";
import { badRequest, notFound } from "../../common/api-error";
import { DatabaseService, DatabaseTransaction } from "../../database/database.service";
import { BoardService } from "../board/board.service";
import { CalendarService } from "../calendar/calendar.service";
import { WorkspaceService } from "../workspace/workspace.service";

export type MeetingActionItemDeliveryType = "calendar_event" | "pilo_issue";

export interface MeetingActionItemDeliveryInput {
  deliveryType: MeetingActionItemDeliveryType;
  calendar?: {
    title?: string;
    description?: string | null;
    color?: string;
    isAllDay?: boolean;
    startDate: string;
    endDate: string;
    startTime?: string | null;
    endTime?: string | null;
  };
  issue?: {
    boardId: string;
    columnId: string;
    title?: string;
    body?: string;
  };
}

export interface MeetingActionItemDeliveryPayload {
  actionItemId: string;
  deliveryType: MeetingActionItemDeliveryType;
  status: "COMPLETED" | "FAILED";
  calendarEventId?: number;
  piloIssueId?: string;
  errorCode?: string;
}

interface ActionItemRow extends QueryResultRow {
  id: string;
  title: string;
  description: string;
  status: string;
}

interface DeliveryRow extends QueryResultRow {
  id: string;
  delivery_type: MeetingActionItemDeliveryType;
  idempotency_key: string;
}

@Injectable()
export class MeetingActionItemDeliveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly workspaceService: WorkspaceService,
    private readonly calendarService: CalendarService,
    private readonly boardService: BoardService
  ) {}

  async deliver(
    currentUserId: string,
    workspaceId: string,
    reportId: string,
    actionItemId: string,
    input: MeetingActionItemDeliveryInput
  ): Promise<MeetingActionItemDeliveryPayload> {
    await this.workspaceService.assertWorkspaceAccess(currentUserId, workspaceId);
    const prepared = await this.prepareDelivery(
      workspaceId,
      reportId,
      actionItemId,
      input.deliveryType,
      input
    );

    try {
      if (input.deliveryType === "calendar_event") {
        if (!input.calendar) {
          throw badRequest("calendar delivery input is required");
        }
        const calendarInput = {
            title: input.calendar.title ?? prepared.actionItem.title,
            description: input.calendar.description ?? prepared.actionItem.description,
            color: input.calendar.color,
            isAllDay: input.calendar.isAllDay,
            startDate: input.calendar.startDate,
            endDate: input.calendar.endDate,
            startTime: input.calendar.startTime,
            endTime: input.calendar.endTime
          };
        const event = await this.database.transaction(async (transaction) => {
          const created = await this.calendarService.createEventInTransaction(
            transaction,
            currentUserId,
            workspaceId,
            calendarInput
          );
          await this.completeDeliveryInTransaction(
            transaction,
            prepared.delivery.id,
            prepared.actionItem.id,
            currentUserId,
            { calendarEventId: created.id }
          );
          return created;
        });
        return {
          actionItemId,
          deliveryType: "calendar_event",
          status: "COMPLETED",
          calendarEventId: event.id
        };
      }

      if (!input.issue) {
        throw badRequest("issue delivery input is required");
      }
      const result = await this.boardService.createBoardIssue(
        currentUserId,
        workspaceId,
        input.issue.boardId,
        {
          columnId: input.issue.columnId,
          title: input.issue.title ?? prepared.actionItem.title,
          body: input.issue.body ?? prepared.actionItem.description
        },
        prepared.delivery.idempotency_key
      );
      await this.completeIssueDelivery(
        prepared.delivery.id,
        prepared.actionItem.id,
        currentUserId,
        result.issue.id
      );
      return {
        actionItemId,
        deliveryType: "pilo_issue",
        status: "COMPLETED",
        piloIssueId: result.issue.id
      };
    } catch (error) {
      const errorCode = this.toSafeErrorCode(error);
      await this.failDelivery(prepared.delivery.id, prepared.actionItem.id, errorCode);
      return {
        actionItemId,
        deliveryType: input.deliveryType,
        status: "FAILED",
        errorCode
      };
    }
  }

  private async prepareDelivery(
    workspaceId: string,
    reportId: string,
    actionItemId: string,
    deliveryType: MeetingActionItemDeliveryType,
    draft: MeetingActionItemDeliveryInput
  ): Promise<{ actionItem: ActionItemRow; delivery: DeliveryRow }> {
    return this.database.transaction(async (transaction) => {
      const actionItem = await transaction.queryOne<ActionItemRow>(
        `
          SELECT action_items.id, action_items.title, action_items.description, action_items.status
          FROM meeting_report_action_items AS action_items
          JOIN meeting_reports AS reports
            ON reports.id = action_items.meeting_report_id
          JOIN meetings
            ON meetings.id = reports.meeting_id
          WHERE action_items.id = $1
            AND reports.id = $2
            AND meetings.workspace_id = $3
          FOR UPDATE OF action_items
        `,
        [actionItemId, reportId, workspaceId]
      );
      if (!actionItem) {
        throw notFound("Meeting report action item not found");
      }
      if (actionItem.status !== "PENDING" && actionItem.status !== "DELIVERY_FAILED") {
        throw badRequest("Action item is not ready for delivery");
      }

      let delivery = await transaction.queryOne<DeliveryRow>(
        `
          SELECT id, delivery_type, idempotency_key
          FROM meeting_report_action_item_deliveries
          WHERE action_item_id = $1
          FOR UPDATE
        `,
        [actionItem.id]
      );
      if (delivery && delivery.delivery_type !== deliveryType) {
        throw badRequest("Action item delivery type cannot be changed after a failed delivery");
      }
      if (!delivery) {
        delivery = await transaction.queryOne<DeliveryRow>(
          `
            INSERT INTO meeting_report_action_item_deliveries (
              action_item_id, delivery_type, draft_json, idempotency_key
            )
            VALUES ($1, $2, $3::jsonb, $4)
            RETURNING id, delivery_type, idempotency_key
          `,
          [
            actionItem.id,
            deliveryType,
            JSON.stringify(draft),
            `meeting-action-item:${actionItem.id}:${randomUUID()}`
          ]
        );
      }
      if (!delivery) {
        throw new Error("Action item delivery could not be prepared");
      }

      await transaction.execute(
        `
          UPDATE meeting_report_action_items
          SET status = 'DELIVERING', updated_at = now()
          WHERE id = $1
        `,
        [actionItem.id]
      );
      await transaction.execute(
        `
          UPDATE meeting_report_action_item_deliveries
          SET status = 'RUNNING',
              attempt_count = attempt_count + 1,
              last_error_code = NULL,
              updated_at = now()
          WHERE id = $1
        `,
        [delivery.id]
      );

      return { actionItem, delivery };
    });
  }

  private async completeIssueDelivery(
    deliveryId: string,
    actionItemId: string,
    currentUserId: string,
    piloIssueId: string
  ): Promise<void> {
    await this.completeDelivery(deliveryId, actionItemId, currentUserId, {
      piloIssueId
    });
  }

  private async completeDelivery(
    deliveryId: string,
    actionItemId: string,
    currentUserId: string,
    target: { calendarEventId?: number; piloIssueId?: string }
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await this.completeDeliveryInTransaction(
        transaction,
        deliveryId,
        actionItemId,
        currentUserId,
        target
      );
    });
  }

  private async completeDeliveryInTransaction(
    transaction: DatabaseTransaction,
    deliveryId: string,
    actionItemId: string,
    currentUserId: string,
    target: { calendarEventId?: number; piloIssueId?: string }
  ): Promise<void> {
      const completed = await transaction.queryOne<{ id: string }>(
        `
          UPDATE meeting_report_action_item_deliveries
          SET status = 'COMPLETED',
              calendar_event_id = $2,
              pilo_issue_id = $3,
              updated_at = now()
          WHERE id = $1
            AND status = 'RUNNING'
          RETURNING id
        `,
        [deliveryId, target.calendarEventId ?? null, target.piloIssueId ?? null]
      );
      if (!completed) {
        throw new Error("Action item delivery completion was lost");
      }
      await transaction.execute(
        `
          UPDATE meeting_report_action_items
          SET status = 'APPROVED',
              approved_by_user_id = $2,
              approved_at = now(),
              updated_by_user_id = $2,
              updated_at = now()
          WHERE id = $1
            AND status = 'DELIVERING'
        `,
        [actionItemId, currentUserId]
      );
  }

  private async failDelivery(
    deliveryId: string,
    actionItemId: string,
    errorCode: string
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.execute(
        `
          UPDATE meeting_report_action_item_deliveries
          SET status = 'FAILED', last_error_code = $2, updated_at = now()
          WHERE id = $1 AND status = 'RUNNING'
        `,
        [deliveryId, errorCode]
      );
      await transaction.execute(
        `
          UPDATE meeting_report_action_items
          SET status = 'DELIVERY_FAILED', updated_at = now()
          WHERE id = $1 AND status = 'DELIVERING'
        `,
        [actionItemId]
      );
    });
  }

  private toSafeErrorCode(error: unknown): string {
    if (typeof error === "object" && error !== null && "code" in error) {
      const value = (error as { code?: unknown }).code;
      if (typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value)) {
        return value;
      }
    }
    return "ACTION_ITEM_DELIVERY_FAILED";
  }
}
