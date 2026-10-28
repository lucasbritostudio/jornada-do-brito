import {createHash,timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {getState} from '@/lib/store';
import {readProduction} from '@/lib/production-store';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(req:Request){
  try{
    const body=await req.json();const token=String(body?.token||'');
    if(!/^[\w-]{30,100}$/.test(token))return NextResponse.json({error:'Link de acompanhamento inválido.'},{status:404});
    const digest=createHash('sha256').update(token).digest();
    const state=await getState();
    const request=state.clientRequests.find(item=>{
      if(!item.portalTokenHash)return false;
      const saved=Buffer.from(item.portalTokenHash,'hex');
      return saved.length===digest.length&&timingSafeEqual(saved,digest);
    });
    if(!request)return NextResponse.json({error:'Link de acompanhamento inválido.'},{status:404});
    const project=request.projectId?state.projects.find(item=>item.id===request.projectId):undefined;
    let productionStage:string|undefined;
    if(request.workId){const production=await readProduction();productionStage=production.works.find(item=>item.id===request.workId)?.stage;}
    const stages:Record<string,string>={planned:'Planejamento',scheduled:'Gravação agendada',captured:'Gravado',editing:'Em edição',review:'Enviado para avaliação',changes_requested:'Ajustes em andamento',approved:'Aprovado',delivered:'Entregue',cancelled:'Cancelado'};
    const projectStatus:Record<string,string>={planned:'Planejado',active:'Em andamento',waiting_client:'Aguardando você',review:'Em avaliação',completed:'Concluído',cancelled:'Cancelado'};
    return NextResponse.json({serviceName:request.serviceName,requestStatus:request.status==='pending'?'Aguardando revisão':request.status==='accepted'?'Pedido aprovado':'Pedido encerrado',progress:productionStage?stages[productionStage]:project?projectStatus[project.status]:'Aguardando análise',updatedAt:request.updatedAt},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Não foi possível consultar o pedido.'},{status:500});}
}
