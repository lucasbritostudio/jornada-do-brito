import { createHmac, timingSafeEqual } from 'node:crypto';
import { getState, saveState, audit } from '@/lib/store';
export const runtime='nodejs';

export async function GET(req:Request){const u=new URL(req.url);if(u.searchParams.get('hub.mode')==='subscribe'&&u.searchParams.get('hub.verify_token')===process.env.WHATSAPP_VERIFY_TOKEN)return new Response(u.searchParams.get('hub.challenge')||'',{status:200});return new Response('forbidden',{status:403});}

export async function POST(req:Request){
  const raw=await req.text();
  const secret=process.env.WHATSAPP_APP_SECRET;
  if(secret){const header=req.headers.get('x-hub-signature-256')||'';const expected='sha256='+createHmac('sha256',secret).update(raw).digest('hex');const a=Buffer.from(header),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return new Response('bad signature',{status:401});}
  let payload:any;try{payload=JSON.parse(raw)}catch{return new Response('ok')}
  const state=await getState();
  for(const entry of payload.entry||[])for(const change of entry.changes||[]){const value=change.value||{};for(const m of value.messages||[]){if(state.messages.some(x=>x.providerMessageId===m.id))continue;const waId=m.from;let contact=state.contacts.find(c=>c.phone===waId);const at=new Date(Number(m.timestamp||Date.now()/1000)*1000).toISOString();if(!contact){contact={id:crypto.randomUUID(),name:value.contacts?.find((c:any)=>c.wa_id===waId)?.profile?.name||waId,phone:waId,lifecycle:'prospect',source:'WhatsApp',createdAt:at,updatedAt:at};state.contacts.unshift(contact);}let conv=state.conversations.find(c=>c.contactId===contact!.id&&c.provider==='meta'&&c.status!=='archived');if(!conv){conv={id:crypto.randomUUID(),contactId:contact.id,provider:'meta',status:'waiting_me',unreadCount:0,createdAt:at,updatedAt:at};state.conversations.unshift(conv);}const text=m.text?.body||m.button?.text||m.interactive?.button_reply?.title||`[${m.type}]`;state.messages.unshift({id:crypto.randomUUID(),conversationId:conv.id,contactId:contact.id,direction:'inbound',text,providerMessageId:m.id,status:'received',createdAt:at});conv.unreadCount+=1;conv.status='waiting_me';conv.lastMessageAt=at;conv.updatedAt=at;audit(state,{action:'whatsapp.message.received',collection:'messages',recordId:m.id,summary:contact.name});}}
  await saveState(state);return new Response('ok',{status:200});
}
