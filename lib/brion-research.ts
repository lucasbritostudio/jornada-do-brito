/**
 * LUKBRIX: núcleo científico de evolução do Laboratório da Jornada.
 * Formula hipóteses falsificáveis, calcula prioridades e exige benchmark
 * ANTES de recomendar melhoria. NÃO edita código, treina modelos ou publica.
 * Todos os cálculos deste arquivo são locais, puros e sem custo de IA.
 */
export const LUKBRIX_NAME='LUKBRIX' as const;
export type BrionSignal=
 'approved'|'invalid_format'|'no_findings'|'invalid_citation'|'contradiction'|
 'unverified'|'provider_unavailable'|'provider_rate_limited'|'provider_timeout';

export type BrionResearchInput={
 signal:BrionSignal;
 factCount:number;
 sourceTruncated:boolean;
 filesExamined:number;
};
export type BrionOpportunity={
 name:typeof LUKBRIX_NAME;
 generation:'G1 — pesquisa assistida por evidências';
 status:'research_proposal_only';
 hypothesis:string;
 experiment:string;
 metric:string;
 falsification:string;
 safety:string;
 priorityIndex:number;
 priorityBasis:string;
};
type ResearchTemplate={
 hypothesis:string;experiment:string;metric:string;falsification:string;
 impact:number;cost:number;
};
// Hipóteses para um experimento futuro, NÃO descobertas ou defeitos confirmados.
const templates:Record<BrionSignal,ResearchTemplate>={
 contradiction:{
  hypothesis:'Verificar contraexemplos no corpo completo da função reduz conclusões contraditórias.',
  experiment:'Adicionar ao benchmark a conclusão rejeitada e uma variante verdadeira. Comparar antes/depois, sem pedir novo deploy.',
  metric:'Taxa de falsas conclusões aceitas = falsos aceitos / total de falsos testados.',
  falsification:'Se alguma conclusão falsa antes rejeitada passar a ser aceita, a hipótese de melhoria falhou.',
  impact:3,cost:1
 },
 invalid_citation:{
  hypothesis:'Traçar a origem de cada citação por arquivo e linha reduz referências falsas.',
  experiment:'Criar dois casos: citação correta e citação alterada por uma linha. Exigir aprovação apenas da correta.',
  metric:'Citações indevidas aceitas / total de citações indevidas testadas.',
  falsification:'Se a citação de linha ou arquivo trocado for aceita, a abordagem falhou.',
  impact:3,cost:1
 },
 invalid_format:{
  hypothesis:'Um contrato de saída mais simples pode diminuir respostas do modelo que não seguem JSON.',
  experiment:'Comparar formato atual com versão compacta usando exemplos fixos, sem encaminhar dados privados.',
  metric:'Respostas JSON válidas / total de respostas do mesmo conjunto de avaliação.',
  falsification:'Se não houver aumento em JSON válido ou houver perda de fatos corretos, não adotar a mudança.',
  impact:2,cost:2
 },
 no_findings:{
  hypothesis:'Uma pergunta que exige apenas fatos positivos pode ajudar o modelo a responder sem inventar defeitos.',
  experiment:'Comparar o mesmo caso de código sob dois enunciados, preservando fonte e modelo.',
  metric:'Afirmações positivas sustentadas / total de afirmações avaliadas.',
  falsification:'Se o modelo continuar sem citar fatos ou inventar defeitos, não há melhoria demonstrada.',
  impact:2,cost:2
 },
 unverified:{
  hypothesis:'Um verificador semântico incremental pode reduzir afirmações não comprovadas sem bloquear acertos.',
  experiment:'Adicionar casos negativos e positivos à suíte; medir rejeições indevidas e erros aceitos.',
  metric:'Taxas de verdadeiros aceitos e falsos rejeitados no mesmo conjunto.',
  falsification:'Se a nova regra bloquear acertos ou aceitar mais falhas, reprová-la.',
  impact:3,cost:2
 },
 approved:{
  hypothesis:'Testes adversariais de conclusões aceitas podem revelar limitações que os testes atuais não cobrem.',
  experiment:'Criar alterações controladas no código sintético: remover o r.ok, renomear função, trocar arquivo e alterar referência. Reexecutar a avaliação.',
  metric:'Casos falsos rejeitados / casos falsos avaliados, sem perder aceitação de casos verdadeiros.',
  falsification:'Se a proteção aceitar um caso falso ou rejeitar fatos que antes aceitava, não promover.',
  impact:3,cost:1
 },
 provider_unavailable:{
  hypothesis:'Diagnosticar indisponibilidade sem nova chamada de IA pode preservar informação útil e reduzir custos.',
  experiment:'Simular indisponibilidade do provedor e verificar resposta local, sem conexão externa.',
  metric:'Falhas classificadas corretamente / falhas simuladas; chamadas extras de IA = 0.',
  falsification:'Se tentar novamente ou revelar erros privados, a hipótese falhou.',
  impact:2,cost:1
 },
 provider_rate_limited:{
  hypothesis:'Um fallback de baixo custo evita retentativas desnecessárias após limite da API.',
  experiment:'Simular HTTP 429 e confirmar que não há segunda requisição.',
  metric:'Retentativas automáticas diante de 429 (meta: zero).',
  falsification:'Se acontecer qualquer retentativa automática, a mudança falhou.',
  impact:2,cost:1
 },
 provider_timeout:{
  hypothesis:'Encerrar a consulta e retornar fatos locais evita esperas excessivas.',
  experiment:'Simular timeout do modelo e confirmar resposta sem reenvio automático.',
  metric:'Chamadas extras e classificação correta de timeout.',
  falsification:'Se houver retentativa automática ou falsa confirmação, a mudança falhou.',
  impact:2,cost:1
 }
};
/** Índice ordinal matemático, não probabilidade de descoberta ou ganho real. */
export function createBrionOpportunity(input:BrionResearchInput):BrionOpportunity{
 if(!Number.isInteger(input.factCount)||input.factCount<0||input.factCount>100||
    !Number.isInteger(input.filesExamined)||input.filesExamined<1||input.filesExamined>2)
  throw new Error('BRION_INVALID_RESEARCH_INPUT');
 const source=templates[input.signal];
 if(!source)throw new Error('BRION_UNKNOWN_SIGNAL');
 const evidenceWeight=input.factCount>0?2:1;
 const contextPenalty=input.sourceTruncated?1:0;
 const priorityIndex=Math.max(1,
  Math.round(source.impact*evidenceWeight/(source.cost+1))-contextPenalty);
 return {
  name:LUKBRIX_NAME,generation:'G1 — pesquisa assistida por evidências',
  status:'research_proposal_only',
  hypothesis:source.hypothesis,
  experiment:source.experiment,
  metric:source.metric,
  falsification:source.falsification,
  safety:'Experimento isolado e reversível, com dados sintéticos. Nenhum arquivo, modelo, banco ou infraestrutura é modificado automaticamente. Revisão humana obrigatória para PR, merge e deploy.',
  priorityIndex,
  priorityBasis:'Índice ordinal = arredondar(impacto estimado × peso de evidências ÷ (custo relativo + 1)) − penalidade de fonte parcial. Não representa precisão, probabilidade ou ganho medido.'
 };
}
export function formatBrionOpportunity(opportunity:BrionOpportunity):string{
 return [
  opportunity.name+' — '+opportunity.generation,
  'Oportunidade de pesquisa (não é uma descoberta comprovada):',
  'Hipótese: '+opportunity.hypothesis,
  'Experimento para verificar: '+opportunity.experiment,
  'Métrica: '+opportunity.metric,
  'Quando rejeitar: '+opportunity.falsification,
  'Prioridade interna: '+opportunity.priorityIndex+' (heurística, não desempenho real).',
  'Proteção: '+opportunity.safety,
 ].join('\n');
}
export type BrionBenchmarkCounts={
 falseRejected:number;falseTotal:number;
 trueAccepted:number;trueTotal:number;
};
/** Métricas de casos ROTULADOS, nunca de exemplos hipotéticos ou saídas não auditadas. */
export function measureBrionBenchmark(c:BrionBenchmarkCounts){
 if(!Number.isSafeInteger(c.falseTotal)||!Number.isSafeInteger(c.trueTotal)||
    !Number.isSafeInteger(c.falseRejected)||!Number.isSafeInteger(c.trueAccepted)||
    c.falseTotal<=0||c.trueTotal<=0||
    c.falseRejected<0||c.falseRejected>c.falseTotal||
    c.trueAccepted<0||c.trueAccepted>c.trueTotal)
  throw new Error('BRION_INVALID_BENCHMARK');
 const falseRejectionRate=c.falseRejected/c.falseTotal;
 const trueAcceptanceRate=c.trueAccepted/c.trueTotal;
 return {falseRejectionRate,trueAcceptanceRate,
  balancedScore:(falseRejectionRate+trueAcceptanceRate)/2,
  cases:c.falseTotal+c.trueTotal};
}
/** Candidato só pode ser recomendado se NÃO regredir ou reduzir o conjunto. */
export function evaluateBrionPromotion(base:BrionBenchmarkCounts,next:BrionBenchmarkCounts){
 const baseline=measureBrionBenchmark(base),candidate=measureBrionBenchmark(next);
 const noRegression=candidate.falseRejectionRate>=baseline.falseRejectionRate&&
  candidate.trueAcceptanceRate>=baseline.trueAcceptanceRate;
 const coverage=next.falseTotal>=base.falseTotal&&next.trueTotal>=base.trueTotal;
 const improved=candidate.balancedScore>baseline.balancedScore;
 return {baseline,candidate,noRegression,coverage,improved,
  candidatePassesGate:noRegression&&coverage,
  automaticallyDeployable:false,
  requiresHumanApproval:true};
}
