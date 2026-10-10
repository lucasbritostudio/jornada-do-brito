/**
 * A conditional Blob write failed because another request committed first.
 * No retry of external side effects is safe without idempotency.
 */
export function isBlobConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'BlobPreconditionFailedError' ||
    error.name === 'BlobAlreadyExistsError';
}
