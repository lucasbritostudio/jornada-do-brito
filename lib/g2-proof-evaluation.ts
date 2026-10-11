/**
 * Comparação pareada com casos ROTULADOS.
 * A IA e o algoritmo não recebem o rótulo na análise de um caso; o rótulo
 * aparece somente aqui para medir se a decisão final foi correta.
 */
import {LUKBRIX_G2_BASELINE,scoreLukbrixPolicy,type LukbrixCase} from './lukbrix-g2-sandbox';
import {checkG2Claim,type ProofFinding} from './g2-semantic-proof';

export type CaseAudit={id:string;label:LukbrixCase['label'];baselineCorrect:boolean;
 candidateCorrect:boolean;finding:ProofFinding};
export type PairedProofAudit={
 cases:number;
 baselineCorrect:number;candidateCorrect:number;
 baselineFalseWithheld:number;candidateFalseWithheld:number;falseCases:number;
 baselineTrueAccepted:number;candidateTrueAccepted:number;trueCases:number;
 correctedCases:string[];regressedCases:string[];
 falselyApprovedCases:string[];correctClaimsWithheld:string[];
 insufficientCases:string[];
 exactOneSidedP:number;
 improvedOnSample:boolean;
 candidatePassesControlledGate:boolean;
 safeToAutoMerge:false;
 safeToAutoDeploy:false;
};
function combTail(wins:number,losses:number):number{
 const n=wins+losses;
 if(n===0)return 1;
 if(n>60)throw new Error('G2_TOO_MANY_DISCORDANT_CASES');
 // P(X >= wins) para X~Bin(n,0.5), com empate excluído da conta.
 let c=1,p=0;
 for(let k=0;k<=n;k++){
  if(k>=wins)p+=c*Math.pow(0.5,n);
  c=c*(n-k)/(k+1);
 }
 return Math.min(1,p);
}
export function evaluateProofCandidate(cases:readonly LukbrixCase[]):PairedProofAudit{
 if(cases.length<12||cases.length>60)throw new Error('G2_INVALID_AUDIT_SIZE');
 const seen=new Set<string>();
 const audits:CaseAudit[]=cases.map(item=>{
  if(!item||typeof item.id!=='string'||seen.has(item.id)||!['true','false'].includes(item.label))
   throw new Error('G2_INVALID_AUDIT_CASE');
  seen.add(item.id);
  const old=scoreLukbrixPolicy([item],LUKBRIX_G2_BASELINE);
  const baselineAccepted=item.label==='true'?old.trueAccepted===1:old.falseRejected===0;
  const finding=checkG2Claim(item);
  const candidateAccepted=finding.decision==='supported';
  return {id:item.id,label:item.label,baselineCorrect:baselineAccepted===(item.label==='true'),
   candidateCorrect:candidateAccepted===(item.label==='true'),finding};
 });
 const trueCases=audits.filter(c=>c.label==='true'),falseCases=audits.filter(c=>c.label==='false');
 if(trueCases.length<5||falseCases.length<5)throw new Error('G2_INVALID_AUDIT_BALANCE');
 const corrected=audits.filter(c=>!c.baselineCorrect&&c.candidateCorrect).map(c=>c.id);
 const regressions=audits.filter(c=>c.baselineCorrect&&!c.candidateCorrect).map(c=>c.id);
 const baselineTrueAccepted=trueCases.filter(c=>c.baselineCorrect).length;
 const candidateTrueAccepted=trueCases.filter(c=>c.candidateCorrect).length;
 const baselineFalseWithheld=falseCases.filter(c=>c.baselineCorrect).length;
 const candidateFalseWithheld=falseCases.filter(c=>c.candidateCorrect).length;
 const improved=corrected.length>0&&regressions.length===0&&
  candidateTrueAccepted>=baselineTrueAccepted&&candidateFalseWithheld>=baselineFalseWithheld;
 const p=combTail(corrected.length,regressions.length);
 return {cases:audits.length,
  baselineCorrect:audits.filter(c=>c.baselineCorrect).length,
  candidateCorrect:audits.filter(c=>c.candidateCorrect).length,
  baselineFalseWithheld,candidateFalseWithheld,falseCases:falseCases.length,
  baselineTrueAccepted,candidateTrueAccepted,trueCases:trueCases.length,
  correctedCases:corrected,regressedCases:regressions,
  falselyApprovedCases:audits.filter(c=>c.label==='false'&&!c.candidateCorrect).map(c=>c.id),
  correctClaimsWithheld:audits.filter(c=>c.label==='true'&&!c.candidateCorrect).map(c=>c.id),
  insufficientCases:audits.filter(c=>c.finding.decision==='insufficient').map(c=>c.id),
  exactOneSidedP:p,improvedOnSample:improved,
  // Gate APENAS para levar à próxima avaliação independente e revisão humana.
  candidatePassesControlledGate:improved&&p<=0.05,
  safeToAutoMerge:false,safeToAutoDeploy:false};
}
