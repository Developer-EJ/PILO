import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  CreateReviewChecklistItemInput,
  CreateReviewCommentInput,
  ReviewChecklistItemRecord,
  ReviewCommentRecord,
  UpdateReviewChecklistItemInput,
} from "./review-artifact.types";
import { ReviewArtifactsService } from "./review-artifacts.service";

@Controller()
export class ReviewArtifactsController {
  constructor(private readonly artifactsService: ReviewArtifactsService) {}

  @Get("code-review-rooms/:roomId/comments")
  listComments(
    @Param("roomId") roomId: string,
  ): Promise<ReviewCommentRecord[]> {
    return this.artifactsService.listCommentsByRoom(roomId);
  }

  @Post("code-review-rooms/:roomId/comments")
  createComment(
    @Param("roomId") roomId: string,
    @Body() body: CreateReviewCommentInput,
  ): Promise<ReviewCommentRecord> {
    return this.artifactsService.createComment(roomId, body);
  }

  @Get("pull-request-analyses/:analysisId/checklist-items")
  listChecklistItems(
    @Param("analysisId") analysisId: string,
  ): Promise<ReviewChecklistItemRecord[]> {
    return this.artifactsService.listChecklistItems(analysisId);
  }

  @Post("pull-request-analyses/:analysisId/checklist-items")
  createChecklistItem(
    @Param("analysisId") analysisId: string,
    @Body() body: CreateReviewChecklistItemInput,
  ): Promise<ReviewChecklistItemRecord> {
    return this.artifactsService.createChecklistItem(analysisId, body);
  }

  @Patch("review-checklist-items/:itemId")
  updateChecklistItem(
    @Param("itemId") itemId: string,
    @Body() body: UpdateReviewChecklistItemInput,
  ): Promise<ReviewChecklistItemRecord> {
    return this.artifactsService.updateChecklistItem(itemId, body);
  }
}
