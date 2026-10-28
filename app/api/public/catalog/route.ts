import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {getState,saveState,audit} from '@/lib/store';
import {isBlobConflict} from '@/lib/blob-conflict';
import type {ClientRequest,Opportunity} from '@/lib/types';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  try{
    const state=await getState();
    const services=state.serviceCatalog.filter(item=>item.published&&item.name.trim()&&item.description.trim()&&Number.isSafeInteger(item.priceCents)&&item.priceCents>=0).map(({id,name,description,priceCents,deliveryLabel,portfolioImageUrl,portfolioLinks})=>({id,name,description,priceCents,deliveryLabel,portfolioImageUrl:publicHttpsUrl(portfolioImageUrl),portfolioLinks:(portfolioLinks||[]).map(publicHttpsUrl).filter((value):value is string=>Boolean(value)).slice(0,10)}));
    return NextResponse.json({brand:state.profile.displayName,services},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Catálogo indisponível.'},{status:503});}
}

function publicHttpsUrl(value?:string){try{const url=new URL(value||'');return url.protocol==='https:'?url.toString():undefined;}catch{return undefined;}}

export async function POST(req:Request){
  try{
    const raw=await req.text();
    if(new TextEncoder().encode(raw).byteLength>12_000)return NextResponse.json({error:'Pedido muito grande.'},{status:413});
    let body:Record<string,unknown>;
    try{body=JSON.parse(raw) as Record<string,unknown>;}catch{return NextResponse.json({error:'Pedido inválido.'},{status:400});}
    if(typeof body?.website==='string'&&body.website.trim())return NextResponse.json({ok:true});
    const id=String(body?.requestId||'');
    const portalToken=String(body?.portalToken||'');
    const name=String(body?.name||'').trim().slice(0,120);
    const email=String(body?.email||'').trim().toLowerCase().slice(0,254);
    const phone=String(body?.phone||'').trim().slice(0,40);
    const serviceId=String(body?.serviceId||'');
    const note=String(body?.note||'').trim().slice(0,1200);
    if(!/^[\w-]{20,80}$/.test(id)||!/^[\w-]{30,100}$/.test(portalToken)||name.length<2||(!email&&!phone)||
      (email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||body?.consent!==true)
      return NextResponse.json({error:'Confira nome, contato e autorização para receber retorno.'},{status:400});
    const state=await getState();
    if(state.clientRequests.some(item=>item.id===id))return NextResponse.json({ok:true,id});
    const service=state.serviceCatalog.find(item=>item.id===serviceId&&item.published);
    if(!service)return NextResponse.json({error:'Esse serviço não está disponível.'},{status:400});
    if(state.clientRequests.length>=5000||state.opportunities.length>=10000)
      return NextResponse.json({error:'Não foi possível receber novos pedidos agora.'},{status:503});
    const at=new Date().toISOString();
    const phoneDigits=phone.replace(/\D/g,'');
    let contact=state.contacts.find(item=>(email&&item.email?.toLowerCase()===email)||(phoneDigits&&item.phone?.replace(/\D/g,'')===phoneDigits));
    if(!contact){
      contact={id:crypto.randomUUID(),name,...(email?{email}:{}),...(phone?{phone}:{}),lifecycle:'prospect',source:'site_jornada',createdAt:at,updatedAt:at};
      state.contacts.unshift(contact);
    }else{
      contact.name=name;if(phone)contact.phone=phone;if(email)contact.email=email;contact.updatedAt=at;
    }
    const opportunity:Opportunity={id:crypto.randomUUID(),contactId:contact.id,title:service.name,stage:'new',estimatedValueCents:service.priceCents,certainty:'pending',notes:note||undefined,importKey:`public-request:${id}`,provenance:{kind:'system',label:'Pedido pelo site'},createdAt:at,updatedAt:at};
    state.opportunities.unshift(opportunity);
    const request:ClientRequest={id,contactId:contact.id,opportunityId:opportunity.id,serviceId,serviceName:service.name,deliveryMode:service.deliveryMode==='general'?'general':'video',agreedPriceCents:service.priceCents,note:note||undefined,portalTokenHash:createHash('sha256').update(portalToken).digest('hex'),status:'pending',createdAt:at,updatedAt:at};
    state.clientRequests.unshift(request);
    audit(state,{action:'client_request.created',collection:'clientRequests',recordId:id,summary:`Pedido de contratação: ${service.name}`});
    await saveState(state);
    return NextResponse.json({ok:true,id},{status:201});
  }catch(error){
    if(isBlobConflict(error))return NextResponse.json({error:'Pedido recebido em outra sessão. Tente novamente.'},{status:409});
    return NextResponse.json({error:'Não foi possível enviar o pedido.'},{status:500});
  }
}
