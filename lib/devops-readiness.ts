import type {Observation} from './devops-observer';

/**
 * Gatilho econômico de suficiência de AMOSTRAS, não de aprovação operacional.
 * Somente dados agregados e normalizados; a fonte owner_import permanece não autenticada.
 * Limites técnicos fixos por padrão: 3 leituras separadas por >=5 minutos e
 * uma janela observada de pelo menos 10 minutos.
 */
export const EVIDENCE_READINESS_POLICY={
 minimumSamples:3,
 minimumSpacingMs:5*60_000,
 minimumSpanMs:10*60_000,
 freshWithinMs:30*60_000,
} as const;
export type EvidenceReadiness={
 status:'collecting'|'review_ready';
 observedSamples:number;
 requiredSamples:number;
 observedSpanMs:number;
 requiredSpanMs:number;
 latestObservedAt:number|null;
 isFresh:boolean;
 operationalEvidence:'INCONCLUSIVO';
 realConnectorConnected:false;
 alert:boolean;
 message:string;
};

export function evaluateEvidenceReadiness(
 observations:readonly {evidence:Observation}[],now=Date.now(),
):EvidenceReadiness{
 // Evidência NÃO autenticada não pode completar um gate operacional.
 // Esta contagem serve exclusivamente para chamar o desenvolvedor à revisão.
 const eligible=observations.map(x=>x.evidence)
  .filter(e=>e.projectId==='chefebot'&&e.environment==='production'
   &&e.source.kind==='owner_import'&&e.verifiedCodeSha===null
   &&e.verification.outcome==='INCONCLUSIVO'
   &&typeof e.observedAt==='number'&&Number.isSafeInteger(e.observedAt)
   &&e.observedAt>=0&&e.observedAt<=now+60_000
   &&e.signals.redis.quality==='valid'
   &&e.signals.evolution.quality==='valid'
   &&e.signals.pending.quality==='valid'
   &&e.signals.inFlight.quality==='valid'
   &&e.signals.ambiguous.quality==='valid'
   &&e.signals.unresolved.quality==='valid');
 const times=[...new Set(eligible.map(e=>e.observedAt as number))].sort((a,b)=>a-b);
 const spaced:number[]=[];
 for(const at of times){
  if(spaced.length===0||at-spaced[spaced.length-1]>=EVIDENCE_READINESS_POLICY.minimumSpacingMs)spaced.push(at);
 }
 const first=spaced[0]??null,last=spaced.at(-1)??null;
 const span=first!==null&&last!==null?last-first:0;
 const ready=spaced.length>=EVIDENCE_READINESS_POLICY.minimumSamples&&span>=EVIDENCE_READINESS_POLICY.minimumSpanMs;
 const fresh=last!==null&&last<=now+60_000&&now-last<=EVIDENCE_READINESS_POLICY.freshWithinMs;
 return {
  status:ready?'review_ready':'collecting',
  observedSamples:spaced.length,
  requiredSamples:EVIDENCE_READINESS_POLICY.minimumSamples,
  observedSpanMs:span,
  requiredSpanMs:EVIDENCE_READINESS_POLICY.minimumSpanMs,
  latestObservedAt:last,
  isFresh:fresh,
  operationalEvidence:'INCONCLUSIVO',
  realConnectorConnected:false,
  alert:ready,
  message:ready
   ?'Limite técnico de amostras importadas atingido. Pronto para revisão; ainda não há prova autenticada de produção.'
   :'Aguardando leituras válidas e independentes. Importações não comprovam o funcionamento em produção.',
 };
}
