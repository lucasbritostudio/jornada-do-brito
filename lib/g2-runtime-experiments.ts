/**
 * G2: portas de experimento causal em FUNÇÕES REAIS DE TESTE.
 * Não executa código de prompts/modelos/usuários. Somente callbacks registrados
 * no próprio teste local; não exportar isto para endpoint ou aceitar JS externo.
 *
 * Falha induzida != defeito em produção. Causalidade comprovada apenas
 * dentro do experimento com intervenção, nunca extrapolada ao sistema real.
 */
import {isDeepStrictEqual} from 'node:util';

export type G2ProbeKind='reproducer'|'regression'|'holdout';
export type G2RuntimeProbe={
 id:string;
 kind:G2ProbeKind;
 expected:unknown;
 // Definidos no repositório por testes confiáveis, não extraídos de prompts.
 baseline:()=>unknown|Promise<unknown>;
 candidate:()=>unknown|Promise<unknown>;
};
export type G2ProbeOutcome={
 id:string;kind:G2ProbeKind;
 baselinePass:boolean;candidatePass:boolean;
 baselineError:boolean;candidateError:boolean;
 observedChange:'fixed'|'regressed'|'unchanged_correct'|'unchanged_incorrect';
};
export type G2ExperimentResult={
 kind:'controlled_mutation_runtime';
 baselineCorrect:number;candidateCorrect:number;
 reproducedFailure:boolean;
 fixedReproducerIds:string[];
 regressions:string[];
 uncorrected:string[];
 holdoutFailures:string[];
 correctedWithoutRegressions:boolean;
 acceptedForFurtherReview:boolean;
 causalFinding:'intervention_consistent_in_sandbox'|'not_supported_by_trial';
 productionDefectConfirmed:false;
 realWorldCauseConfirmed:false;
 automaticallyApplied:false;
 deployAuthorized:false;
 observations:G2ProbeOutcome[];
};
type Resolution={pass:boolean;error:boolean};
async function resolveProbe(run:()=>unknown|Promise<unknown>,expected:unknown):Promise<Resolution>{
 try{
  const result=await run();
  return {pass:isDeepStrictEqual(result,expected),error:false};
 }catch{
  // Não divulgar stack, payload de exceção ou valores de clientes.
  return {pass:false,error:true};
 }
}
export async function evaluateG2RuntimeExperiment(
 probes:readonly G2RuntimeProbe[]
):Promise<G2ExperimentResult>{
 if(probes.length<6||probes.length>48)throw new Error('G2_RUNTIME_CASE_COUNT');
 const ids=new Set<string>();
 const counts:{[K in G2ProbeKind]:number}={reproducer:0,regression:0,holdout:0};
 for(const p of probes){
  if(!p||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{2,55}$/.test(p.id)||
   ids.has(p.id)||!['reproducer','regression','holdout'].includes(p.kind)||
   typeof p.baseline!=='function'||typeof p.candidate!=='function')
   throw new Error('G2_RUNTIME_INVALID_PROBE');
  ids.add(p.id);counts[p.kind]++;
 }
 if(counts.reproducer<1||counts.regression<2||counts.holdout<2)
  throw new Error('G2_RUNTIME_UNBALANCED_CASES');
 const observations:G2ProbeOutcome[]=[];
 for(const probe of probes){
  const base=await resolveProbe(probe.baseline,probe.expected);
  const next=await resolveProbe(probe.candidate,probe.expected);
  const observedChange=base.pass?
   (next.pass?'unchanged_correct':'regressed'):
   (next.pass?'fixed':'unchanged_incorrect');
  observations.push({
   id:probe.id,kind:probe.kind,
   baselinePass:base.pass,candidatePass:next.pass,
   baselineError:base.error,candidateError:next.error,observedChange
  });
 }
 const reproducedFailure=observations.some(o=>o.kind==='reproducer'&&!o.baselinePass);
 const fixedReproducerIds=observations.filter(o=>o.kind==='reproducer'&&
  !o.baselinePass&&o.candidatePass).map(o=>o.id);
 const regressions=observations.filter(o=>o.observedChange==='regressed').map(o=>o.id);
 const uncorrected=observations.filter(o=>!o.candidatePass).map(o=>o.id);
 const holdoutFailures=observations.filter(o=>o.kind==='holdout'&&!o.candidatePass).map(o=>o.id);
 const correctedWithoutRegressions=reproducedFailure&&
  observations.filter(o=>o.kind==='reproducer').every(o=>o.candidatePass)&&
  regressions.length===0&&uncorrected.length===0;
 const acceptedForFurtherReview=correctedWithoutRegressions&&holdoutFailures.length===0;
 return {
  kind:'controlled_mutation_runtime',
  baselineCorrect:observations.filter(o=>o.baselinePass).length,
  candidateCorrect:observations.filter(o=>o.candidatePass).length,
  reproducedFailure,fixedReproducerIds,regressions,uncorrected,holdoutFailures,
  correctedWithoutRegressions,acceptedForFurtherReview,
  causalFinding:acceptedForFurtherReview?'intervention_consistent_in_sandbox':'not_supported_by_trial',
  productionDefectConfirmed:false,realWorldCauseConfirmed:false,
  automaticallyApplied:false,deployAuthorized:false,
  observations
 };
}
