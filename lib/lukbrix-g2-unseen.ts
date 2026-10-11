/**
 * Auditoria G2 com um terceiro conjunto ROTULADO e não utilizado na seleção.
 * Mostra generalização efetiva do FILTRO; não avalia raciocínio da LLM.
 * É ferramenta pura, não escreve, não executa código recebido e não publica.
 */
import {
 LUKBRIX_G2_BASELINE,runLukbrixG2Experiment,scoreLukbrixPolicy,
 type LukbrixCase,type LukbrixPolicy
} from './lukbrix-g2-sandbox';

function normalize(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function signature(c:LukbrixCase):string{
 return [normalize(c.sourceLine),normalize(c.quote),normalize(c.claim)].join('\u0000');
}
function validNovelSet(train:readonly LukbrixCase[],hold:readonly LukbrixCase[],novel:readonly LukbrixCase[]){
 if(novel.length<12||novel.length>64)throw new Error('G2_NOVEL_INVALID_SIZE');
 const knownIds=new Set([...train,...hold].map(c=>c.id));
 const knownSignatures=new Set([...train,...hold].map(signature));
 const uniqueIds=new Set<string>(),uniqueSignatures=new Set<string>();
 let trueCount=0,falseCount=0;
 for(const c of novel){
  if(!c||typeof c.id!=='string'||!/^[a-z0-9][a-z0-9-]{2,40}$/.test(c.id)||
     knownIds.has(c.id)||uniqueIds.has(c.id)||knownSignatures.has(signature(c))||
     uniqueSignatures.has(signature(c))||typeof c.sourceLine!=='string'||
     typeof c.quote!=='string'||typeof c.claim!=='string'||
     c.sourceLine.length>500||c.quote.length>200||c.claim.length>500||
     !Array.isArray(c.verifiedFacts)||c.verifiedFacts.length>4||
     !c.verifiedFacts.every(f=>f==='ask_has_r_ok'||f==='refresh_uses_callback')||
     !['true','false'].includes(c.label))throw new Error('G2_NOVEL_LEAK_OR_INVALID');
  uniqueIds.add(c.id);uniqueSignatures.add(signature(c));
  if(c.label==='true')trueCount++;else falseCount++;
 }
 if(trueCount<5||falseCount<5)throw new Error('G2_NOVEL_UNBALANCED');
}
function prediction(caseItem:LukbrixCase,policy:LukbrixPolicy):boolean{
 const r=scoreLukbrixPolicy([caseItem],policy);
 return caseItem.label==='true'?r.trueAccepted===1:r.falseRejected===1;
}
export type NovelAuditResult={
 generation:'G2 — prova independente';
 sampleCount:number;
 baselineCorrect:number;
 candidateCorrect:number|null;
 baselineFalseRejectionRate:number;
 baselineTrueAcceptanceRate:number;
 candidateFalseRejectionRate:number|null;
 candidateTrueAcceptanceRate:number|null;
 newlyBrokenCases:string[];
 unresolvedFalseCases:string[];
 readyForFurtherReview:boolean;
 readyForDeployment:false;
 verdict:'no_candidate'|'generalization_failed'|'requires_external_validation';
};
/**
 * GATE CONSERVADOR: um erro no desafio deixa o candidato em experimentação.
 * Mesmo 100% nos exemplos rotulados NÃO comprova inteligência ou autoriza deploy.
 */
export function auditG2OnUnseen(
 training:readonly LukbrixCase[],holdout:readonly LukbrixCase[],
 novel:readonly LukbrixCase[]
):NovelAuditResult{
 validNovelSet(training,holdout,novel);
 const experiment=runLukbrixG2Experiment(training,holdout);
 const baselinePolicy=LUKBRIX_G2_BASELINE;
 const candidatePolicy=experiment.selected?.policy??null;
 const base=scoreLukbrixPolicy(novel,baselinePolicy);
 const next=candidatePolicy?scoreLukbrixPolicy(novel,candidatePolicy):null;
 const baseCases=novel.map(c=>prediction(c,baselinePolicy));
 const candidateCases=candidatePolicy?novel.map(c=>prediction(c,candidatePolicy)):null;
 const newlyBrokenCases=candidateCases?novel.filter((c,i)=>baseCases[i]&&!candidateCases[i]).map(c=>c.id):[];
 const unresolvedFalseCases=candidateCases?novel.filter((c,i)=>c.label==='false'&&!candidateCases[i]).map(c=>c.id):[];
 const baseRateFalse=base.falseRejected/base.falseTotal;
 const baseRateTrue=base.trueAccepted/base.trueTotal;
 const candidateRateFalse=next?next.falseRejected/next.falseTotal:null;
 const candidateRateTrue=next?next.trueAccepted/next.trueTotal:null;
 const allCorrect=!!next&&next.falseRejected===next.falseTotal&&next.trueAccepted===next.trueTotal;
 const noRegression=!!next&&next.falseRejected>=base.falseRejected&&next.trueAccepted>=base.trueAccepted&&newlyBrokenCases.length===0;
 const pass=allCorrect&&noRegression;
 return {
  generation:'G2 — prova independente',sampleCount:novel.length,
  baselineCorrect:base.falseRejected+base.trueAccepted,
  candidateCorrect:next?next.falseRejected+next.trueAccepted:null,
  baselineFalseRejectionRate:baseRateFalse,
  baselineTrueAcceptanceRate:baseRateTrue,
  candidateFalseRejectionRate:candidateRateFalse,
  candidateTrueAcceptanceRate:candidateRateTrue,
  newlyBrokenCases,unresolvedFalseCases,
  readyForFurtherReview:pass,
  readyForDeployment:false,
  verdict:!candidatePolicy?'no_candidate':pass?'requires_external_validation':'generalization_failed'
 };
}
