import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {audit,getState,saveState} from '@/lib/store';
import {changeProduction} from '@/lib/production-store';
import {isBlobConflict} from '@/lib/blob-conflict';
import type {Project,Task} from '@/lib/types';
import type {Work} from '@/lib/production';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  try{await requireAuthenticated();const state=await getState();return NextResponse.json({requests:state.clientRequests.map(({portalTokenHash,...request})=>({...request,clientName:state.contacts.find(c=>c.id===request.contactId)?.name||'Cliente',email:state.contacts.find(c=>c.id===request.contactId)?.email,phone:state.contacts.find(c=>c.id===request.contactId)?.phone}))},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return NextResponse.json({error:error instanceof Error&&error.message==='UNAUTHORIZED'?'Não autorizado.':'Falha ao carregar pedidos.'},{status:error instanceof Error&&error.message==='UNAUTHORIZED'?401:500});}
}

export async function POST(req:Request){
  try{
    await requireAuthenticated();
    const body=await req.json();const id=String(body?.id||'');const action=body?.action;
    if(!id||!['accept','decline'].includes(action))return NextResponse.json({error:'Pedido ou ação inválidos.'},{status:400});
    const state=await getState();const request=state.clientRequests.find(item=>item.id===id);
    if(!request)return NextResponse.json({error:'Pedido não encontrado.'},{status:404});
    if(action==='decline'){
      if(request.status==='accepted')return NextResponse.json({error:'Um pedido já convertido em trabalho não pode ser recusado.'},{status:409});
      request.status='declined';request.updatedAt=new Date().toISOString();audit(state,{action:'client_request.declined',collection:'clientRequests',recordId:id});
      return NextResponse.json({ok:true,state:await saveState(state)});
    }
    const contact=state.contacts.find(item=>item.id===request.contactId);
    const opportunity=state.opportunities.find(item=>item.id===request.opportunityId);
    if(!contact||!opportunity)return NextResponse.json({error:'Dados do cliente incompletos.'},{status:409});
    const projectId=request.projectId||`client-project-${id}`;
    const workId=request.workId||`client-work-${id}`;
    const taskId=request.taskId||`client-task-${id}`;
    const project:Project=state.projects.find(item=>item.id===projectId)||{id:projectId,contactId:contact.id,opportunityId:opportunity.id,name:request.serviceName,status:'active',budgetCents:request.agreedPriceCents,projectType:'other',description:request.note,importKey:`client-request:${id}`,provenance:{kind:'system',label:'Contratação pelo site'},createdAt:request.createdAt,updatedAt:new Date().toISOString()};
    if(request.deliveryMode==='video'){
      const work:Work={id:workId,clientName:contact.name,contactId:contact.id,projectId,title:request.serviceName,stage:'planned',agreedFeeCents:request.agreedPriceCents,notes:request.note,createdAt:request.createdAt,updatedAt:new Date().toISOString(),history:[{stage:'planned',at:new Date().toISOString()}]};
      await changeProduction(data=>{if(!data.works.some(item=>item.id===workId))data.works.unshift(work);return workId;});
      request.workId=workId;
    }else if(!state.tasks.some(item=>item.importKey===`client-request:${id}`)){
      const task:Task={id:taskId,title:`Iniciar: ${request.serviceName}`,status:'todo',priority:'medium',contactId:contact.id,projectId,notes:request.note,importKey:`client-request:${id}`,provenance:{kind:'system',label:'Contratação pelo site'},createdAt:request.createdAt,updatedAt:new Date().toISOString()};
      state.tasks.unshift(task);request.taskId=taskId;
    }
    if(!state.projects.some(item=>item.id===projectId))state.projects.unshift(project);
    request.status='accepted';request.projectId=projectId;request.updatedAt=new Date().toISOString();
    contact.lifecycle='client';contact.updatedAt=request.updatedAt;
    opportunity.stage='won';opportunity.updatedAt=request.updatedAt;
    opportunity.certainty='confirmed';
    if(!state.receivables.some(item=>item.importKey===`client-request:${id}`))state.receivables.unshift({id:crypto.randomUUID(),contactId:contact.id,projectId,title:request.serviceName,amountCents:request.agreedPriceCents,certainty:'confirmed',status:'pending',notes:'Contratação aceita pelo responsável. Registrar recebimentos na Produção para conciliar com o Financeiro.',importKey:`client-request:${id}`,provenance:{kind:'system',label:'Contratação pelo site'},createdAt:request.createdAt,updatedAt:request.updatedAt});
    audit(state,{action:'client_request.accepted',collection:'clientRequests',recordId:id,summary:`Contrato convertido em produção: ${request.serviceName}`});
    return NextResponse.json({ok:true,state:await saveState(state)});
  }catch(error){
    if(isBlobConflict(error))return NextResponse.json({error:'Outra atualização foi salva. Recarregue os pedidos e tente de novo.'},{status:409});
    if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Não autorizado.'},{status:401});
    return NextResponse.json({error:'Não foi possível converter o pedido.'},{status:500});
  }
}
