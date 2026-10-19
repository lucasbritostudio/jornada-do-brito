import {createHash} from 'node:crypto';
import {get,put,list,del} from '@vercel/blob';
import webpush,{type PushSubscription} from 'web-push';

const FOLDER='jornada/devops-v3/push/';
const LIMIT=20;
type Stored={version:1;subscription:PushSubscription;createdAt:number};

export function pushConfigured(){
 return Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.BLOB_READ_WRITE_TOKEN);
}
export function publicVapidKey(){return pushConfigured()?process.env.VAPID_PUBLIC_KEY:null;}

export function validSubscription(s:unknown):s is PushSubscription{
 if(!s||typeof s!=='object')return false;
 const obj=s as Record<string,unknown>;
 if(typeof obj.endpoint!=='string'||obj.endpoint.length>1800)return false;
 let host='';
 try{const url=new URL(obj.endpoint);if(url.protocol!=='https:')return false;host=url.hostname.toLowerCase();}
 catch{return false;}
 // Evitar SSRF: receber apenas endpoints de push do navegador, não URLs arbitrárias.
 if(!(host==='web.push.apple.com'||host.endsWith('.push.apple.com')||
  host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'))return false;
 const keys=obj.keys as Record<string,unknown>|null;
 return Boolean(keys&&typeof keys.p256dh==='string'&&typeof keys.auth==='string'&&
  /^[A-Za-z0-9_-]{20,256}$/.test(keys.p256dh)&&/^[A-Za-z0-9_-]{10,128}$/.test(keys.auth));
}
function path(endpoint:string){return FOLDER+createHash('sha256').update(endpoint).digest('hex')+'.json';}
export async function subscribeOwnerPush(input:unknown){
 if(!pushConfigured())throw new Error('PUSH_NOT_CONFIGURED');
 if(!validSubscription(input))throw new Error('PUSH_INVALID');
 const current=await list({prefix:FOLDER,limit:LIMIT+1});
 if(current.blobs.length>=LIMIT&&!current.blobs.some(x=>x.pathname===path(input.endpoint)))
  throw new Error('PUSH_LIMIT_REACHED');
 const stored:Stored={version:1,subscription:input,createdAt:Date.now()};
 await put(path(input.endpoint),JSON.stringify(stored),{
  access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true,
 });
 return {ok:true};
}
export async function unsubscribeOwnerPush(input:unknown){
 if(!input||typeof input!=='object'||typeof (input as {endpoint?:unknown}).endpoint!=='string')
  throw new Error('PUSH_INVALID');
 const ep=(input as {endpoint:string}).endpoint;
 if(!validSubscription({...input,endpoint:ep}))throw new Error('PUSH_INVALID');
 const existing=await get(path(ep),{access:'private',useCache:false});
 if(existing?.blob?.url)await del(existing.blob.url);
 return {ok:true};
}
/** Emite no máximo vinte pushs por alerta, sem identificadores ou dados de clientes. */
export async function notifyOwnerReview(){
 if(!pushConfigured())return {sent:0};
 webpush.setVapidDetails('https://jornada-do-brito.vercel.app',
  process.env.VAPID_PUBLIC_KEY!,process.env.VAPID_PRIVATE_KEY!);
 const all=await list({prefix:FOLDER,limit:LIMIT});
 let sent=0;
 for(const item of all.blobs){
  try{
   const stored=await get(item.pathname,{access:'private',useCache:false});
   if(!stored?.stream)continue;
   const raw=await new Response(stored.stream).text();
   if(raw.length>5000)continue;
   const obj=JSON.parse(raw) as Stored;
   if(obj.version!==1||!validSubscription(obj.subscription))continue;
   await webpush.sendNotification(obj.subscription,JSON.stringify({
    title:'Jornada · Engenharia',body:'Há dados suficientes para revisar o ChefeBot na Central.',
   }),{TTL:3600,urgency:'normal'});
   sent++;
  }catch{
   // Uma assinatura expirada ou endpoint indisponível não bloqueia a coleta.
   // Nunca logar endpoints, chaves ou conteúdo de resposta do provedor.
  }
 }
 return {sent};
}
