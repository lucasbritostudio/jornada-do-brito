import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateG2RouteChallenges} from '../lib/g2-engineering-challenges';
import {G2_ENGINEERING_V2} from './fixtures/g2-engineering-v2';

test('16 desafios V2 — resultado reportado sem reajustar detector após observar erros',()=>{
 const r=evaluateG2RouteChallenges(G2_ENGINEERING_V2);
 assert.equal(r.total,16);
 assert.equal(r.positives,8);
 assert.equal(r.negatives,8);
 assert.equal(r.baselineAlwaysLinkCorrect,8);
 assert.equal(r.safeToPromote,false);
 assert.equal(r.correct+r.falseLinks.length+r.missedLinks.length,16);
 console.log('G2_ENGINEERING_V2_RESULTS='+JSON.stringify(r));
});
test('G2 V2: resultado não depende de ordem, rótulos nem execução de código',()=>{
 const a=evaluateG2RouteChallenges(G2_ENGINEERING_V2);
 const b=evaluateG2RouteChallenges([...G2_ENGINEERING_V2].reverse());
 assert.equal(a.correct,b.correct);
 assert.deepEqual(new Set(a.missedLinks),new Set(b.missedLinks));
 for(const row of a.results)assert.equal(row.runtimeCauseConfirmed,false);
});
