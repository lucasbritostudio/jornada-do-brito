// Browser smoke under synthetic owner session. No production data or secrets.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:3188';
const secret=process.env.JORNADA_SESSION_SECRET;
assert.ok(secret&&secret.length>=20,'Defina JORNADA_SESSION_SECRET sintético para testes.');
const payload=Buffer.from(JSON.stringify({sub:'owner',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const signature=createHmac('sha256',secret).update(payload).digest('base64url');
const cookie=payload+'.'+signature;
const browser=await chromium.launch({headless:true});
const errors=[];
let works=[{
 id:'mock-video-garreto',clientName:'Cliente Fictício',
 title:'Vídeo simulado de teste',stage:'planned',createdAt:'2026-10-10T12:00:00.000Z',
 clock:null,urgency:'not_started',payment:{receivedCents:0,remainingCents:20000,status:'unpaid'},
 agreedFeeCents:20000
}];
let posts=0;
const clock={startedAt:'2026-10-14T03:00:00.000Z',
 targetAt:'2026-10-16T03:00:00.000Z',dueAt:'2026-10-17T03:00:00.000Z'};
try{
 for(const width of [375,390,430,768]){
  const context=await browser.newContext({
   viewport:{width,height:844},deviceScaleFactor:2,isMobile:width<500,hasTouch:width<500
  });
  await context.addCookies([{name:'jornada_session',value:cookie,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/api/state',route=>route.fulfill({
   status:200,contentType:'application/json',body:JSON.stringify({contacts:[{id:'test-contact',name:'Cliente Fictício'}]})
  }));
  await page.route('**/api/production',async route=>{
   if(route.request().method()==='POST'){
    posts+=1;
    const req=route.request().postDataJSON();
    if(req.action==='stage'){
     const w=works.find(x=>x.id===req.workId);
     if(w){
      w.stage=req.stage;
      if(req.stage==='captured'){w.capturedAt=req.capturedAt;w.clock=clock;w.urgency='on_track';}
      if(req.stage==='review'){w.firstReviewSentAt=new Date().toISOString();w.urgency='waiting_client';}
     }
    }
    if(req.action==='create'){
     works.unshift({...works[0],id:req.operationId,clientName:req.clientName,title:req.title});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,id:req.workId||req.operationId})});
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    works,conflicts:[],bookingConflicts:[],payments:[],snapshotAt:new Date().toISOString()
   })});
  });
  const response=await page.goto(origin+'/producao',{waitUntil:'networkidle'});
  assert.equal(response.status(),200,'Página autenticada deve abrir.');
  assert.match(await page.locator('h1').innerText(),/Produção/);
  await page.getByText('Vídeo simulado de teste').first().waitFor();
  const sizes=await page.evaluate(()=>({
    viewport:document.documentElement.clientWidth,
    document:document.documentElement.scrollWidth,
    main:document.querySelector('main')?.getBoundingClientRect().width
  }));
  assert.ok(sizes.document<=sizes.viewport+2,`Overflow horizontal ${width}: ${JSON.stringify(sizes)}`);
  assert.ok(sizes.main<=sizes.viewport+2,'Painel precisa caber na tela');
  if(width===390){
    await page.getByRole('button',{name:'Concluí a gravação'}).click();
    await page.getByLabel('Data de conclusão da gravação').fill('2026-10-13T18:00');
    await page.getByRole('button',{name:'Confirmar captação'}).click();
    await page.getByText('16/10/2026').first().waitFor({timeout:6000}).catch(()=>{});
    assert.ok(posts>=1,'Captação precisa acionar API');
    assert.ok(await page.getByText('Prazo 72h').count()>0);
  }
  console.log('MOBILE_OK',width,JSON.stringify(sizes));
  await context.close();
 }
 assert.deepEqual(errors,[],'Sem exceções no navegador');
 console.log('PASS: emulação responsiva de iPhone, interação de gravação e painéis.');
}finally{await browser.close();}
