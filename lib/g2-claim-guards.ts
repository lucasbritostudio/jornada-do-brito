/**
 * Proteção composicional e provas lógico-matemáticas delimitadas para G2.
 * Uma conclusão com DUAS alegações só é apoiada se TODAS forem demonstradas.
 * Expressões JavaScript NÃO são executadas; o escopo é um trecho sintético
 * isolado. "Insuficiente" nunca equivale a "falso".
 */
export type G2GuardResult={
 decision:'supported'|'contradicted'|'insufficient';
 reason:'compound_unproven'|'literal_operation'|'explicit_mismatch'|'unrecognized';
 explanation:string;
 experiment:string;
};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const result=(decision:G2GuardResult['decision'],reason:G2GuardResult['reason'],
 explanation:string,experiment:string):G2GuardResult=>({decision,reason,explanation,experiment});
const ID='[a-zA-Z_$][\\w$]*';
const compoundBoundary=/\b(?:e|mas|porem|alem\s+disso|bem\s+como)\s+(?=(?:pode|permite|consegue|garante|fica|continua|foi|sera|esta|existe|deleta|apaga|salva|persiste|sincroniza|envia|notifica|recebe|executa|execute|executar|roda|publica|modifica|altera|atualiza|remove|exclui|libera|funciona|executado|tem|gera|faz|conclui|todos?|todas?|qualquer|nao|somente|apenas)\b)/;
const extraPredicate=/(?:\be\s+(?:pode|permite|consegue|garante|fica|continua|foi|sera|esta|existe|deleta|apaga|salva|persiste|sincroniza|envia|notifica|recebe|executa|execute|executar|roda|publica|modifica|altera|atualiza|remove|exclui|libera|funciona|executado|tem|gera|faz|conclui|todos?|todas?|qualquer|nao|somente|apenas)\b)|(?:\b(?:mas|porem|alem\s+disso|bem\s+como)\b)/;
// Mesmo sem conectivo, alegação universal/futura demanda mais provas.
const globalPredicate=/(?:\b(?:todos?\s+os?\s+(?:clientes|usuarios|aparelhos)|qualquer\s+(?:usuario|pessoa)|para\s+sempre|em\s+producao|no\s+banco\s+de\s+dados|autorizacao|permissoes|garante\s+seguranca|com\s+sucesso|sem\s+autenticacao)\b)/;
const operationTerms=[
 {op:'+',r:/\b(?:soma|adicao|adiciona|somado)\b/},
 {op:'-',r:/\b(?:diferenca|subtracao|subtrai|menos)\b/},
 {op:'*',r:/\b(?:produto|multiplicacao|multiplica|vezes)\b/},
 {op:'/',r:/\b(?:divisao|divide|quociente|dividido)\b/},
 {op:'%',r:/\b(?:modulo|resto\s+da\s+divisao)\b/},
 {op:'**',r:/\b(?:potencia|exponenciacao|elevado)\b/},
 {op:'&&',r:/\b(?:conjuncao|operador\s+logico\s+e)\b|(?:\&\&)/},
 {op:'||',r:/\b(?:disjuncao|operador\s+logico\s+ou)\b|(?:\|\|)/},
 {op:'??',r:/\b(?:coalescencia\s+nula|nullish)\b|(?:\?\?)/},
 {op:'>=',r:/\b(?:maior\s+ou\s+igual)\b|(?:>=)/},
 {op:'<=',r:/\b(?:menor\s+ou\s+igual)\b|(?:<=)/},
 {op:'>',r:/\bmaior\s+que\b|(?:\s>\s)/},
 {op:'<',r:/\bmenor\s+que\b|(?:\s<\s)/},
 {op:'===',r:/\b(?:igualdade\s+estrita|identidade\s+estrita)\b|(?:===)/},
 {op:'!==',r:/\b(?:desigualdade\s+estrita)\b|(?:!==)/},
] as const;
/** Sem interpretar trechos incompletos como provas de comportamento global. */
export function guardG2Semantics(source:string,claimRaw:string):G2GuardResult|null{
 const claim=norm(claimRaw),src=source.replace(/\s+/g,' ').trim();
 if(/\b(?:nao|nunca|sem)\s+(?:recebe|usa|faz|realiza|e|representa|calcula)\b/.test(claim)||
    /\b(?:garantindo|implicando|portanto|assim\s+garante)\b/.test(claim)||
    /\be\s+(?:o|a|os|as)\s+(?:app|sistema|projeto|servidor|usuario|cliente|aplicacao|backend|banco|programa)\b/.test(claim))
  return result('insufficient','compound_unproven',
   'Negação ou efeito adicional não está comprovado apenas pela expressão citada.',
   'Dividir a afirmação em unidades verificáveis e pedir fontes para cada efeito.');
 if(extraPredicate.test(claim)||compoundBoundary.test(claim)||globalPredicate.test(claim))
  return result('insufficient','compound_unproven',
   'Há uma afirmação adicional ou global que não é demonstrada pelo trecho isolado.',
   'Separar todas as proposições materiais e pedir prova independente para cada uma.');
 const variable=src.match(new RegExp('^\\s*(?:const|let|var)\\s+('+ID+')\\s*=\\s*(!!|!)(\\s*'+ID+')\\s*;?\\s*$'));
 if(variable&&new RegExp('\\b'+variable[1].toLowerCase()+'\\b').test(claim)){
  const operand=variable[3].trim().toLowerCase();
  if(!new RegExp('\\b'+operand+'\\b').test(claim))return null;
  const booleanClaim=/\b(?:coercao\s+booleana|conversao\s+booleana|transforma\s+em\s+booleano|booleaniza)\b/.test(claim);
  const negClaim=/\b(?:negacao|inversao\s+logica|nega)\b/.test(claim);
  if(booleanClaim||negClaim){
   const supported=variable[2]==='!!'?booleanClaim:negClaim;
   return result(supported?'supported':'contradicted',supported?'literal_operation':'explicit_mismatch',
    'O operador unário explícito é '+variable[2]+'.',
    'Testar entrada true, false, null e objeto sintético.');
  }
 }
 // Só atesta o operador e os operandos de UMA atribuição; não atesta
 // o valor final de variáveis desconhecidas nem efeitos colaterais.
 const binary=src.match(new RegExp('^\\s*(?:const|let|var)\\s+('+ID+')\\s*=\\s*('+ID+'|\\d+(?:\\.\\d+)?)\\s*(\\*\\*|===|!==|>=|<=|&&|\\|\\||\\?\\?|[+*/%<>-])\\s*('+ID+'|\\d+(?:\\.\\d+)?)\\s*;?\\s*$'));
 if(binary&&new RegExp('\\b'+binary[1].toLowerCase()+'\\b').test(claim)){
  let matched=operationTerms.filter(x=>x.r.test(claim));
  if(/\bresto da divisao\b/.test(claim))matched=matched.filter(x=>x.op==='%');
  if(matched.length!==1)return null;
  // Se a frase enumera valores numéricos, conferir os operandos também.
  const referred=claim.match(/\b(?:de|entre|com)\s+(-?\d+(?:\.\d+)?)\s+(?:e|por|com)\s+(-?\d+(?:\.\d+)?)\b/);
  if(referred&&(/^\d/.test(binary[2])&&/^\d/.test(binary[4]))){
   const reversed=['+','*','&&','||','===','!=='].includes(binary[3])&&
    referred[1]===binary[4]&&referred[2]===binary[2];
   if(!reversed&&(referred[1]!==binary[2]||referred[2]!==binary[4]))
    return result('contradicted','explicit_mismatch','Os números alegados não coincidem com os operandos.',
     'Trocar um operando e exigir mudança de avaliação.');
  }
  const correct=matched[0].op===binary[3];
  return result(correct?'supported':'contradicted',correct?'literal_operation':'explicit_mismatch',
   'A linha atribui uma expressão cujo operador é '+binary[3]+'. Não comprova resultado em produção.',
   'Trocar o operador mantendo os operandos e observar a decisão.');
 }
 // toFixed recebe número literal: rejeitar precisão incompatível, sem
 // inventar sucesso de formatação universal.
 const fixed=src.match(/^\s*return\s+[\w$.]+\.toFixed\s*\(\s*(\d{1,2})\s*\)\s*;?$/);
 if(fixed&&/\b(?:casas?\s+decimais?|format)\w*/.test(claim)){
  const qty=/\b(?:uma|1)\s+casa\b/.test(claim)?1:
   /\b(?:duas|2)\s+casas\b/.test(claim)?2:
   /\b(?:tres|3)\s+casas\b/.test(claim)?3:
   Number(claim.match(/\b(\d{1,2})\s+casas?\s+decimais?\b/)?.[1]??NaN);
  if(Number.isInteger(qty)){
   const correct=qty===Number(fixed[1]);
   return result(correct?'supported':'contradicted',
    correct?'literal_operation':'explicit_mismatch',
    'O método toFixed recebe '+fixed[1]+' como argumento.', 
    'Alterar a precisão no teste de código sintético e comparar.');
  }
 }
 return null;
}
