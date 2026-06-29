import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InMemoryReviewArtifactsRepository } from "./in-memory-review-artifacts.repository";
import {
  CreateReviewChecklistItemInput,
  CreateReviewCommentInput,
  ReviewChecklistItemRecord,
  ReviewChecklistStatus,
  ReviewChecklistType,
  ReviewCommentRecord,
} from "./review-artifact.types";

const CHECKLIST_TYPES = ["review", "merge"];
const CHECKLIST_STATUSES = ["todo", "done", "skipped"];

@Injectable()
export class ReviewArtifactsService {
  constructor(
    private readonly artifactsRepository: InMemoryReviewArtifactsRepository,
  ) {}

  createComment(
    roomId: string,
    input: CreateReviewCommentInput,
  ): ReviewCommentRecord {
    const createdAt = this.timestampOrNow(input.createdAt);

    return this.artifactsRepository.saveComment({
      id: randomUUID(),
      roomId,
      authorMemberId: this.requiredString(
        input.authorMemberId,
        "authorMemberId",
      ),
      nodeId: input.nodeId ?? null,
      changedFileId: input.changedFileId ?? null,
      changedFunctionId: input.changedFunctionId ?? null,
      body: this.requiredString(input.body, "body"),
      createdAt,
    });
  }

  createChecklistItem(
    analysisId: string,
    input: CreateReviewChecklistItemInput,
  ): ReviewChecklistItemRecord {
    const checklistType = this.toChecklistType(input.checklistType ?? "review");
    const status = this.toChecklistStatus(input.status ?? "todo");
    const changedAt = this.timestampOrNow(input.changedAt);
    const sortOrder =
      input.sortOrder ??
      this.artifactsRepository.nextChecklistSortOrder(
        analysisId,
        checklistType,
      );
    const normalizedSortOrder = this.nonNegativeInteger("sortOrder", sortOrder);
    const existing = this.artifactsRepository.findChecklistItemBySlot(
      analysisId,
      checklistType,
      normalizedSortOrder,
    );
    const checked = this.toCheckedFields(status, input, changedAt);

    return this.artifactsRepository.saveChecklistItem({
      id: existing?.id ?? randomUUID(),
      analysisId,
      checklistType,
      title: this.requiredString(input.title, "title"),
      status,
      checkedByMemberId: checked.checkedByMemberId,
      checkedAt: checked.checkedAt,
      sortOrder: normalizedSortOrder,
      createdAt: existing?.createdAt ?? changedAt,
      updatedAt: changedAt,
    });
  }

  listCommentsByRoom(roomId: string): ReviewCommentRecord[] {
    return this.artifactsRepository.listCommentsByRoom(roomId);
  }

  listChecklistItems(analysisId: string): ReviewChecklistItemRecord[] {
    return this.artifactsRepository.listChecklistItems(analysisId);
  }

  private toChecklistType(value: string): ReviewChecklistType {
    if (CHECKLIST_TYPES.includes(value)) {
      return value as ReviewChecklistType;
    }

    throw new BadRequestException(`Invalid checklist type: ${value}`);
  }

  private toChecklistStatus(value: string): ReviewChecklistStatus {
    if (CHECKLIST_STATUSES.includes(value)) {
      return value as ReviewChecklistStatus;
    }

    throw new BadRequestException(`Invalid checklist status: ${value}`);
  }

  private toCheckedFields(
    status: ReviewChecklistStatus,
    input: CreateReviewChecklistItemInput,
    checkedAt: string,
  ): Pick<ReviewChecklistItemRecord, "checkedByMemberId" | "checkedAt"> {
    if (status === "todo") {
      return { checkedByMemberId: null, checkedAt: null };
    }

    return {
      checkedByMemberId: this.requiredString(
        input.checkedByMemberId,
        "checkedByMemberId",
      ),
      checkedAt: this.timestampOrNow(input.checkedAt ?? checkedAt),
    };
  }

  private requiredString(
    value: string | null | undefined,
    field: string,
  ): string {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    throw new BadRequestException(`${field} is required`);
  }

  private nonNegativeInteger(fieldName: string, value: number): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(
        `${fieldName} must be a non-negative integer`,
      );
    }

    return value;
  }

  private timestampOrNow(value?: string | null): string {
    if (!value) {
      return new Date().toISOString();
    }

    if (Number.isNaN(Date.parse(value))) {
      throw new BadRequestException("timestamp must be a valid ISO timestamp");
    }

    return value;
  }
}
