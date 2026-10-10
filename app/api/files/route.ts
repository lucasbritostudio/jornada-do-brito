import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAuthenticated } from '@/lib/auth';
import { getState, saveState, audit } from '@/lib/store';
export const runtime='nodejs';
export async function POST(req:Request){
  try{await requireAuthenticated();const form=await req.formData();const file=form.get('file');if(!(file instanceof File))return NextResponse.json({error:'Arquivo ausente'},{status:400});if(file.size>15*1024*1024)return NextResponse.json({error:'Limite atual: 15 MB por arquivo.'},{status:413});const id=crypto.randomUUID();const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-');const pathname=`jornada/files/${id}-${safe}`;await put(pathname,file,{access:'private',addRandomSuffix:false});const state=await getState();state.files.unshift({id,name:file.name,pathname,contentType:file.type,size:file.size,ownerType:String(form.get('ownerType')||''),ownerId:String(form.get('ownerId')||''),createdAt:new Date().toISOString()});audit(state,{action:'file.upload',collection:'files',recordId:id,summary:file.name});await saveState(state);return NextResponse.json({ok:true,id});}catch(e){if(e instanceof Error&&e.message==='UNAUTHORIZED')return NextResponse.json({error:'Não autorizado'},{status:401});return NextResponse.json({error:'Falha no upload'},{status:500});}
}
