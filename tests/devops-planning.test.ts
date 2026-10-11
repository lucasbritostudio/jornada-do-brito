import assert from 'node:assert/strict';
import {test} from 'node:test';
import {allowedPlanningPath,validPlanningObjective,safeSourceExcerpt,PLANNABLE_FILES}
 from '../lib/devops-planning';

test('planejador só examina arquivos de interface explicitamente autorizados',()=>{
 assert.ok(PLANNABLE_FILES.length>=4);
 assert.equal(allowedPlanningPath('app/producao/dashboard.tsx'),true);
 assert.equal(allowedPlanningPath('app/desenvolvimento/console.tsx'),true);
 for(const path of [
  '.env.production','lib/secrets.ts','lib/auth.ts','app/api/desenvolvimento/chat/route.ts',
  'app/../../.env','app/production/../secrets.ts','scripts/execute.sh',
  '.github/workflows/jornada-preprod.yml'
 ])assert.equal(allowedPlanningPath(path),false,path);
});
test('objetivo é explícito, curto, não contém chave privada',()=>{
 assert.equal(validPlanningObjective('Deixe a tipografia mais simples no iPhone'),true);
 assert.equal(validPlanningObjective('mudar'),false);
 assert.equal(validPlanningObjective('a'.repeat(651)),false);
 assert.equal(validPlanningObjective('-----BEGIN RSA PRIVATE KEY----- mais conteúdo'),false);
});
test('código a enviar à IA omite linhas de configuração com credenciais',()=>{
 const source=[
  'export const Page=()=> <main />',
  'const token = "never-send-this-value";',
  'const api_key: string = "sensitive-example";',
  'const theme = "dark";'
 ].join('\n');
 const safe=safeSourceExcerpt(source);
 assert.ok(safe.includes('export const Page'));
 assert.ok(safe.includes('const theme'));
 assert.ok(!safe.includes('never-send-this-value'));
 assert.ok(!safe.includes('sensitive-example'));
 assert.ok(safe.includes('[LINHA DE CONFIGURAÇÃO OCULTA]'));
});
