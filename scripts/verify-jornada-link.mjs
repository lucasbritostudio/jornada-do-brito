import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const EXPECTED_PROJECT_ID = 'prj_nZMJzmOo0jsL9tFqfpT6lqdLm3c6';
export const EXPECTED_TEAM_ID = 'team_ZEmFS6erUu5qbXgYyze8PWdm';

export function verifyJornadaLink(root = process.cwd()) {
  let project;
  try {
    project = JSON.parse(readFileSync(resolve(root, '.vercel/project.json'), 'utf8'));
  } catch {
    throw new Error('JORNADA_LINK_MISSING: vincule apenas o projeto Jornada antes da auditoria.');
  }
  if (project.projectId !== EXPECTED_PROJECT_ID ||
      project.orgId !== EXPECTED_TEAM_ID) {
    throw new Error('JORNADA_LINK_MISMATCH: a pasta aponta para outro projeto/equipe. Auditoria bloqueada.');
  }
  return true;
}
