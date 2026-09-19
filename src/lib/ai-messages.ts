/** Shared copy shown anywhere AI-written commentary can't be produced. */
export const AI_UNAVAILABLE_MESSAGE = "commentary unavailable at the moment, check back soon!";

export interface CommentaryAvailability {
  available: boolean;
  retryable: boolean;
}

export class CommentaryUnavailableError extends Error {
  retryable: boolean;

  constructor(retryable: boolean) {
    super(AI_UNAVAILABLE_MESSAGE);
    this.name = "CommentaryUnavailableError";
    this.retryable = retryable;
  }
}

export function requireAvailableCommentary<T extends CommentaryAvailability>(result: T): T {
  if (!result.available) throw new CommentaryUnavailableError(result.retryable);
  return result;
}

export function shouldRetryCommentary(failureCount: number, error: Error) {
  return error instanceof CommentaryUnavailableError && error.retryable && failureCount < 1;
}
