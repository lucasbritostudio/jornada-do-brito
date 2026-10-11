/**
 * Etapa de autocorreção científica G2: do erro rotulado à hipótese.
 * O motor NÃO escreve código, não roda código gerado e não promove versões.
 */
import type {PairedProofAudit} from './g2-proof-evaluation';

export type G2RepairHypothesis={
 kind:'overconfident_claim'|'lost_valid_claim'|'insufficient_independent_evidence';
 observation:string;
 hypothesis:string;
 proposedChange:string;
 experiment:string;
 passCondition:string;
 severity:'blocker'|'review';
};
export type G2CorrectionPlan={
 releaseGate:'blocked'|'eligible_for_external_review';
 errorsFound:number;
 proposals:G2RepairHypothesis[];
 completedAutonomousChanges:0;
 requiresHumanReview:true;
 productionUnchanged:true;
};
export function proposeG2Corrections(result:PairedProofAudit):G2CorrectionPlan{
 const proposals:G2RepairHypothesis[]=[];
 if(result.falselyApprovedCases.length){
  proposals.push({
   kind:'overconfident_claim',severity:'blocker',
   observation:result.falselyApprovedCases.length+' afirmações rotuladas como falsas ainda foram aceitas: '+
    result.falselyApprovedCases.join(', '),
   hypothesis:'Uma linha pode provar apenas uma oração e não as promessas adicionais da mesma frase.',
   proposedChange:'Exigir comprovação independente para cada oração material da conclusão; se faltar, abster-se e pedir mais contexto. Considerar um parser AST restrito antes de generalizar.',
   experiment:'Criar pares mínimos em um conjunto de desenvolvimento, com operação real + promessa falsa de acesso, persistência ou resultado global. Preservar uma amostra inédita distinta.',
   passCondition:'Nenhuma afirmação falsa aprovada e nenhuma perda de casos verdadeiros previamente corretos.'
  });
 }
 if(result.correctClaimsWithheld.length){
  proposals.push({
   kind:'lost_valid_claim',severity:'blocker',
   observation:result.correctClaimsWithheld.length+' afirmações verdadeiras ficaram sem prova pelo verificador restrito: '+
    result.correctClaimsWithheld.join(', '),
   hypothesis:'A gramática reconhecida cobre menos operações do que o JavaScript efetivamente expressa.',
   proposedChange:'Expandir tipos de expressão comprováveis por AST e testar contraexemplos equivalentes; jamais inferir execução por leitura literal.',
   experiment:'Adicionar casos verdadeiros de expressões unárias e casos falsos com variáveis diferentes em treino; testar novamente em holdout novo.',
   passCondition:'Todos os acertos históricos preservados, sem afirmar fatos sobre código externo ou não visto.'
  });
 }
 if(!result.candidatePassesControlledGate){
  proposals.push({
   kind:'insufficient_independent_evidence',severity:'review',
   observation:'A porta matemática recusou promoção; a diferença de acertos não é uma validação geral do sistema.',
   hypothesis:'Um benchmark pequeno e parcialmente conhecido superestima generalização.',
   proposedChange:'Preparar mais casos sem reutilizar aqueles usados para ajustar regras e medir também abstenções e custo.',
   experiment:'Avaliação cega pré-registrada, comparação pareada e revisão externa dos rótulos; não usar a nova prova para escolher o candidato.',
   passCondition:'Sem regressão individual, melhora no conjunto independente e liberação humana de segurança/custos.'
  });
 }
 return {
  releaseGate:result.candidatePassesControlledGate?'eligible_for_external_review':'blocked',
  errorsFound:result.falselyApprovedCases.length+result.correctClaimsWithheld.length,
  proposals,completedAutonomousChanges:0,requiresHumanReview:true,productionUnchanged:true
 };
}
