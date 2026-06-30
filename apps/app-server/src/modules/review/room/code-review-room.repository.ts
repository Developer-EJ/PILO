import {
  CodeReviewRoomRecord,
  CreateCodeReviewRoomInput,
} from "./code-review-room.types";

export type MaybePromise<T> = T | Promise<T>;

export abstract class CodeReviewRoomRepository {
  abstract findById(
    roomId: string,
  ): MaybePromise<CodeReviewRoomRecord | null>;

  abstract findByPullRequestId(
    pullRequestId: string,
  ): MaybePromise<CodeReviewRoomRecord | null>;

  abstract create(
    input: CreateCodeReviewRoomInput,
  ): MaybePromise<CodeReviewRoomRecord>;
}
