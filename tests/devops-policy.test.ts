import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 assertFixedScope,authorizedCriticalChange,validateSourcePath,
 safeDiagnosticLine,classifyObservation,DEVOPS_REPO,
 DEVOPS_PROJECT_ID,DEVOPS_TEAM_ID
} from '../lib/devops-policy';

test('DevOps só aceita o repositório e projeto da Jornada',()=>{
 assert.doesNotThrow(()=>assertFixedScope(DEVOPS_REPO,DEVOPS_PROJECT_ID,DEVOPS_TEAM_ID));
 assert.throws(()=>assertFixedScope('lucasbritostudio/outro-projeto',DEVOPS_PROJECT_ID,DEVOPS_TEAM_ID),/SCOPE_DENIED/);
 assert.throws(()=>assertFixedScope(DEVOPS_REPO,'projeto-falso',DEVOPS_TEAM_ID),/SCOPE_DENIED/);
});
test('não ler chaves/arquivos arbitrários ou atravessar caminho',()=>{
 assert.equal(validateSourcePath('app/desenvolvimento/page.tsx'),true);
 assert.equal(validateSourcePath('lib/production.ts'),true);
 assert.equal(validateSourcePath('docs/arquitetura-ia-desenvolvedora.md'),true);
 for(const p of ['../.env','lib/../../../.env.production','.env','lib/secret.key','lib/secrets.json','/etc/passwd','lib\\auth.ts','app/main.sh'])
  assert.equal(validateSourcePath(p),false,p);
});
test('diagnóstico e proposta não requerem autorização de alteração',()=>{
 assert.equal(authorizedCriticalChange('diagnose',null,'abc123'),true);
 assert.equal(authorizedCriticalChange('propose',null,'abc123'),true);
 assert.equal(authorizedCriticalChange('deploy',null,'abc123'),false);
 assert.equal(authorizedCriticalChange('rollback',null,'abc123'),false);
});
test('aprovação forte vinculada ao hash e duração de 10 min',()=>{
 const now=new Date('2026-10-11T12:00:00Z');
 const ok={kind:'edit' as const,subjectSha:'abc123',diffDigest:'digest01',
  approvedAt:'2026-10-11T11:54:00Z',expiresAt:'2026-10-11T12:04:00Z',recentAdminAuth:true};
 assert.equal(authorizedCriticalChange('edit',ok,'abc123',now,'digest01'),true);
 assert.equal(authorizedCriticalChange('edit',ok,'changed',now,'digest01'),false);
 assert.equal(authorizedCriticalChange('edit',ok,'abc123',now,'wrong'),false);
 assert.equal(authorizedCriticalChange('deploy',ok,'abc123',now),false);
 assert.equal(authorizedCriticalChange('edit',{...ok,recentAdminAuth:false},'abc123',now,'digest01'),false);
 assert.equal(authorizedCriticalChange('edit',ok,'abc123',new Date('2026-10-11T12:05:00Z'),'digest01'),false);
});
test('sanitização remove tokens, emails e telefones dos resumos de falhas',()=>{
 const s=safeDiagnosticLine('error gsk_abcdefghi12345 contact lucas@example.com auth Bearer xyzxyzxyz1234567, tel +55 99 99999-9999');
 assert.ok(s.includes('[SEGREDO]'));
 assert.ok(s.includes('[EMAIL]'));
 assert.ok(s.includes('[TELEFONE]'));
 assert.ok(!s.includes('example.com'));
 assert.ok(!s.includes('abcdefghi12345'));
 assert.ok(!s.includes('xyzxyzxyz1234567'));
 const typed=classifyObservation('github','TypeScript build failure');
 assert.equal(typed.kind,'typescript');
 assert.equal(typed.source,'github');
});
