/**
 * Um comando seguro para rodar a avaliação Groq REAL no PC já vinculado.
 * Falha FECHADA quando pasta Jornada ou .env.local não estão autorizados.
 * Não roda no CI, não faz deploy e nunca imprime segredos.
 */
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {verifyJornadaLink,EXPECTED_PROJECT_ID,EXPECTED_TEAM_ID}
 from './verify-jornada-link.mjs';

try{verifyJornadaLink();}catch{
 console.log('G2_LIVE_BLOCKED_PROJECT_LINK');
 process.exit(4);
}
if(!existsSync(resolve('.env.g2.local'))){
 console.log('G2_LIVE_BLOCKED_DEDICATED_TEST_ENV');
 process.exit(4);
}
if(process.env.CI==='true'||process.env.GITHUB_ACTIONS==='true'){
 console.log('G2_LIVE_BLOCKED_CI');
 process.exit(4);
}
// Nem mesmo variáveis herdadas de outros projetos entram no subprocesso.
const safeEnv=Object.fromEntries(Object.entries(process.env).filter(([name])=>
 !/^(?:GROQ_|OPENROUTER_|BLOB_|JORNADA_|VERCEL_TOKEN|G2_TEST_)/.test(name)));
const result=spawnSync(process.execPath,[
 '--env-file-if-exists=.env.g2.local',
 '--experimental-strip-types',
 '--experimental-loader','./tests/ts-extension-loader.mjs',
 'scripts/g2-real-ai-evaluation.mts'
],{
 cwd:process.cwd(),stdio:'inherit',shell:false,timeout:240_000,
 env:{...safeEnv,VERCEL_PROJECT_ID:EXPECTED_PROJECT_ID,
  VERCEL_ORG_ID:EXPECTED_TEAM_ID}
});
if(result.error||result.signal){
 console.log('G2_LIVE_INTERRUPTED');
 process.exit(5);
}
process.exit(result.status??5);
