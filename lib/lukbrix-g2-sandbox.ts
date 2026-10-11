/**
 * LUKBRIX G2 — experimentos SINTÉTICOS em memória.
 * Motor puro, sem acesso a GitHub, rede, chaves, banco ou Vercel.
 * NUNCA compila nem executa texto produzido por uma IA. Testa só políticas fixas.
 */
import {evaluateBrionPromotion} from './brion-research';

export type LukbrixCase={
 id:string;label:'true'|'false';sourceLine:string;quote:string;claim:string;
 verifiedFacts:readonly ('ask_has_r_ok'|'refresh_uses_callback')[];
};
export type LukbrixPolicy={
 requireQuote:boolean;
 rejectAbsence:boolean;
 rejectKnownContradictions:boolean;
};
export type LukbrixScores={
 falseRejected:number;falseTotal:number;trueAccepted:number;trueTotal:number;
};
export type LukbrixTrial={
 policy:LukbrixPolicy;
 train:LukbrixScores;
 holdout:LukbrixScores;
 trainPass:boolean;
 holdoutPass:boolean;
 improved:boolean;
};
export type LukbrixExperiment={
 generation:'G2 — simulação isolada';
 status:'candidate_only';
 baseline:LukbrixTrial;
 candidates:LukbrixTrial[];
 selected:LukbrixTrial|null;
 outputIsExecutable:false;
 modifiesProduction:false;
 createsBranchOrDeploy:false;
 requiresHumanReview:true;
};

export const LUKBRIX_G2_BASELINE:Readonly<LukbrixPolicy>=Object.freeze({
 requireQuote:true,rejectAbsence:true,rejectKnownContradictions:false
});
const ascii=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function reject(caseItem:LukbrixCase,p:LukbrixPolicy){
 const src=caseItem.sourceLine.replace(/\s+/g,' ').trim();
 const quote=caseItem.quote.replace(/\s+/g,' ').trim();
 if(p.requireQuote&&(!quote||quote.length<9||!src.includes(quote)))return true;
 const claim=ascii(caseItem.claim);
 if(p.rejectAbsence&&/\b(?:falta|sem|nao existe|nao foi definido|ausencia)\b/.test(claim))
  return true;
 if(p.rejectKnownContradictions){
  if(caseItem.verifiedFacts.includes('ask_has_r_ok')&&
   /(?:adicionar|implementar|criar|incluir|precisa|deveria)/.test(claim)&&
   /(?:r\.ok|validar status|verificar status|checagem de status)/.test(claim))return true;
  if(caseItem.verifiedFacts.includes('refresh_uses_callback')&&
   /(?:adicionar|definir|criar|implementar|precisa|deveria)/.test(claim)&&
   /usecallback/.test(claim))return true;
 }
 return false;
}
export function scoreLukbrixPolicy(cases:readonly LukbrixCase[],policy:LukbrixPolicy):LukbrixScores{
 let falseRejected=0,falseTotal=0,trueAccepted=0,trueTotal=0;
 for(const sample of cases){
  const blocked=reject(sample,policy);
  if(sample.label==='false'){falseTotal++;if(blocked)falseRejected++;}
  else {trueTotal++;if(!blocked)trueAccepted++;}
 }
 return {falseRejected,falseTotal,trueAccepted,trueTotal};
}
/** Uma média melhor não pode esconder a perda de um acerto anterior. */
function preservesCorrectCases(
 cases:readonly LukbrixCase[],candidate:LukbrixPolicy
):boolean{
 return cases.every(sample=>{
  const shouldReject=sample.label==='false';
  const baselineCorrect=reject(sample,LUKBRIX_G2_BASELINE)===shouldReject;
  const candidateCorrect=reject(sample,candidate)===shouldReject;
  return !baselineCorrect||candidateCorrect;
 });
}
function verifyDataset(samples:readonly LukbrixCase[],tag:string){
 if(samples.length<4||samples.length>64)throw new Error('LUKBRIX_INVALID_'+tag);
 const ids=new Set<string>();
 let negatives=0,positives=0;
 for(const item of samples){
  if(!item||typeof item!=='object'||typeof item.id!=='string'||
     !/^[a-z0-9][a-z0-9-]{2,40}$/.test(item.id)||ids.has(item.id)||
     !['true','false'].includes(item.label)||
     typeof item.sourceLine!=='string'||item.sourceLine.length>500||
     typeof item.quote!=='string'||item.quote.length>200||
     typeof item.claim!=='string'||item.claim.length>500||
     !Array.isArray(item.verifiedFacts)||item.verifiedFacts.length>4||
     !item.verifiedFacts.every(f=>f==='ask_has_r_ok'||f==='refresh_uses_callback'))
   throw new Error('LUKBRIX_INVALID_'+tag);
  ids.add(item.id);
  if(item.label==='false')negatives++;else positives++;
 }
 if(negatives<2||positives<2)throw new Error('LUKBRIX_UNBALANCED_'+tag);
 return ids;
}
const policies:readonly LukbrixPolicy[]=[
 {requireQuote:true,rejectAbsence:true,rejectKnownContradictions:true},
 {requireQuote:true,rejectAbsence:false,rejectKnownContradictions:true},
 {requireQuote:false,rejectAbsence:true,rejectKnownContradictions:true}
];
/**
 * "Sandbox" lógico: pesquisa finita, memória local, nenhuma execução de conteúdo
 * adversarial. Dados rotulados e holdout separado impedem aprovação por um único teste.
 */
