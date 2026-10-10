/**
 * Retention planning only: never deletes private objects or customer history.
 * No default expiry is assumed without the owner's approved policy.
 */
export type RetentionCandidate = {
  id: string;
  updatedAt: string;
  status?: string;
};

export function planMemoryRetention(
  threads: readonly RetentionCandidate[],
  lessons: readonly RetentionCandidate[],
  cutoffIso: string | null,
) {
  if (!cutoffIso) {
    return { mode: 'dry-run' as const, policyConfigured: false, reviewRequired: true,
      threadIds: [] as string[], lessonIds: [] as string[],
      unresolvedExcluded: 0 };
  }
  const cutoff = new Date(cutoffIso);
  if (!Number.isFinite(cutoff.getTime()) || cutoff.toISOString() !== cutoffIso) {
    throw new Error('INVALID_RETENTION_CUTOFF');
  }
  const old = (entry: RetentionCandidate) => {
    const stamp = new Date(entry.updatedAt).getTime();
    return Number.isFinite(stamp) && stamp < cutoff.getTime();
  };
  const threadIds = threads.filter((t) => t.status === 'resolved' && old(t)).map((t) => t.id);
  const unresolvedExcluded = threads.filter((t) => t.status !== 'resolved' && old(t)).length;
  const lessonIds = lessons.filter(old).map((t) => t.id);
  return { mode: 'dry-run' as const, policyConfigured: true, reviewRequired: true,
    threadIds, lessonIds, unresolvedExcluded };
}
