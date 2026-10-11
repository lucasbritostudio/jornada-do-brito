/**
 * Guardrails de DevOps: nenhuma instrução do LLM é autoridade de execução.
 * Há apenas UM repositório e UM projeto permitidos; jamais inferir ID de texto
 * de chat ou de logs. Permissões adicionais são concedidas fora deste módulo.
 */
export const DEVOPS_REPO = 'lucasbritostudio/jornada-do-brito';
export const DEVOPS_PROJECT_ID = 'prj_nZMJzmOo0jsL9tFqfpT6lqdLm3c6';
export const DEVOPS_TEAM_ID = 'team_ZEmFS6erUu5qbXgYyze8PWdm';

export type DevIntent = 'diagnose' | 'propose' | 'edit' | 'deploy' | 'rollback';
export type DevJobState =
  | 'new' | 'diagnosing' | 'plan_ready' | 'edit_approved'
  | 'branch_created' | 'patch_generated' | 'tests_running'
  | 'tests_failed' | 'review_ready' | 'release_approved'
  | 'deploying' | 'verifying' | 'ready' | 'rollback_running'
  | 'blocked';

const FORBIDDEN = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.git|node_modules|\.next|.*\.pem|.*\.key|.*\.p12|secrets?\.json)(?:\/|$)/i;
const PATH = /^(?:app|lib|components|styles|tests|docs|public)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs|json|css|md|svg|txt|html)$/;

export function validateSourcePath(path: string): boolean {
  if (typeof path !== 'string' || path.length > 220) return false;
  if (path.includes('..') || path.includes('\\') || path.startsWith('/')) return false;
  return PATH.test(path) && !FORBIDDEN.test(path);
}
export function assertFixedScope(repo: string, projectId: string, teamId: string): void {
  if (repo !== DEVOPS_REPO || projectId !== DEVOPS_PROJECT_ID || teamId !== DEVOPS_TEAM_ID) {
    throw new Error('DEVOPS_SCOPE_DENIED');
  }
}
export type DevApproval = {
  kind: 'edit' | 'release' | 'rollback';
  subjectSha: string;
  diffDigest?: string;
  approvedAt: string;
  expiresAt: string;
  recentAdminAuth: boolean;
};
export function authorizedCriticalChange(
  intent: DevIntent,
  approval: DevApproval | null,
  subjectSha: string,
  now = new Date(),
  diffDigest?: string,
): boolean {
  if (intent === 'diagnose' || intent === 'propose') return true;
  if (!approval || !approval.recentAdminAuth) return false;
  const kind = intent === 'edit' ? 'edit' : intent === 'deploy' ? 'release' : 'rollback';
  if (approval.kind !== kind || approval.subjectSha !== subjectSha) return false;
  const created = Date.parse(approval.approvedAt), expires = Date.parse(approval.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires)) return false;
  if (created > now.getTime() || expires < now.getTime() || expires - created > 10 * 60_000) return false;
  if (kind === 'edit' && (!diffDigest || diffDigest !== approval.diffDigest)) return false;
  return true;
}
export function safeDiagnosticLine(input: unknown, max = 340): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/(?:gh[pousr]_|github_pat_|gsk_|sk-proj-|sk-)[A-Za-z0-9_\-]{8,}/gi, '[SEGREDO]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]{8,}=*/gi, 'Authorization [OCULTA]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g, '[EMAIL]')
    .replace(/\b(?:\+?55)?\s*\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/g, '[TELEFONE]')
    .replace(/(?:password|senha|secret|token|api[_-]?key)\s*[=:]\s*(?:[^\s,;]+)/gi,'[CREDENCIAL]')
    .slice(0, max);
}
export function classifyObservation(source: 'github' | 'vercel', value: string) {
  const normalized = value.toLowerCase();
  const kind = /type.?script|ts\(\d+\)/.test(normalized) ? 'typescript'
    : /test failed|tests failed|regression/.test(normalized) ? 'test'
    : /build|compilation|compile/.test(normalized) ? 'build'
    : /unauthorized|forbidden|401|403/.test(normalized) ? 'auth'
    : /429|rate.limit|quota/.test(normalized) ? 'rate_limit'
    : /timeout|502|503|500|runtime|crash/.test(normalized) ? 'runtime'
    : 'unknown';
  return {source,kind,observation:safeDiagnosticLine(value)};
}
