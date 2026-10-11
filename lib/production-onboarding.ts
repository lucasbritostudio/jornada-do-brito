import {getState,saveState} from './store';
import {changeProduction} from './production-store';
import type {Work,ProductionData} from './production';
import type {WorkspaceState} from './types';

const SOURCE='Planilha de clientes e prospecção · conferida em 11/10/2026';
const START='2026-10-11T00:00:00.000Z';
type SeedContact={key:string;name:string;kind:'client'|'prospect'|'partner'|'inactive';notes:string;next?:string};
export const SEED_CONTACTS:SeedContact[]=[
 {key:'garreto',name:'Garreto',kind:'client',notes:'Contrato em execução: 4 vídeos a R$200 cada. Apenas vídeo 01 possui produção imediata identificada; os outros três não têm datas informadas.',next:'Vídeo 01: gravação prevista em 13/10, horário ainda não informado; entregar e acompanhar pagamento.'},
 {key:'julianny-nisilene',name:'Julianny da Nisilene',kind:'client',notes:'Captação anterior entregue. R$200 pendentes na planilha em 11/10. Não importar como recebido.',next:'Conferir pagamento previsto entre 12 e 13/10.'},
 {key:'arte-print',name:'Arte Print (contato Alan)',kind:'prospect',notes:'Alan é funcionário e intermediador, não proprietário. Proposta de R$1.000 por 4 Reels para a Arte Print aguardando aprovação dos proprietários. Não é receita, contrato nem produção agendada.',next:'Aguardar decisão dos proprietários; nenhuma captação confirmada.'},
 {key:'mundo-do-celular',name:'Mundo do Celular',kind:'prospect',notes:'Portfólio enviado em 10/10/2026. Sem resposta, contrato, valores ou reunião confirmados.',next:'Acompanhar terça 13/10 apenas se continuar sem retorno.'},
 {key:'max-naiara',name:'Max / Naiara',kind:'prospect',notes:'Vídeo para loja de iPhone, valor estimado em R$250. Ainda não aprovado nem contratado.',next:'Conferir interesse e valor antes de agendar.'},
 {key:'berg-alves',name:'Berg Alves',kind:'partner',notes:'Possibilidade de parceria em eventos; não existe contrato nem data de produção.',next:'Aguardar oportunidade concreta.'},
 {key:'tarcisio',name:'Tarcísio',kind:'inactive',notes:'Trabalho anterior quitado; R$1.000 recebidos em 05/10. Não importar novamente como novo faturamento.',next:'Aguardar nova contratação.'}
];
type SeedWork={id:string;clientName:string;title:string;stage:Work['stage'];notes:string;agreedFeeCents?:number};
const SEED_WORKS:SeedWork[]=[
 {id:'origin-sheet-garreto-video-01',clientName:'Garreto',title:'Garreto — Vídeo 01',stage:'planned',agreedFeeCents:20000,
  notes:'Contrato confirmado com 4 vídeos a R$200 cada. Vídeo 01: gravação prevista terça 13/10; SEM HORÁRIO confirmado. Outros 3 vídeos NÃO registrados como valor a receber nem datas definidas.'},
 {id:'origin-sheet-julianny-entregue',clientName:'Julianny da Nisilene',title:'Captação anterior — entregue',stage:'delivered',agreedFeeCents:20000,
  notes:'Entregue antes desta importação; dia/hora de captação e entrega não informados. Pagamento de R$200 ainda pendente conforme planilha. Não registrar recebimento sem confirmação.'},
 {id:'origin-sheet-video-terca-sem-cobranca',clientName:'Cliente não identificado',title:'Vídeo já devido — terça-feira',stage:'planned',
  notes:'Gravação já combinada para terça 13/10 à noite, sem novo pagamento. Nome do cliente e horário exato não registrados; confirmar somente ao receber informação real.'}
];
const normalize=(s:string)=>s.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
export function mergeKnownProduction(data:ProductionData,at=START){
 let added=0;
 for(const item of SEED_WORKS){
  const same=data.works.some(w=>w.id===item.id||
    (normalize(w.clientName)===normalize(item.clientName)&&normalize(w.title)===normalize(item.title)));
  if(same)continue;
  const work:Work={...item,createdAt:at,updatedAt:at,
   history:[{stage:item.stage,at}],notes:item.notes};
  data.works.push(work);added++;
 }
 return added;
}
export function mergeKnownContacts(state:WorkspaceState,at=START){
 let added=0;
 for(const item of SEED_CONTACTS){
  if(state.contacts.some(c=>c.importKey==='onboard-jornada-'+item.key ||
     normalize(c.name)===normalize(item.name) ||
     (item.key==='arte-print'&&normalize(c.name).includes('arte print'))))continue;
  state.contacts.push({
   id:'onboard-jornada-'+item.key,name:item.name,
   lifecycle:item.kind==='partner'?'partner':item.kind==='inactive'?'inactive':
     item.kind==='client'?'client':'prospect',
   source:SOURCE,notes:item.notes,nextAction:item.next,
   importKey:'onboard-jornada-'+item.key,
   provenance:{kind:'drive_import',label:SOURCE,updatedAt:at},
   createdAt:at,updatedAt:at
  });added++;
 }
 return added;
}
export async function onboardKnownWork(){
 // These are confirmed snapshots, not live sync. No financial ledger is touched.
 const addedWorks=await changeProduction(data=>mergeKnownProduction(data));
 const state=await getState();
 const addedContacts=mergeKnownContacts(state);
 if(addedContacts>0)await saveState(state);
 return {addedWorks,addedContacts,source:SOURCE};
}
