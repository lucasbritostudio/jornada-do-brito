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
type SeedOpportunity={key:string;contactKey:string;title:string;stage:'new'|'proposal';notes:string;next:string};
const OPPORTUNITIES:SeedOpportunity[]=[
 {key:'arte-print',contactKey:'arte-print',title:'Arte Print — proposta de 4 Reels',stage:'proposal',
  notes:'Proposta verbal de R$1.000 para quatro vídeos aguardando aprovação dos proprietários; NÃO é contrato ou dinheiro confirmado.',
  next:'Aguardar resposta dos proprietários via Alan.'},
 {key:'mundo-do-celular',contactKey:'mundo-do-celular',title:'Mundo do Celular — portfólio enviado',stage:'new',
  notes:'Amostras de vídeos enviadas em 10/10. Sem resposta até o registro da fonte; contrato/valor/prazo inexistentes.',
  next:'Se não responder, enviar acompanhamento cordial terça 13/10.'},
 {key:'max-naiara',contactKey:'max-naiara',title:'Max/Naiara — vídeo da loja iPhone',stage:'new',
  notes:'R$250 apenas estimados; valor e aceite ainda não confirmados.',
  next:'Confirmar interesse e orçamento antes de agendar.'},
 {key:'berg-alves',contactKey:'berg-alves',title:'Berg Alves — possível parceria de eventos',stage:'new',
  notes:'Oportunidade sem contrato e sem data definida.',
  next:'Aguardar oportunidade concreta.'}
];
const TASKS=[
 {key:'garreto',title:'Garreto — organizar gravação do vídeo 01',
  note:'Gravação prevista para terça 13/10, sem horário confirmado. Não marcar hora sem falar com o cliente.',contactKey:'garreto'},
 {key:'julianny',title:'Julianny — verificar pagamento pendente de R$200',
  note:'Captação já entregue. Aguardar prazo combinado de 12–13/10 antes de cobrar.',contactKey:'julianny-nisilene'},
 {key:'mundo',title:'Mundo do Celular — acompanhar portfólio enviado',
  note:'Se continuar sem resposta, um contato cordial terça 13/10; nenhuma reunião está marcada.',contactKey:'mundo-do-celular'},
 {key:'arte',title:'Arte Print — confirmar decisão dos donos',
  note:'Proposta de R$1.000/4 Reels ainda depende dos proprietários. Não agendar captação nem lançar sinal como recebido.',contactKey:'arte-print'}
];
function seedContactId(state:WorkspaceState,key:string){
 const c=SEED_CONTACTS.find(x=>x.key===key);
 return state.contacts.find(x=>x.importKey==='onboard-jornada-'+key || c&&normalize(x.name)===normalize(c.name))?.id;
}
export function mergeKnownPipeline(state:WorkspaceState,at=START){
 let opportunities=0,tasks=0;
 for(const item of OPPORTUNITIES){
  const key='onboard-jornada-prospect-'+item.key;
  if(state.opportunities.some(o=>o.importKey===key||normalize(o.title)===normalize(item.title)))continue;
  state.opportunities.push({id:key,title:item.title,stage:item.stage,
   contactId:seedContactId(state,item.contactKey),
   notes:item.notes,nextAction:item.next,importKey:key,
   provenance:{kind:'drive_import',label:SOURCE,updatedAt:at},
   createdAt:at,updatedAt:at});opportunities++;
 }
 for(const item of TASKS){
  const key='onboard-jornada-task-'+item.key;
  if(state.tasks.some(t=>t.importKey===key||normalize(t.title)===normalize(item.title)))continue;
  state.tasks.push({id:key,title:item.title,status:'todo',
   priority:item.key==='garreto'||item.key==='julianny'?'high':'medium',
   contactId:seedContactId(state,item.contactKey),
   notes:item.note,importKey:key,
   provenance:{kind:'drive_import',label:SOURCE,updatedAt:at},
   createdAt:at,updatedAt:at});tasks++;
 }
 return {opportunities,tasks};
}
export async function onboardKnownWork(){
 // These are confirmed snapshots, not live sync. No financial ledger is touched.
 const addedWorks=await changeProduction(data=>mergeKnownProduction(data));
 const state=await getState();
 const addedContacts=mergeKnownContacts(state);
 const addedPipeline=mergeKnownPipeline(state);
 if(addedContacts>0||addedPipeline.opportunities>0||addedPipeline.tasks>0)await saveState(state);
 return {addedWorks,addedContacts,...addedPipeline,source:SOURCE};
}
