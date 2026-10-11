import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateG2RouteChallenges} from '../lib/g2-engineering-challenges';
import {G2_ENGINEERING_V4} from './fixtures/g2-engineering-v4';
test('V4: 12 novos desafios de engenharia medidos antes de corrigir resultados',()=>{
 const r=evaluateG2RouteChallenges(G2_ENGINEERING_V4);
 assert.equal(r.total,12);
 assert.equal(r.positives,6);
 assert.equal(r.negatives,6);
 assert.equal(r.correct+r.falseLinks.length+r.missedLinks.length,12);
 assert.equal(r.safeToPromote,false);
 console.log('G2_ENGINEERING_V4_RESULTS='+JSON.stringify(r));
});
test('V4: não confundir vínculo estrutural com bug confirmado',()=>{
 const r=evaluateG2RouteChallenges(G2_ENGINEERING_V4);
 assert.ok(r.results.every(x=>!x.runtimeCauseConfirmed));
 assert.equal(r.correct,evaluateG2RouteChallenges([...G2_ENGINEERING_V4].reverse()).correct);
});
