/** Controle de produção, autônomo em relação ao CRM financeiro da Jornada.
 * Horários ISO sempre representam instantes; exibição e relógio em America/Fortaleza.
 * Regra confirmada: gravou no dia D? relógio inicia 00:00 do dia D+1
 * (Fortaleza). Meta interna +48h; prazo máximo +72h. Avaliação
 * do cliente e entrega aprovada são fatos diferentes.
 */
export const PRODUCTION_TIMEZONE = 'America/Fortaleza';
export type Stage = 'planned' | 'scheduled' | 'captured' | 'editing' | 'review' |
  'changes_requested' | 'approved' | 'delivered' | 'cancelled';
export type Work = {
  id: string;
  clientName: string;
  contactId?: string;
  projectId?: string;
  title: string;
  stage: Stage;
  scheduledAt?: string;
  capturedAt?: string;
  reviewSentAt?: string;
  firstReviewSentAt?: string;
  approvedAt?: string;
  deliveredAt?: string;
  agreedFeeCents?: number;
  notes?: string;
  history: {stage: Stage; at: string}[];
  createdAt: string;
  updatedAt: string;
};
export type Payment = {
  id: string;
  workId: string;
  amountCents: number;
  receivedAt: string;
  createdAt: string;
};
export type ProductionData = {version: 1; works: Work[]; payments: Payment[]; updatedAt: string};
export function emptyProduction(): ProductionData {
  return {version:1,works:[],payments:[],updatedAt:new Date().toISOString()};
}
export const stages: Stage[] = [
  'planned','scheduled','captured','editing','review',
  'changes_requested','approved','delivered','cancelled'
];
const transitions: Record<Stage, Stage[]> = {
  planned:['scheduled','captured','cancelled'],
  scheduled:['planned','captured','cancelled'],
  captured:['editing','review','cancelled'],
  editing:['review','cancelled'],
  review:['changes_requested','approved','cancelled'],
  changes_requested:['editing','review','cancelled'],
  approved:['delivered','changes_requested'],
  delivered:[],
  cancelled:[]
};
export function transitionAllowed(from: Stage,to: Stage) {
  return transitions[from]?.includes(to) || false;
}
function fmtParts(date:Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PRODUCTION_TIMEZONE, day:'2-digit',month:'2-digit',year:'numeric'
  }).formatToParts(date).reduce<Record<string,number>>((acc,p)=>{
    if(['year','month','day'].includes(p.type)) acc[p.type] = Number(p.value);
    return acc;
  },{});
}
function offsetMinutes(utcInstant: number) {
  const name = new Intl.DateTimeFormat('en-US',{
    timeZone:PRODUCTION_TIMEZONE,timeZoneName:'shortOffset'
  }).formatToParts(new Date(utcInstant)).find(p=>p.type==='timeZoneName')?.value||'';
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name);
  if(name==='GMT'||name==='UTC') return 0;
  if(!match) throw new Error('INVALID_TIMEZONE_OFFSET');
  return (match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3]||0));
}
export function deadlineFor(capturedAt?:string) {
  if(!capturedAt) return null;
  const captured=new Date(capturedAt);
  if(!Number.isFinite(captured.getTime()))return null;
  const {year,month,day}=fmtParts(captured);
  const nominal=Date.UTC(year,month-1,day+1,0,0,0);
  // Recover 00:00 in Fortaleza, even when server runs in UTC.
  let startMs=nominal - offsetMinutes(nominal)*60_000;
  startMs=nominal - offsetMinutes(startMs)*60_000;
  const startedAt=new Date(startMs).toISOString();
  return { startedAt, targetAt:new Date(startMs+48*3_600_000).toISOString(),
           dueAt:new Date(startMs+72*3_600_000).toISOString()};
}
export function isProductionFinished(work:Work) {
  return work.stage==='delivered' || work.stage==='cancelled';
}
export function productionUrgency(work:Work,now=new Date()) {
  if(isProductionFinished(work))return 'finished' as const;
  const clock=deadlineFor(work.capturedAt);
  if(!clock)return 'not_started' as const;
  if(work.firstReviewSentAt){
    if(work.stage==='review')return 'waiting_client' as const;
    if(['editing','changes_requested'].includes(work.stage))return 'revisions' as const;
    return new Date(work.firstReviewSentAt).getTime()>new Date(clock.dueAt).getTime()
      ? 'sent_late' as const:'sent_on_time' as const;
  }
  const nowMs=now.getTime();
  if(nowMs>=new Date(clock.dueAt).getTime())return 'overdue' as const;
  if(nowMs>=new Date(clock.targetAt).getTime())return 'at_risk' as const;
  return 'on_track' as const;
}
export function paymentSummary(data:ProductionData,work:Work) {
  const receivedCents=data.payments.filter(p=>p.workId===work.id)
    .reduce((total,p)=>total+p.amountCents,0);
  const fee=work.agreedFeeCents;
  return {receivedCents,
    remainingCents:fee===undefined?null:Math.max(0,fee-receivedCents),
    status:fee===undefined?'not_agreed':receivedCents===0?'unpaid':
      receivedCents<fee?'partial':'paid'
  } as const;
}
export function overlappingEditions(works:Work[]) {
  const groups=new Map<string,string[]>();
  for(const work of works){
    if(!work.capturedAt || isProductionFinished(work))continue;
    const clock=deadlineFor(work.capturedAt);
    if(!clock)continue;
    const key=clock.startedAt;
    groups.set(key,[...(groups.get(key)||[]),work.id]);
  }
  return [...groups.entries()].filter(([,ids])=>ids.length>1)
    .map(([day,workIds])=>({startOfWork:day,workIds}));
}
export function ensureValidDate(input:unknown) {
  if(typeof input!=='string')throw new Error('INVALID_DATE');
  const result=new Date(input);
  if(!Number.isFinite(result.getTime())||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(input))
    throw new Error('INVALID_DATE');
  return result.toISOString();
}
export function safeText(input:unknown,max=140){
  return typeof input==='string'?input.trim().slice(0,max):'';
}
export function safeMoney(input:unknown){
  if(typeof input!=='number'||!Number.isSafeInteger(input)||input<0||input>100_000_000)
    throw new Error('INVALID_AMOUNT');
  return input;
}
