import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState, saveState, audit } from '@/lib/store';
import type { WorkspaceState } from '@/lib/types';

export const runtime = 'nodejs';
const allowed = new Set(['contacts','opportunities','projects','financialAccounts','transactions','debts','goals','tasks','conversations','messages']);

export async function GET(){
  try{ await requireAuthenticated(); return NextResponse.json(await getState()); }
  catch{ return NextResponse.json({error:'Não autorizado.'},{status:401}); }
}

export async function POST(req:Request){
  try{
    await requireAuthenticated();
    const body=await req.json();
    const state=await getState();
    if(body.operation==='profile'){
      state.profile={...state.profile,...body.record};
      audit(state,{action:'profile.update',summary:'Perfil atualizado'});
      return NextResponse.json(await saveState(state));
    }
    const collection=String(body.collection||'');
    if(!allowed.has(collection)) return NextResponse.json({error:'Coleção inválida.'},{status:400});
    const arr=(state as unknown as Record<string,unknown[]>)[collection];
    if(body.operation==='delete'){
      const idx=arr.findIndex((x:any)=>x.id===body.id);
      if(idx>=0) arr.splice(idx,1);
      audit(state,{action:'record.delete',collection,recordId:body.id});
    } else if(body.operation==='upsert') {
      const at=new Date().toISOString();
      const record={...body.record,updatedAt:at};
      if(!record.id){record.id=crypto.randomUUID();record.createdAt=at;}
      const idx=arr.findIndex((x:any)=>x.id===record.id);
      if(idx>=0) arr[idx]={...(arr[idx] as object),...record}; else arr.unshift(record);
      audit(state,{action:idx>=0?'record.update':'record.create',collection,recordId:record.id,summary:record.title||record.name||record.description||record.creditorName});
    } else return NextResponse.json({error:'Operação inválida.'},{status:400});
    return NextResponse.json(await saveState(state as WorkspaceState));
  }catch(e){
    if(e instanceof Error && e.message==='UNAUTHORIZED') return NextResponse.json({error:'Não autorizado.'},{status:401});
    return NextResponse.json({error:'Não foi possível salvar.'},{status:500});
  }
}