export function runLukbrixG2Experiment(
 training:readonly LukbrixCase[],holdout:readonly LukbrixCase[]
):LukbrixExperiment{
 const trainIds=verifyDataset(training,'TRAIN');
 const holdIds=verifyDataset(holdout,'HOLDOUT');
 if([...trainIds].some(x=>holdIds.has(x)))throw new Error('LUKBRIX_DATA_LEAK');
 const baseTrain=scoreLukbrixPolicy(training,LUKBRIX_G2_BASELINE);
 const baseHold=scoreLukbrixPolicy(holdout,LUKBRIX_G2_BASELINE);
 const baseline:LukbrixTrial={
  policy:{...LUKBRIX_G2_BASELINE},train:baseTrain,holdout:baseHold,
  trainPass:true,holdoutPass:true,improved:false
 };
 const candidates=policies.map(policy=>{
  const train=scoreLukbrixPolicy(training,policy);
  const valid=scoreLukbrixPolicy(holdout,policy);
  const trainVerdict=evaluateBrionPromotion(baseTrain,train);
  const holdVerdict=evaluateBrionPromotion(baseHold,valid);
  return {
   policy:{...policy},train,holdout:valid,
   trainPass:trainVerdict.candidatePassesGate&&preservesCorrectCases(training,policy),
   holdoutPass:holdVerdict.candidatePassesGate&&preservesCorrectCases(holdout,policy),
   improved:trainVerdict.improved||holdVerdict.improved,
  };
 });
 // Seleção pela fase TREINO; o holdout serve somente como veto, não como
 // função objetivo (evita escolher alterações que decoraram o teste oculto).
 const eligible=candidates.filter(c=>c.trainPass&&c.holdoutPass&&c.improved)
  .sort((a,b)=>{
   const aScore=a.train.falseRejected+a.train.trueAccepted;
   const bScore=b.train.falseRejected+b.train.trueAccepted;
   if(aScore!==bScore)return bScore-aScore;
   return Number(b.policy.rejectAbsence)-Number(a.policy.rejectAbsence);
  });
 return {
  generation:'G2 — simulação isolada',status:'candidate_only',
  baseline,candidates,selected:eligible[0]??null,
  outputIsExecutable:false,modifiesProduction:false,
  createsBranchOrDeploy:false,requiresHumanReview:true
 };
}
export const LUKBRIX_G2_SAMPLE_TRAIN:readonly LukbrixCase[]=[
 {id:'train-false-quote',label:'false',sourceLine:'const ready = true;',
  quote:'const ready = false;',claim:'A variável ready é falsa',verifiedFacts:[]},
 {id:'train-false-status',label:'false',sourceLine:'if(!r.ok)throw new Error("HTTP");',
  quote:'if(!r.ok)throw',claim:'Precisa adicionar a verificação r.ok',
  verifiedFacts:['ask_has_r_ok']},
 {id:'train-false-refresh',label:'false',sourceLine:'const refresh=useCallback(async()=>{},[]);',
  quote:'const refresh=useCallback',claim:'Definir refresh com useCallback',
  verifiedFacts:['refresh_uses_callback']},
 {id:'train-false-absence',label:'false',sourceLine:'async function ask(){ /* intentionally incomplete */ }',
  quote:'async function ask()',claim:'ask sem verificação de status',verifiedFacts:[]},
 {id:'train-true-status',label:'true',sourceLine:'if(!r.ok)throw new Error("HTTP");',
  quote:'if(!r.ok)throw',claim:'O código já verifica r.ok',
  verifiedFacts:['ask_has_r_ok']},
 {id:'train-true-refresh',label:'true',sourceLine:'const refresh=useCallback(async()=>{},[]);',
  quote:'const refresh=useCallback',claim:'A função refresh já usa useCallback',
  verifiedFacts:['refresh_uses_callback']}
];
export const LUKBRIX_G2_SAMPLE_HOLDOUT:readonly LukbrixCase[]=[
 {id:'hold-false-quote',label:'false',sourceLine:'const loaded = true;',
  quote:'const loaded = false;',claim:'Carregamento desligado',
  verifiedFacts:[]},
 {id:'hold-false-status',label:'false',sourceLine:'if(!r.ok)throw new Error("bad");',
  quote:'if(!r.ok)throw',claim:'Implementar checagem de status da resposta via r.ok',
  verifiedFacts:['ask_has_r_ok']},
 {id:'hold-false-refresh',label:'false',sourceLine:'const refresh=useCallback(async()=>{},[]);',
  quote:'const refresh=useCallback',claim:'É necessário adicionar useCallback em refresh',
  verifiedFacts:['refresh_uses_callback']},
 {id:'hold-false-absence',label:'false',sourceLine:'async function refresh(){ return null; }',
  quote:'async function refresh()',claim:'falta verificação de erro',verifiedFacts:[]},
 {id:'hold-true-status',label:'true',sourceLine:'if(!r.ok)throw new Error("bad");',
  quote:'if(!r.ok)throw',claim:'Existe verificação explícita de status',
  verifiedFacts:['ask_has_r_ok']},
 {id:'hold-true-refresh',label:'true',sourceLine:'const refresh=useCallback(async()=>{},[]);',
  quote:'const refresh=useCallback',claim:'refresh é declarado usando useCallback',
  verifiedFacts:['refresh_uses_callback']}
];
