import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('piloto real depende APENAS de credencial separada e não acessa cofre de clientes',()=>{
 const script=readFileSync('scripts/g2-real-ai-evaluation.mts','utf8');
 assert.match(script,/G2_TEST_GROQ_API_KEY/);
 assert.match(script,/G2_TEST_SANDBOX_ACK/);
 assert.doesNotMatch(script,/getGroqApiKey|@vercel\/blob|JORNADA_SESSION_SECRET|OPENROUTER_API_KEY/);
 assert.match(script,/const MAX_CALLS=12,MAX_TOKENS=425,TIMEOUT_MS=15000/);
 assert.match(script,/productionModified:false/);
});
test('wrapper não injeta variáveis de projeto produtivo e bloqueia CI',()=>{
 const code=readFileSync('scripts/run-safe-g2-real-evaluation.mjs','utf8');
 assert.match(code,/\.env\.g2\.local/);
 assert.match(code,/G2_LIVE_BLOCKED_CI/);
 assert.match(code,/safeEnv/);
 assert.doesNotMatch(code,/env-file-if-exists=\.env\.local/);
 assert.match(readFileSync('.gitignore','utf8'),/\.env\.\*/);
});
test('CI padrão nunca roda o modelo externo, somente testes sem credenciais',()=>{
 const workflow=readFileSync('.github/workflows/jornada-preprod.yml','utf8');
 assert.ok(!workflow.includes('benchmark:g2:live'));
 assert.ok(!workflow.includes('G2_TEST_GROQ_API_KEY'));
 assert.match(workflow,/npm test/);
});
