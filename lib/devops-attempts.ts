/** Planejador limitado, sem shell, rede, runner ou credenciais. O verificador
 * propõe um experimento; autorizações e execução pertencem às fases D/E.
 */
export type InvestigationAttempt={
 hypothesisId:string;contextDigest:string;at:number;
 outcome:'COMPROVADO'|'FALHOU'|'INCONCLUSIVO';
};
export type AttemptDecision={allowed:boolean;reason:
 'new_evidence'|'reuse_verified_result'|'no_new_evidence'|'cooldown'|'incident_budget'|'hypothesis_budget';
};
export function decideInvestigationAttempt(
 previous:readonly InvestigationAttempt[],hypothesisId:string,contextDigest:string,now=Date.now(),
):AttemptDecision{
 if(!/^[a-z_]{3,80}$/.test(hypothesisId)||!/^[a-f0-9]{64}$/.test(contextDigest)||
  !Number.isSafeInteger(now)||now<0||previous.some(a=>!Number.isSafeInteger(a.at)||a.at>now))
  throw new Error('DEVOPS_ATTEMPT_INVALID');
 const same=previous.filter(a=>a.hypothesisId===hypothesisId);
 const identical=same.findLast(a=>a.contextDigest===contextDigest);
 if(identical)return {allowed:false,reason:identical.outcome==='COMPROVADO'?'reuse_verified_result':'no_new_evidence'};
 if(previous.length>=12)return {allowed:false,reason:'incident_budget'};
 if(same.length>=3)return {allowed:false,reason:'hypothesis_budget'};
 const last=same.at(-1);
 if(last&&last.outcome!=='COMPROVADO'&&now-last.at<15*60_000)return {allowed:false,reason:'cooldown'};
 return {allowed:true,reason:'new_evidence'};
}
