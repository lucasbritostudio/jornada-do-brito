import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 buildPlanningEvidence,splitPlanningEvidence,proposalReferencesEvidence,
 completePlanningText,groundedPlanningFallback
} from '../lib/devops-planning';

test('trecho curto mantém todas as linhas e a numeração',()=>{
 const e=buildPlanningEvidence('function ask(){\n return true;\n}',500);
 assert.equal(e.truncated,false);
 assert.equal(e.totalLines,3);
 assert.deepEqual(e.visibleLines,[1,2,3]);
 assert.ok(e.excerpt.includes('L3: }'));
});
test('trecho longo omite explicitamente o meio, sem cortar linhas',()=>{
 const source=Array.from({length:100},(_,i)=>'function action'+i+'(){ return '+i+'; }').join('\n');
 const e=buildPlanningEvidence(source,1100);
 assert.equal(e.truncated,true);
 assert.equal(e.totalLines,100);
 assert.ok(e.excerpt.includes('OMITIDAS'));
 assert.ok(e.excerpt.includes('FONTE PARCIAL'));
 assert.ok(e.excerpt.length<=1100);
 const actualLines=e.excerpt.split('\n').filter(line=>/^L\d+: /.test(line));
 assert.deepEqual(actualLines.length,e.visibleLines.length);
 for(const line of actualLines){
  const number=Number(line.match(/^L(\d+):/)?.[1]);
  assert.equal(line,'L'+number+': '+source.split('\n')[number-1]);
 }
 assert.ok(!e.visibleLines.includes(50),'linhas do meio omitidas');
});
test('segredo é ocultado antes da seleção de evidências',()=>{
 const e=buildPlanningEvidence('const token = "segredo-privado";\nconst title="Olá";',500);
 assert.ok(!e.excerpt.includes('segredo-privado'));
 assert.ok(e.excerpt.includes('LINHA DE CONFIGURAÇÃO OCULTA'));
 assert.ok(e.excerpt.includes('const title='));
});
test('cada parte enviada ao LLM cabe no limite sem cortar a linha',()=>{
 const e=buildPlanningEvidence(Array.from({length:130},(_,i)=>'render '+i+' código real').join('\n'),3000);
 const parts=splitPlanningEvidence(e.excerpt,450);
 assert.ok(parts.length>1);
 assert.deepEqual(parts.join('\n'),e.excerpt);
 assert.ok(parts.every(part=>part.length<=450));
});
test('rejeita plano genérico, citação de linha escondida e linha inventada',()=>{
 const e=buildPlanningEvidence(Array.from({length:110},(_,i)=>'linha de interface '+i).join('\n'),950);
 assert.equal(proposalReferencesEvidence('O código tem erros graves.',e.visibleLines),false);
 assert.equal(proposalReferencesEvidence('Em L999 há erro.',e.visibleLines),false);
 const absent=Array.from({length:110},(_,i)=>i+1).find(n=>!e.visibleLines.includes(n));
 assert.ok(absent);
 assert.equal(proposalReferencesEvidence('Problema em L'+absent,e.visibleLines),false);
 assert.equal(proposalReferencesEvidence('Observe L1.',e.visibleLines),true);
});
test('resposta grande avisa quando foi abreviada, sem encerrar sem aviso',()=>{
 assert.equal(completePlanningText('curto'), 'curto');
 const result=completePlanningText('Parte 1.\nParte 2.\n'+'x'.repeat(2000),180);
 assert.ok(result.includes('Resposta abreviada'));
 assert.ok(!result.endsWith('xxx'));
});

test('falha da IA exibe prova local sem inventar defeitos',()=>{
 const lines=[
  "const [asking,setAsking]=useState(false);",
  "async function ask(e:React.FormEvent){",
  " setAsking(true);",
  " try{await fetch('/api/desenvolvimento/chat')}",
  " finally{setAsking(false)}",
  "}",
  "<button disabled={asking}>{asking?'Analisando…':'Perguntar à IA'}</button>"
 ].join('\n');
 const e=buildPlanningEvidence(lines,2400);
 const result=groundedPlanningFallback(e.excerpt,
  'Verifique se a função ask está completa e o indicador de carregamento aparece.');
 assert.match(result,/L2: async function ask/);
 assert.match(result,/\bL\d+:/);
 assert.match(result,/não comprovam falhas/);
 assert.ok(!/erro de compilação|função incompleta/i.test(result));
});

test('fallback não inventa linhas quando pergunta não aparece no código',()=>{
 const e=buildPlanningEvidence("export default function Hero(){return <h1>Teste</h1>}",1000);
 const answer=groundedPlanningFallback(e.excerpt,'Verifique o funcionamento do web socket na API');
 assert.match(answer,/Nenhuma linha relacionada/);
 assert.doesNotMatch(answer,/L\d+:/);
});

test('fallback não recupera dados omitidos nem revela segredos',()=>{
 const code=["const token = 'segredo-importante';",
  ...Array.from({length:100},(_,i)=>'let elemento'+i+' = '+i+';')].join('\n');
 const e=buildPlanningEvidence(code,900);
 const reply=groundedPlanningFallback(e.excerpt,'Analise token e segredo de pagamento');
 assert.ok(!reply.includes('segredo-importante'));
 assert.ok(!/L100:/.test(reply)||e.visibleLines.includes(100));
});
