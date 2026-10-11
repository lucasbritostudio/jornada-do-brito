/**
 * Benchmark offline de ROTAS e relações: mede afirmações falsificáveis
 * sobre cadeias estáticas, não qualidade de respostas da LLM.
 * Os rótulos pertencem à avaliação e NUNCA são enviados ao analisador.
 */
import {analyzeG2CausalChain,type G2CausalScenario} from './g2-causal-chain';
import type {GraphSource} from './g2-function-graph';

export type G2RouteChallenge={
 id:string;title:string;entryPath:string;entryFunction:string;
 expectedRoutePath:string;
 expectedRouteLink:boolean;
 sources:readonly GraphSource[];
};
export type G2RouteChallengeResult={
 id:string;
 expectedRouteLink:boolean;predictedRouteLink:boolean;
 correct:boolean;falseLink:boolean;missedLink:boolean;
 confidence:'static_route_candidate_only';
 runtimeCauseConfirmed:false;
};
export type G2RouteChallengeSummary={
 total:number;positives:number;negatives:number;
 correct:number;precision:number|null;recall:number;
 falseLinks:string[];missedLinks:string[];
 baselineAlwaysLinkCorrect:number;
 safeToPromote:false;
 results:G2RouteChallengeResult[];
};
export function evaluateG2RouteChallenges(
 challenges:readonly G2RouteChallenge[],scenario:G2CausalScenario='http_500'
):G2RouteChallengeSummary{
 if(challenges.length<12||challenges.length>50)throw new Error('G2_CHALLENGE_INVALID_COUNT');
 const ids=new Set<string>();
 let positives=0,negatives=0;
 const results:G2RouteChallengeResult[]=[];
 for(const task of challenges){
  if(!task||typeof task.id!=='string'||!/^[a-z][a-z0-9-]{3,65}$/.test(task.id)||
   ids.has(task.id)||typeof task.expectedRouteLink!=='boolean'||
   !/^app\/api\/[\w/-]+\/route\.ts$/.test(task.expectedRoutePath)||
   typeof task.entryPath!=='string'||typeof task.entryFunction!=='string'||
   !Array.isArray(task.sources)||task.sources.length<1)
   throw new Error('G2_CHALLENGE_INVALID_ITEM');
  ids.add(task.id);
  if(task.expectedRouteLink)positives++;else negatives++;
  const report=analyzeG2CausalChain(task.sources,task.entryPath,task.entryFunction,scenario);
  const predictedRouteLink=report.structuralSteps.some(edge=>
   edge.relation==='http_route_candidate'&&edge.to.startsWith(task.expectedRoutePath+'#'));
  const correct=predictedRouteLink===task.expectedRouteLink;
  results.push({
   id:task.id,expectedRouteLink:task.expectedRouteLink,predictedRouteLink,
   correct,falseLink:predictedRouteLink&&!task.expectedRouteLink,
   missedLink:!predictedRouteLink&&task.expectedRouteLink,
   confidence:'static_route_candidate_only',runtimeCauseConfirmed:false
  });
 }
 if(positives<5||negatives<5)throw new Error('G2_CHALLENGE_UNBALANCED');
 const tp=results.filter(r=>r.expectedRouteLink&&r.predictedRouteLink).length;
 const fp=results.filter(r=>r.falseLink).length;
 return {
  total:results.length,positives,negatives,
  correct:results.filter(r=>r.correct).length,
  precision:tp+fp===0?null:tp/(tp+fp),recall:tp/positives,
  falseLinks:results.filter(r=>r.falseLink).map(r=>r.id),
  missedLinks:results.filter(r=>r.missedLink).map(r=>r.id),
  baselineAlwaysLinkCorrect:positives,
  safeToPromote:false,results
 };
}
