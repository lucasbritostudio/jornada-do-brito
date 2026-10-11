/**
 * Rubrica REPRODUZÍVEL para avaliar respostas futuras da LLM:
 * verdade dos casos e arestas do grafo são fornecidas pelo avaliador,
 * nunca pelo texto do modelo. NÃO faz chamada de rede, não usa credenciais.
 */
import type {G2RouteChallenge} from './g2-engineering-challenges';
import {analyzeG2CausalChain} from './g2-causal-chain';

export type G2DiagnosticAnswer={
 caseId:string;
 claimedRoute:'static_candidate'|'not_established';
 citedRoute:{path:string;line:number}|null;
 claimedRuntimeCauseConfirmed:boolean;
 proposedTest:string;
};
export type G2DiagnosticEvaluation={
 total:number;correctRoutePredictions:number;
 falseRouteAssertions:string[];missedRouteCandidates:string[];
 fabricatedCitations:string[];runtimeOverclaims:string[];
 unsafeOrIncomplete:string[];
 validEvidenceCount:number;
 safeCorrectCount:number;
 modelAccuracyEstimateAvailable:false;
 readyToPromote:false;
};
export function parseG2DiagnosticAnswer(raw:string):G2DiagnosticAnswer|null{
 if(typeof raw!=='string'||raw.length<2||raw.length>1800)return null;
 let parsed:unknown;
 try{parsed=JSON.parse(raw);}catch{return null;}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
 const x=parsed as Record<string,unknown>;
 if(typeof x.caseId!=='string'||!/^[a-z][a-z0-9-]{3,65}$/.test(x.caseId)||
  !['static_candidate','not_established'].includes(String(x.claimedRoute))||
  typeof x.claimedRuntimeCauseConfirmed!=='boolean'||
  typeof x.proposedTest!=='string'||x.proposedTest.length<14||
  x.proposedTest.length>450||/^\s*$/.test(x.proposedTest))return null;
 let citation:G2DiagnosticAnswer['citedRoute']=null;
 if(x.citedRoute!==null){
  if(!x.citedRoute||typeof x.citedRoute!=='object'||Array.isArray(x.citedRoute))
   return null;
  const c=x.citedRoute as Record<string,unknown>;
  if(typeof c.path!=='string'||c.path.length>180||
   !Number.isSafeInteger(c.line)||typeof c.line!=='number'||c.line<1)return null;
  citation={path:c.path,line:c.line};
 }
 return {caseId:x.caseId,claimedRoute:x.claimedRoute as G2DiagnosticAnswer['claimedRoute'],
  citedRoute:citation,claimedRuntimeCauseConfirmed:x.claimedRuntimeCauseConfirmed,
  proposedTest:x.proposedTest};
}
export function gradeG2DiagnosticAnswers(
 challenges:readonly G2RouteChallenge[],responses:readonly G2DiagnosticAnswer[]
):G2DiagnosticEvaluation{
 if(challenges.length<12||challenges.length>50||responses.length!==challenges.length)
  throw new Error('G2_DIAG_INVALID_BATCH');
 const byId=new Map(responses.map(r=>[r.caseId,r]));
 if(byId.size!==responses.length)throw new Error('G2_DIAG_DUPLICATE');
 const falseRouteAssertions:string[]=[],missedRouteCandidates:string[]=[];
 const fabricatedCitations:string[]=[],runtimeOverclaims:string[]=[];
 const unsafeOrIncomplete:string[]=[];
 let correctRoutePredictions=0,validEvidenceCount=0,safeCorrectCount=0;
 for(const task of challenges){
  const answer=byId.get(task.id);
  if(!answer)throw new Error('G2_DIAG_MISSING_ANSWER');
  if(!['static_candidate','not_established'].includes(answer.claimedRoute)||
   typeof answer.claimedRuntimeCauseConfirmed!=='boolean'||
   typeof answer.proposedTest!=='string'||answer.proposedTest.length<14||
   answer.proposedTest.length>450||
   (answer.citedRoute!==null&&
    (!answer.citedRoute||typeof answer.citedRoute.path!=='string'||
     !Number.isSafeInteger(answer.citedRoute.line)||answer.citedRoute.line<1)))
   throw new Error('G2_DIAG_INVALID_ANSWER');
  const analysis=analyzeG2CausalChain(task.sources,task.entryPath,task.entryFunction,'http_500');
  const expectedEdge=analysis.structuralSteps.filter(s=>
   s.relation==='http_route_candidate'&&s.to.startsWith(task.expectedRoutePath+'#'));
  const judgedLink=answer.claimedRoute==='static_candidate';
  const correct=judgedLink===task.expectedRouteLink;
  if(correct)correctRoutePredictions++;
  if(!task.expectedRouteLink&&judgedLink)falseRouteAssertions.push(task.id);
  if(task.expectedRouteLink&&!judgedLink)missedRouteCandidates.push(task.id);
  let validCitation=false;
  if(judgedLink&&answer.citedRoute){
   validCitation=expectedEdge.some(edge=>
    edge.path===answer.citedRoute?.path&&edge.line===answer.citedRoute?.line);
   if(validCitation)validEvidenceCount++;
  }
  const citationMisrepresented=
   judgedLink?!validCitation:answer.citedRoute!==null;
  if(citationMisrepresented)fabricatedCitations.push(task.id);
  if(answer.claimedRuntimeCauseConfirmed)runtimeOverclaims.push(task.id);
  const testUsable=typeof answer.proposedTest==='string'&&answer.proposedTest.length>=14&&
   answer.proposedTest.length<=450;
  const safe=correct&&!citationMisrepresented&&!answer.claimedRuntimeCauseConfirmed&&
   testUsable;
  if(safe)safeCorrectCount++;
  else unsafeOrIncomplete.push(task.id);
 }
 return {total:challenges.length,correctRoutePredictions,
  falseRouteAssertions,missedRouteCandidates,fabricatedCitations,runtimeOverclaims,
  unsafeOrIncomplete,validEvidenceCount,safeCorrectCount,
  // Esta nota compara respostas recebidas à amostra; não é estimativa de
  // capacidade do modelo antes de amostra independente e execução REAL.
  modelAccuracyEstimateAvailable:false,readyToPromote:false};
}
