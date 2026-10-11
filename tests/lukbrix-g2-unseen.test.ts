/**
 * Desafio realmente separado dos exemplos de seleção G2.
 * Avaliação manual de verdades/falsidades em cenários de UX, autenticação,
 * concorrência, erros, estado e aritmética. NÃO mede a LLM Groq em produção.
 */
import assert from 'node:assert/strict';
import {previouslyUnseenG2Cases} from './fixtures/g2-revealed';
import {test} from 'node:test';
import {auditG2OnUnseen} from '../lib/lukbrix-g2-unseen';
import {
 LUKBRIX_G2_SAMPLE_TRAIN,LUKBRIX_G2_SAMPLE_HOLDOUT
} from '../lib/lukbrix-g2-sandbox';



test('G2 no desafio externo revela as limitações reais do verificador',()=>{
 const r=auditG2OnUnseen(LUKBRIX_G2_SAMPLE_TRAIN,LUKBRIX_G2_SAMPLE_HOLDOUT,previouslyUnseenG2Cases);
 assert.equal(r.sampleCount,16);
 // Números da amostra rotulada independente, NÃO da capacidade do modelo Groq.
 assert.equal(r.baselineCorrect,10);
 assert.equal(r.candidateCorrect,10);
 assert.equal(r.baselineFalseRejectionRate,0.25);
 assert.equal(r.candidateFalseRejectionRate,0.25);
 assert.equal(r.candidateTrueAcceptanceRate,1);
 assert.ok(r.candidateCorrect!==null);
 assert.ok(r.candidateCorrect! <= 16);
 assert.ok(r.candidateCorrect! < 16,'um filtro de citações não prova a interpretação');
 assert.ok(r.unresolvedFalseCases.length>0);
 assert.ok(r.unresolvedFalseCases.includes('novel-authorization'));
 assert.ok(r.unresolvedFalseCases.includes('novel-retry'));
 assert.ok(r.unresolvedFalseCases.includes('novel-wrong-value'));
 assert.equal(r.verdict,'generalization_failed');
 assert.equal(r.readyForFurtherReview,false);
 assert.equal(r.readyForDeployment,false);
});

test('G2 nunca troca de política com base no desafio separado',()=>{
 const a=auditG2OnUnseen(LUKBRIX_G2_SAMPLE_TRAIN,LUKBRIX_G2_SAMPLE_HOLDOUT,previouslyUnseenG2Cases);
 const shuffled=[...previouslyUnseenG2Cases].reverse();
 const b=auditG2OnUnseen(LUKBRIX_G2_SAMPLE_TRAIN,LUKBRIX_G2_SAMPLE_HOLDOUT,shuffled);
 assert.equal(a.verdict,b.verdict);
 assert.equal(a.candidateCorrect,b.candidateCorrect);
 assert.equal(a.candidateFalseRejectionRate,b.candidateFalseRejectionRate);
 assert.equal(a.candidateTrueAcceptanceRate,b.candidateTrueAcceptanceRate);
});

test('G2 evita vazamento mesmo com identificador diferente mas texto igual',()=>{
 const copy=previouslyUnseenG2Cases.map(c=>({...c}));
 copy[0]={...copy[0],sourceLine:LUKBRIX_G2_SAMPLE_TRAIN[0].sourceLine,
  quote:LUKBRIX_G2_SAMPLE_TRAIN[0].quote,claim:LUKBRIX_G2_SAMPLE_TRAIN[0].claim};
 assert.throws(()=>auditG2OnUnseen(LUKBRIX_G2_SAMPLE_TRAIN,LUKBRIX_G2_SAMPLE_HOLDOUT,copy),
  /G2_NOVEL_LEAK_OR_INVALID/);
});
test('G2 rejeita desafio desequilibrado e entradas insuficientes',()=>{
 assert.throws(()=>auditG2OnUnseen(
  LUKBRIX_G2_SAMPLE_TRAIN,LUKBRIX_G2_SAMPLE_HOLDOUT,previouslyUnseenG2Cases.slice(0,4)
 ),/G2_NOVEL_INVALID_SIZE/);
 const tooFewTrue=previouslyUnseenG2Cases.slice(0,12);
 assert.throws(()=>auditG2OnUnseen(
  LUKBRIX_G2_SAMPLE_TRAIN,LUKBRIX_G2_SAMPLE_HOLDOUT,tooFewTrue
 ),/G2_NOVEL_INVALID_SIZE|G2_NOVEL_UNBALANCED/);
});
