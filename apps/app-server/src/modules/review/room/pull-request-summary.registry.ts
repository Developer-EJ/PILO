import { Injectable } from "@nestjs/common";
import type { PullRequestSummaryRef } from "./code-review-room.types";
import { REVIEW_ROOM_PULL_REQUEST_FIXTURES } from "./review-room.fixtures";

export interface PullRequestSummaryRegistryOptions {
  seedFixture?: boolean;
}

@Injectable()
export class PullRequestSummaryRegistry {
  private readonly summaries = new Map<string, PullRequestSummaryRef>();

  constructor(options: PullRequestSummaryRegistryOptions = {}) {
    if (options.seedFixture) {
      for (const [id, summary] of REVIEW_ROOM_PULL_REQUEST_FIXTURES) {
        this.summaries.set(id, summary);
      }
    }
  }

  find(pullRequestId: string): PullRequestSummaryRef | null {
    return this.summaries.get(pullRequestId) ?? null;
  }

  has(pullRequestId: string): boolean {
    return this.summaries.has(pullRequestId);
  }

  save(pullRequest: PullRequestSummaryRef): PullRequestSummaryRef {
    this.summaries.set(pullRequest.id, pullRequest);

    return pullRequest;
  }
}
