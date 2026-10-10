import { requireAuthenticated } from '@/lib/auth';
import { getState } from '@/lib/store';
export async function GET(){ try{await requireAuthenticated(); const s=await getState(); return new Response(JSON.stringify(s,null,2),{headers:{'content-type':'application/json','content-disposition':`attachment; filename="jornada-backup-${new Date().toISOString().slice(0,10)}.json"`}});}catch{return new Response('Não autorizado',{status:401});} }
