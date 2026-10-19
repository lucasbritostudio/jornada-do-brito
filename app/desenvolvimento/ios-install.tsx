'use client';
import {useState} from 'react';

function vapidToBytes(key:string):Uint8Array<ArrayBuffer>{
 const base64=key.replace(/-/g,'+').replace(/_/g,'/');
 const padded=base64+'='.repeat((4-base64.length%4)%4);
 const binary=atob(padded);
 const result=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)result[i]=binary.charCodeAt(i);
 return result;
}
export default function InstallDevopsApp(){
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const [enabled,setEnabled]=useState(false);
 async function activate(){
  setBusy(true);setStatus('');
  try{
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))
    throw new Error('No iPhone, abra a Jornada instalada pela Tela de Início para permitir notificações.');
   const config=await fetch('/api/desenvolvimento/push',{cache:'no-store'}).then(r=>r.json());
   if(!config.publicKey)throw new Error('Notificações não configuradas neste ambiente.');
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw new Error('Notificações não autorizadas pelo iPhone.');
   const registration=await navigator.serviceWorker.register('/sw.js');
   await navigator.serviceWorker.ready;
   const existing=await registration.pushManager.getSubscription();
   const subscription=existing||await registration.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:vapidToBytes(config.publicKey),
   });
   const response=await fetch('/api/desenvolvimento/push',{
    method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
    body:JSON.stringify({action:'subscribe',subscription:subscription.toJSON()}),
   });
   if(!response.ok)throw new Error('Não foi possível registrar este iPhone para alertas.');
   setEnabled(true);setStatus('Notificações habilitadas neste aparelho.');
  }catch(e){setStatus(e instanceof Error?e.message:'Falha ao ativar notificações.');}
  finally{setBusy(false);}
 }
 return <section className="dc-panel" style={{marginBottom:20}}>
   <span className="dc-label">APP PARA IPHONE · ALERTAS TÉCNICOS</span>
   <h2>Jornada Dev no seu celular</h2>
   <p>No iPhone: abra este endereço no Safari, toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>, abra o novo ícone e depois permita as notificações.</p>
   <button type="button" className="dc-refresh" onClick={activate} disabled={busy||enabled}>
    {enabled?'Notificações ativadas':busy?'Configurando…':'Ativar notificações neste aparelho'}
   </button>
   {status&&<p role="status">{status}</p>}
   <p><small>Você recebe apenas alertas de engenharia, nunca conteúdo de clientes. O iOS exige instalação e permissão concedida no próprio iPhone.</small></p>
  </section>;
}
