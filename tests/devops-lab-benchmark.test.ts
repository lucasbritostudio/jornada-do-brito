/**
 * Benchmark determinístico de alegações falsas e fontes válidas reais da Jornada.
 * Mede filtros e rastreabilidade, NÃO a inteligência/precisão da LLM remota.
 * Não usa rede, banco de dados, chaves, Vercel ou tokens de inferência.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {safeSourceExcerpt} from '../lib/devops-planning';
import {selectLabEvidence,reviewLabResponse,localLabReview} from '../lib/devops-lab-v2';
import {verifiedCodeFacts} from '../lib/devops-claims';

const path='app/desenvolvimento/console.tsx';
const original=readFileSync(path,'utf8');
const safe=safeSourceExcerpt(original,original.length+1000);
const objective='Verifique ask, refresh, copyAnswer e as validações, carregamento, copy';
const evidence=selectLabEvidence(safe,objective);
const facts=verifiedCodeFacts(safe,path,objective);
const line=(fragment:string)=>{
 const matching=evidence.visibleLines.find(n=>evidence.lines[n].includes(fragment));
 assert.ok(matching,'O benchmark precisa encontrar "'+fragment+'" na fonte enviada.');
 return matching!;
};
const lAsk=line("if(!r.ok)throw");
const lRefresh=line("const refresh=useCallback");
const lClipboard=line("catch{setError('Não foi possível copiar");
const basic={uncertain:[],risks:[],
 suggestion:'Verificar feedback visual em telas pequenas.',
 test:'Executar uma validação de interface sem alterar produção.'};
const finding=(n:number,interpretation:string)=>({
 file:path,line:n,quote:evidence.lines[n].trim().slice(0,110),interpretation
});
function propose(findings:unknown[],overrides:Record<string,unknown>={}){
 return JSON.stringify({...basic,findings,...overrides});
}

test('benchmark: os três fatos antigos existem na fonte REAL e estão disponíveis',()=>{
 assert.equal(facts.some(f=>f.quote.includes('if(!r.ok)')),true);
 assert.equal(facts.some(f=>f.quote.includes('useCallback')),true);
 assert.equal(facts.some(f=>f.quote.includes('catch')),true);
 assert.ok(evidence.excerpt.length<=6300,'o orçamento de contexto foi respeitado');
});

const falseClaims=[
 ['ask sem validar status',lAsk,'ask envia POST sem validar status da resposta',{}],
 ['ask não verifica status',lAsk,'ask não verifica status da resposta',{}],
 ['refresh não existe',lRefresh,'refresh não existe no código',{}],
 ['refresh não foi definido',lRefresh,'refresh não foi definido',{}],
 ['refresh falta useCallback',lRefresh,'falta useCallback para refresh',{}],
 ['clipboard sem tratamento',lClipboard,'copyAnswer sem tratamento de erro',{}],
 ['sugere adicionar r.ok',lAsk,'Uma checagem r.ok existe na linha.',{
  suggestion:'Adicionar verificação de r.ok para tratar erro.'}],
 ['sugere criar refresh useCallback',lRefresh,'A função refresh usa useCallback.',{
  suggestion:'Definir refresh com useCallback.'}],
 ['risco afirma r.ok ausente',lAsk,'A função ask faz checagem de status.',{
  risks:['Pode quebrar porque não verifica status da resposta; prevenir verificando r.ok.']}],
 ['incerteza nega refresh',lRefresh,'refresh usa useCallback.',{
  uncertain:['refresh não aparece no código e precisa ser definido.']}],
] as const;
for(const [label,n,claim,overrides] of falseClaims){
 test('benchmark falso rejeitado: '+label,()=>{
  assert.equal(reviewLabResponse(propose([finding(n,claim)],overrides),evidence,facts,undefined,path),null);
 });
}

const trueClaims=[
 ['checagem de status',lAsk,'A função ask contém um teste explícito de r.ok.'],
 ['memoização',lRefresh,'refresh foi definido com useCallback.'],
 ['tratamento de exceções',lClipboard,'Há um bloco catch para copyAnswer.'],
] as const;
for(const [label,n,claim] of trueClaims){
 test('benchmark rastreável aceito: '+label,()=>{
  const got=reviewLabResponse(propose([finding(n,claim)]),evidence,facts,undefined,path);
  assert.equal(got?.evidenceLevel,'checked_quotes');
  assert.match(got!.text,/Interpretação da IA \(a revisar\)/);
 });
}
test('benchmark: linha não vista, citação inventada, arquivo indevido são rejeitados',()=>{
 const valid=finding(lAsk,'A linha verifica r.ok');
 assert.equal(reviewLabResponse(propose([{...valid,line:9999}]),evidence,facts,undefined,path),null);
 assert.equal(reviewLabResponse(propose([{...valid,quote:'não existe no código'}]),evidence,facts,undefined,path),null);
 assert.equal(reviewLabResponse(propose([{...valid,file:'lib/secrets.ts'}]),evidence,facts,undefined,path),null);
 assert.equal(reviewLabResponse(propose([{...valid,quote:'a'}]),evidence,facts,undefined,path),null);
});
test('benchmark: fallback nunca finge ter corrigido ou executado',()=>{
 const got=localLabReview(evidence,objective);
 assert.equal(got.evidenceSupported,false);
 assert.match(got.text,/não confirmam erros/);
 assert.match(got.text,/Nenhum arquivo foi alterado/);
});
