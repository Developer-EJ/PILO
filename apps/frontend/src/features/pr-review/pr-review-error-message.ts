import { PrReviewApiError } from "@/features/pr-review/api/client";

const CLOSED_PULL_REQUEST_ERROR = "Pull request is closed or merged";
const STALE_REVIEW_SESSION_ERROR = "Review session head SHA is stale";

export function getPrReviewErrorMessage(
  error: unknown,
  fallbackMessage: string
): string {
  if (
    error instanceof PrReviewApiError &&
    error.status === 409 &&
    error.message === CLOSED_PULL_REQUEST_ERROR
  ) {
    return "이미 종료된 PR이라 리뷰를 시작할 수 없습니다.";
  }

  if (
    error instanceof PrReviewApiError &&
    error.status === 409 &&
    error.message === STALE_REVIEW_SESSION_ERROR
  ) {
    return "A newer commit was pushed. Start a new review for the latest PR version.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}
