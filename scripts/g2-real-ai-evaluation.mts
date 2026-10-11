/**
 * Executor explicitamente local da PRIMEIRA avaliação da IA Groq real.
 * Não usar em GitHub Actions, em ambiente produtivo nem com código externo.
 *
 * Segurança: um único projeto vinculado, máximo de 12 requisições sintéticas,
 * nenhum dado real, nenhum segredo ou resposta bruta impresso/persistido,
 * nenhum retry, tempo máximo de 15 segundos por requisição.
 */
import {G2_LIVE_BLIND_V1} from '../tests/fixtures/g2-live-blind-v1';
import {buildG2LivePrompt,gradeG2LiveAnswers} from '../lib/g2-live-benchmark';
import {verifyJornadaLink,EXPECTED_PROJECT_ID,EXPECTED_TEAM_ID} from './verify-jornada-link.mjs';

const MAX_CALLS=12,MAX_TOKENS=425,TIMEOUT_MS=15000;
const DOMAIN='https://api.groq.com/openai/v1/chat/completions';
function report(summary:Record<string,unknown>){
 console.log('G2_LIVE_REAL_REPORT='+JSON.stringify(summary));
}
async function main(){
 verifyJornadaLink();
 if(process.env.VERCEL_PROJECT_ID!==EXPECTED_PROJECT_ID||
    process.env.VERCEL_ORG_ID!==EXPECTED_TEAM_ID)
  throw new Error('G2_LIVE_PROJECT_ENV_MISMATCH');
 if(G2_LIVE_BLIND_V1.length!==MAX_CALLS)
  throw new Error('G2_LIVE_CASE_COUNT_MISMATCH');
 const model=process.env.G2_TEST_GROQ_MODEL||'openai/gpt-oss-20b';
 // O piloto NUNCA consulta chaves, cofres ou quotas produtivas da Jornada.
 // Somente credencial dedicada ao ambiente de testes, fornecida localmente.
 if(process.env.G2_TEST_SANDBOX_ACK!=='isolated'){
  report({status:'BLOCKED_TEST_ACCOUNT_REQUIRED',
   reason:'ISOLATED_FREE_TEST_ACCOUNT_NOT_CONFIRMED',
   attemptedModelCalls:0,productionModified:false});
  process.exitCode=3;return;
 }
 let apiKey:string|null=process.env.G2_TEST_GROQ_API_KEY||null;
 if(!apiKey){
  report({status:'BLOCKED_TEST_KEY_UNAVAILABLE',reason:'DEDICATED_TEST_KEY_NOT_CONFIGURED',
   attemptedModelCalls:0,productionModified:false});
  process.exitCode=3;return;
 }
 const outputs:(string|null)[]=Array(MAX_CALLS).fill(null);
 const usage={promptTokens:0,completionTokens:0,totalTokens:0};
 let attempts=0,successful=0,providerStatus:string|null=null;
 const start=Date.now();
 try{
  for(let i=0;i<MAX_CALLS;i++){
   const item=G2_LIVE_BLIND_V1[i];
   const prompt=buildG2LivePrompt(item); // Não contém expected labels.
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
   try{
    attempts++;
    const response=await fetch(DOMAIN,{
     method:'POST',cache:'no-store',signal:controller.signal,
     headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},
     body:JSON.stringify({
      model,temperature:0,max_completion_tokens:MAX_TOKENS,
      messages:[
       {role:'system',content:prompt.system},
       {role:'user',content:prompt.user}
      ]
     })
    });
    if(!response.ok){
     providerStatus='HTTP_'+response.status;
     await response.body?.cancel();
     break; // NUNCA retry ou consumir mais tokens após falha do provedor.
    }
    const body=await response.json();
    const reply=body?.choices?.[0]?.message?.content;
    outputs[i]=typeof reply==='string'?reply:null;
    successful++;
    const use=body?.usage;
    for(const [k,source] of [
     ['promptTokens','prompt_tokens'],
     ['completionTokens','completion_tokens'],
     ['totalTokens','total_tokens']
    ] as const){
     const value=use?.[source];
     if(Number.isSafeInteger(value)&&value>=0)usage[k]+=value;
    }
   }catch(e){
    providerStatus=e instanceof Error&&e.name==='AbortError'?'TIMEOUT':'NETWORK_OR_JSON_ERROR';
    break;
   }finally{clearTimeout(timer);}
  }
 }finally{apiKey=null;}
 const score=gradeG2LiveAnswers(G2_LIVE_BLIND_V1,outputs);
 report({
  status:attempts===MAX_CALLS&&successful===MAX_CALLS?
   'COMPLETED_REAL_MODEL':'INCOMPLETE_REAL_MODEL',
  provider:'groq',model,
  sample:'G2_LIVE_BLIND_V1',
  attemptedModelCalls:attempts,successfulModelCalls:successful,
  callLimit:MAX_CALLS,maxCompletionTokensPerCall:MAX_TOKENS,
  elapsedMs:Date.now()-start,providerStatus,
  usage,score,
  source:'real_groq_response_not_mock',
  labelsSentToProvider:false,privateClientDataSent:false,
  changesApplied:false,productionModified:false,readyToPromote:false
 });
 if(attempts!==MAX_CALLS||successful!==MAX_CALLS)process.exitCode=2;
}
main().catch(()=>{
 // Log de erro estrutural padronizado: jamais expor segredos ou conteúdo LLM.
 report({status:'SAFE_ABORT',reason:'ISOLATED_RUNNER_FAILED',
  productionModified:false});
 process.exitCode=4;
});
