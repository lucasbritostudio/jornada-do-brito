import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 buildPlanningEvidence,splitPlanningEvidence,proposalReferencesEvidence,
 completePlanningText
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
