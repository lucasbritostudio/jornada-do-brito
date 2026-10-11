import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateG2RouteChallenges} from '../lib/g2-engineering-challenges';
import {G2_ENGINEERING_V3} from './fixtures/g2-engineering-v3';

test('G2 V3 terceira amostra: mede casos realmente novos sem mudar detector',()=>{
 const r=evaluateG2RouteChallenges(G2_ENGINEERING_V3);
 assert.equal(r.total,16);
 assert.equal(r.positives,8);
 assert.equal(r.negatives,8);
 assert.equal(r.safeToPromote,false);
 assert.equal(r.correct+r.falseLinks.length+r.missedLinks.length,16);
 console.log('G2_ENGINEERING_V3_RESULTS='+JSON.stringify(r));
});
test('G2 V3 não executa snippets e não confunde respostas estáticas com runtime',()=>{
 const r=evaluateG2RouteChallenges(G2_ENGINEERING_V3);
 assert.ok(r.results.every(x=>!x.runtimeCauseConfirmed));
 const flipped=evaluateG2RouteChallenges([...G2_ENGINEERING_V3].reverse());
 assert.equal(r.correct,flipped.correct);
 assert.deepEqual(new Set(r.falseLinks),new Set(flipped.falseLinks));
 assert.deepEqual(new Set(r.missedLinks),new Set(flipped.missedLinks));
});
