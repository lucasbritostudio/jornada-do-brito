/**
 * Testes de integração do TRANSPORTE REAL de IA em execução isolada.
 * Em vez de chamar Groq, simula fetch no mesmo processo de teste.
 * Os resultados são observações de runtime local, não incidentes reais.
 */
import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

mock.module(pathToFileURL(resolve('lib/secrets.ts')).href,{
 namedExports:{
  getGroqApiKey:async()=> 'synthetic-test-key-not-production',
  getGroqSecretStatus:async()=>({configured:true,source:'test',last4:'TEST'})
 }
});
const {generateWithFreeLlm,LlmProviderError}=await import('../lib/llm');
const sample=[{role:'user' as const,content:'Descreva o comportamento verificado.'}];
type NetworkCall=(url:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;

async function withSyntheticNetwork<T>(handler:NetworkCall,run:()=>Promise<T>){
 const previous=globalThis.fetch;
 let count=0;
 const intercepted:NetworkCall=async(url,init)=>{
  count++;
  if(typeof url!=='string'||url!=='https://api.groq.com/openai/v1/chat/completions')
   throw new Error('G2_UNEXPECTED_EXTERNAL_URL');
  return handler(url,init);
 };
 globalThis.fetch=intercepted;
 try{
  const result=await run();
  return {result,calls:count};
 }finally{globalThis.fetch=previous;}
}
const jsonResponse=(text:string,status=200,extraHeaders:HeadersInit={})=>
 new Response(text,{status,headers:{'content-type':'application/json',...extraHeaders}});

test('G2 HTTP saudável: o transporte real consulta uma vez e interpreta o contrato',async()=>{
 const out=await withSyntheticNetwork(async(_url,init)=>{
  assert.equal(init?.method,'POST');
  assert.equal(init?.cache,'no-store');
  assert.ok(init?.signal);
  const body=JSON.parse(String(init?.body));
  assert.equal(body.max_completion_tokens,1200);
  assert.equal(body.messages[0].content,sample[0].content);
  return jsonResponse(JSON.stringify({
   choices:[{message:{content:'Diagnóstico experimental'}}],
   usage:{prompt_tokens:10,completion_tokens:3,total_tokens:13}
  }),200,{'x-ratelimit-remaining-requests':'999'});
 },async()=>await generateWithFreeLlm(sample));
 assert.equal(out.calls,1);
 assert.equal(out.result.text,'Diagnóstico experimental');
 assert.equal(out.result.usage?.totalTokens,13);
 assert.equal(out.result.limits?.remainingRequests,'999');
});
test('G2 HTTP 500 real do transporte: rejeita sem vazar texto ou repetir chamada',async()=>{
 let count=0;
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>{
  count++;
  return jsonResponse(JSON.stringify({error:{message:'gsk_TEST_SECRET_SHOULD_NOT_LEAK'}}),500);
 };
 try{
  await assert.rejects(()=>generateWithFreeLlm(sample),(err:unknown)=>{
   assert.ok(err instanceof LlmProviderError);
   assert.equal(err.status,500);
   assert.equal(err.provider,'groq');
   assert.doesNotMatch(err.message,/TEST_SECRET_SHOULD_NOT_LEAK/);
   return true;
  });
  assert.equal(count,1);
 }finally{globalThis.fetch=previous;}
});
test('G2 HTTP 429: classificação, retry-after e ausência de retry implícito',async()=>{
 let count=0;
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>{
  count++;
  return jsonResponse(JSON.stringify({error:{message:'never-copy-upstream'}}),429,
   {'retry-after':'60'});
 };
 try{
  await assert.rejects(()=>generateWithFreeLlm(sample),(err:unknown)=>{
   assert.ok(err instanceof LlmProviderError);
   assert.equal(err.status,429);
   assert.equal(err.retryAfter,'60');
   assert.doesNotMatch(err.message,/never-copy-upstream/);
   return true;
  });
  assert.equal(count,1);
 }finally{globalThis.fetch=previous;}
});
test('G2 JSON inesperado e corpo inválido: não os promove a respostas confirmadas',async()=>{
 for(const body of ['não é JSON','{}','{"choices":[{"message":{"content":42}}]}']){
  const result=await withSyntheticNetwork(async()=>jsonResponse(body),async()=>{
   try{await generateWithFreeLlm(sample);return 'ACCEPTED';}
   catch(error){
    assert.ok(error instanceof LlmProviderError);
    return error.status;
   }
  });
  assert.equal(result.calls,1);
  assert.equal(result.result,502);
 }
});
test('G2 falha de rede: o transporte captura e classifica erro sem retries',async()=>{
 const result=await withSyntheticNetwork(async()=>{throw new TypeError('host não encontrado');},
  async()=>{
   try{await generateWithFreeLlm(sample);return 'ACCEPTED';}
   catch(error){
    assert.ok(error instanceof LlmProviderError);
    assert.equal(error.status,502);
    assert.doesNotMatch(error.message,/host não encontrado/);
    return 'NETWORK_ERROR';
   }
  });
 assert.equal(result.calls,1);
 assert.equal(result.result,'NETWORK_ERROR');
});
test('G2 abort/timeout: rejeita como 504 e libera o indicador de requisição',async()=>{
 const result=await withSyntheticNetwork(async()=>{
  const error=new Error('abort synthetic');error.name='AbortError';throw error;
 },async()=>{
  try{await generateWithFreeLlm(sample);return 'ACCEPTED';}
  catch(error){
   assert.ok(error instanceof LlmProviderError);
   assert.equal(error.status,504);
   return 'TIMEOUT';
  }
 });
 assert.equal(result.calls,1);
 assert.equal(result.result,'TIMEOUT');
});
test('G2 recuperação: falha em uma consulta não contamina a consulta seguinte',async()=>{
 const previous=globalThis.fetch;
 let count=0;
 globalThis.fetch=async()=>{
  count++;
  if(count===1)throw new TypeError('synthetic offline');
  return jsonResponse(JSON.stringify({choices:[{message:{content:'Restabelecida'}}]}));
 };
 try{
  await assert.rejects(()=>generateWithFreeLlm(sample),LlmProviderError);
  const next=await generateWithFreeLlm(sample);
  assert.equal(next.text,'Restabelecida');
  assert.equal(count,2);
 }finally{globalThis.fetch=previous;}
});
