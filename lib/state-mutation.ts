import type { WorkspaceState } from './types';
import { getState, saveState } from './store';
import { isBlobConflict } from './blob-conflict';

/**
 * Only wrap LOCAL, idempotent state changes in this helper.
 * NEVER place network sends, AI calls, or payments in mutate().
 */
export async function mutateStateSafely<T>(
  mutate: (state: WorkspaceState) => T,
  maxAttempts = 6,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const state = await getState();
    const result = mutate(state);
    try {
      await saveState(state);
      return result;
    } catch (error) {
      if (!isBlobConflict(error) || attempt === maxAttempts - 1) throw error;
    }
  }
  throw new Error('STATE_WRITE_CONFLICT');
}
