import {createHash,timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {syncChefeBotMonitor} from '@/lib/devops-monitor-sync';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){
 if(process.env.VERCEL_ENV==='preview')return NextResponse.json({error:'disabled'},{status:503,headers});
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32)return NextResponse.json({error:'not_configured'},{status:503,headers});
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!timingSafeEqual(createHash('sha256').update(secret).digest(),createHash('sha256').update(token).digest()))
  return NextResponse.json({error:'unauthorized'},{status:401,headers});
 try{
  const result=await syncChefeBotMonitor();
  return NextResponse.json({ok:true,source:result.source,reused:result.reused,readiness:result.readiness.status,threshold:result.justReachedThreshold},{headers});
 }catch{
  return NextResponse.json({error:'monitor_sync_failed'},{status:503,headers});
 }
}
